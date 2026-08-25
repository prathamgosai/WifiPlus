/**
 * WifiPlus — static site shell.
 *
 * All measurement, scoring, history and permalink logic lives in `core/`, which
 * the Next.js app in `web/` imports from too. This file is deliberately only the
 * DOM layer for that engine: rendering, wiring and page state. Anything that
 * computes a number belongs in core, so the two front ends can never disagree.
 */
import { BASE_STOPS, fractionFor, labelFor, needleAngle, pointOnArc, scaleFor } from "./core/gauge.js";
import {
  BADGE_TEXT,
  METRIC_KEYS,
  MetricState,
  createMetricStates,
  isMeasured,
  settle,
} from "./core/metric-state.js";
import { debugEnabled, log, logError } from "./core/test-logger.js";
import { detectNetwork, localNetInfo } from "./core/netinfo.js";
import { bufferbloatVerdict, healthVerdict, qualityScores } from "./core/scoring.js";
import { clearHistory, downloadDelta, loadHistory, saveHistoryEntry } from "./core/history.js";
import { resultFromHash, resultLink } from "./core/permalink.js";
import { generateAiDiagnosis } from "./core/ai-doctor.js";
import { healthBand } from "./core/health.js";
// The report renderers are imported eagerly and the 3D scene is not: the report
// has to be ready the instant the latency phase ends (a module fetch mid-run
// would be measured by the run), while the scene is decoration that must never
// be on the critical path.
import {
  renderBufferbloat as paintBufferbloat,
  renderDoctor,
  renderHealth,
  renderHistory as paintHistory,
  renderPath,
  renderQuality,
  renderTechnical,
  resetReport,
  revealReport,
} from "./ui/report.js";
import { renderLatencyChart } from "./ui/latency-chart.js";

const qs = (selector) => document.querySelector(selector);
const qsa = (selector) => Array.from(document.querySelectorAll(selector));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rand = (min, max) => Math.random() * (max - min) + min;

const state = {
  download: null,
  upload: null,
  ping: null,
  jitter: null,
  loss: null,
  dns: null,
  stability: null,
  health: null,
  network: null,
  bufferbloat: null,
  // Provenance for the report: which edge served the run, and whether anything
  // about the run itself makes its numbers less trustworthy.
  edgeLabel: null,
  degraded: false,
  // The run's own assessment and the evidence behind it. Held on state so the
  // technical drawer, the exported JSON and the verdict pill all read the same
  // record rather than each reconstructing one.
  quality: null,
  evidence: null,
  downloadBloat: null,
  uploadBloat: null,
  uploadNote: null,
  scopedGlobal: false,
  ranking: "world"
};

let activeTestController = null;

/**
 * Interface copy.
 * -----------------------------------------------------------------------------
 * English is the source of truth and every other language falls back to it key
 * by key, so a partially translated locale shows translated strings where they
 * exist and correct English where they do not — never a raw key, and never a
 * layout broken by a missing string.
 *
 * Nothing that states a MEASUREMENT is translated by string substitution: the
 * numbers, units and badge states are formatted from the data, so a translation
 * cannot accidentally change what the page claims was measured.
 */
const EN = {
  // Navigation
  navSpeedTest: "Speed Test",
  navAnalyzer: "WiFi Analyzer",
  navPing: "Ping",
  navIsp: "ISP Intelligence",
  navTools: "Tools",

  // Hero
  eyebrow: "Real-time internet intelligence",
  heroTitle: "Test your <em>internet</em>.",
  heroCopy: "Measure real-world download, upload, latency and stability from your browser.",
  startTest: "Start test",
  startSub: "Measure your connection",
  testing: "Testing…",
  testAgain: "Test again",
  stopTest: "Stop test",
  seeReport: "See full report",
  trust1: "No signup",
  trust2: "No ads",
  trust3: "Every figure measured or marked unavailable",
  trust4: "History stays on this device",

  // Dial
  dialReady: "Ready",
  dialNote: "About 12 seconds of real data transfer.",
  phaseFinding: "Finding edge",
  phasePing: "Ping",
  phaseDownload: "Download",
  phaseUpload: "Upload",
  noteFinding: "Choosing the closest measurement edge by round-trip time.",
  noteDone: "Measured end to end, from this browser to the edge.",

  // Phase copy
  copySelect: "Selecting the nearest measurement edge by latency…",
  copyLatency: "Measuring ping, jitter, percentiles, packet loss and DNS…",
  copyDownload: "Measuring download throughput and latency under load…",
  copyUpload: "Measuring upload throughput…",
  noteSelect: "Choosing the closest measurement edge by round-trip time.",
  noteLatency: "Probing round-trip time, and watching the tail.",
  noteDownload: "Eight parallel streams, six-second window.",
  noteUpload: "Four parallel streams, four-second window.",

  // Status
  statusReady:
    "Ready. About 12 seconds: latency probing with percentiles and probe loss, a 6-second download window, a 4-second upload window, plus DNS and latency under load.",
  statusStarting: "Starting the measurement engine…",
  statusCancelled: "Test cancelled. No result was recorded — press Start to run a fresh measurement.",

  // Connection strip
  provider: "Provider",
  yourAddress: "Your address",
  measurementEdge: "Measurement edge",
  client: "Client",
  noAppNoAds: "No app, no ads, no signup",

  // Metrics
  download: "Download",
  upload: "Upload",
  ping: "Ping",
  jitter: "Jitter",
  dnsLatency: "DNS latency",
  stability: "Stability",
  loadedLatency: "Loaded latency",
  bufferbloat: "Bufferbloat",

  // Report
  yourResult: "Your result",
  connectionReport: "Connection report",
  downloadCardBtn: "Download result card",
  shareBtn: "Share",
  copyLinkBtn: "Copy link",
  copyJsonBtn: "Copy JSON",
  howScored: "How this score is calculated",
  gaming: "Gaming",
  streaming: "4K streaming",
  videoCalls: "Video calls",
  workFromHome: "Work from home",
  latencyDistribution: "Latency distribution",
  min: "Min",
  median: "Median",
  max: "Max",
  bufferbloatTitle: "Latency under load · bufferbloat",
  idleLatency: "Idle latency",
  addedUnderLoad: "Added under load",
  technicalDetails: "Technical details",
  networkPath: "Where the bottleneck probably is",
  hopDevice: "This device",
  hopWifi: "WiFi link",
  hopRouter: "Router",
  hopIsp: "ISP",
  hopEdge: "Measurement edge",
  networkDoctor: "Your network doctor",
  advancedDiagnostics: "Advanced diagnostics",
  historyTitle: "Your history · this device only",
  clear: "Clear",
  whatThisMeasures: "What this test actually measures",
  measurementQuality: "Measurement quality",
  technicalDetailsTitle: "Technical details of this measurement",
  technicalDetailsNote:
    "Everything the engine recorded, so any figure above can be recomputed from the bytes and probes behind it rather than taken on trust.",
  p95Note:
    "The p95 tail is what you actually feel on a call. An average hides it — five percent of packets arriving late is enough to break audio.",
  pathNote:
    "This is an interpretation of the measurement, not a traceroute. A web page cannot see inside your router or isolate the WiFi hop on its own — a hop is flagged when the numbers are consistent with a problem there, and left neutral when they are not. To confirm WiFi is the bottleneck, run this once over WiFi and once on an Ethernet cable to the same router, and compare.",
  doctorNote:
    "Generated on this device from your own measurement using fixed rules — no data leaves your browser, and the same numbers always produce the same advice.",
  historyNote:
    "Stored in this browser only. It is never uploaded, and clearing it here deletes it for good.",
  methodScopeTitle: "Scope",
  methodMeasuredTitle: "Measured, and cross-checked",
  methodCannotTitle: "What a browser cannot do",
  methodDataTitle: "Data used",
  methodVaryTitle: "Why results vary",
  methodGradeTitle: "How this run graded itself",
  methodFullTitle: "The full method",
  methodPrivacyTitle: "Privacy",
};

/**
 * Overrides only. A key absent here falls through to English, which is why a
 * language can ship the twenty strings that matter most without shipping a
 * half-translated report underneath them.
 */
const translations = {
  en: EN,
  hi: {
    navSpeedTest: "स्पीड टेस्ट",
    navAnalyzer: "वाईफाई एनालाइज़र",
    navPing: "पिंग",
    navIsp: "ISP इंटेलिजेंस",
    navTools: "टूल्स",
    eyebrow: "रीयल-टाइम इंटरनेट इंटेलिजेंस",
    heroTitle: "अपना <em>इंटरनेट</em> जांचें।",
    heroCopy: "अपने ब्राउज़र से डाउनलोड, अपलोड, लेटेंसी और स्थिरता को वास्तविक रूप से मापें — हर आंकड़ा या तो मापा गया है या अनुपलब्ध बताया गया है।",
    startTest: "टेस्ट शुरू करें",
    startSub: "अपना कनेक्शन मापें",
    testing: "जाँच हो रही है…",
    testAgain: "फिर से जांचें",
    stopTest: "रोकें",
    seeReport: "पूरी रिपोर्ट देखें",
    trust1: "साइनअप नहीं",
    trust2: "विज्ञापन नहीं",
    trust3: "वास्तविक मापे गए बाइट्स",
    trust4: "इतिहास इसी डिवाइस पर",
    dialReady: "तैयार",
    dialNote: "लगभग 12 सेकंड का वास्तविक डेटा ट्रांसफर।",
    phasePing: "पिंग",
    phaseDownload: "डाउनलोड",
    phaseUpload: "अपलोड",
    download: "डाउनलोड",
    upload: "अपलोड",
    ping: "पिंग",
    jitter: "जिटर",
    yourResult: "आपका परिणाम",
    connectionReport: "कनेक्शन रिपोर्ट",
    gaming: "गेमिंग",
    streaming: "4K स्ट्रीमिंग",
    videoCalls: "वीडियो कॉल",
    workFromHome: "घर से काम",
    clear: "साफ़ करें",
  },
  es: {
    navSpeedTest: "Test de velocidad",
    navAnalyzer: "Analizador WiFi",
    navPing: "Ping",
    navIsp: "Inteligencia ISP",
    navTools: "Herramientas",
    eyebrow: "Inteligencia de internet en tiempo real",
    heroTitle: "Prueba tu <em>internet</em>.",
    heroCopy: "Mide descarga, subida, latencia y estabilidad reales desde tu navegador — cada cifra es medida o se marca como no disponible.",
    startTest: "Iniciar prueba",
    startSub: "Mide tu conexión",
    testing: "Midiendo…",
    testAgain: "Repetir",
    stopTest: "Detener",
    seeReport: "Ver informe completo",
    trust1: "Sin registro",
    trust2: "Sin anuncios",
    trust3: "Bytes realmente medidos",
    trust4: "El historial no sale de este dispositivo",
    dialReady: "Listo",
    dialNote: "Unos 12 segundos de transferencia real.",
    phaseDownload: "Descarga",
    phaseUpload: "Subida",
    download: "Descarga",
    upload: "Subida",
    jitter: "Jitter",
    yourResult: "Tu resultado",
    connectionReport: "Informe de conexión",
    gaming: "Juegos",
    streaming: "Streaming 4K",
    videoCalls: "Videollamadas",
    workFromHome: "Teletrabajo",
    clear: "Borrar",
  },
  ar: {
    eyebrow: "ذكاء إنترنت فوري",
    heroTitle: "اختبر <em>إنترنتك</em>.",
    heroCopy: "قِس سرعة التنزيل والرفع وزمن الاستجابة والاستقرار فعليًا من متصفحك.",
    startTest: "ابدأ الاختبار",
    startSub: "قِس اتصالك",
    testing: "جارٍ القياس…",
    testAgain: "أعد الاختبار",
    stopTest: "إيقاف",
    download: "التنزيل",
    upload: "الرفع",
    ping: "زمن الاستجابة",
    jitter: "التذبذب",
    yourResult: "نتيجتك",
    connectionReport: "تقرير الاتصال",
  },
  fr: {
    eyebrow: "Intelligence internet en temps réel",
    heroTitle: "Testez votre <em>connexion</em>.",
    heroCopy: "Mesurez le débit descendant, montant, la latence et la stabilité réels depuis votre navigateur.",
    startTest: "Lancer le test",
    startSub: "Mesurer votre connexion",
    testing: "Mesure…",
    testAgain: "Relancer",
    stopTest: "Arrêter",
    download: "Descendant",
    upload: "Montant",
    jitter: "Gigue",
    yourResult: "Votre résultat",
    connectionReport: "Rapport de connexion",
  },
  de: {
    eyebrow: "Echtzeit-Internetanalyse",
    heroTitle: "Teste dein <em>Internet</em>.",
    heroCopy: "Miss echten Download, Upload, Latenz und Stabilität direkt im Browser.",
    startTest: "Test starten",
    startSub: "Verbindung messen",
    testing: "Messung…",
    testAgain: "Erneut testen",
    stopTest: "Stoppen",
    jitter: "Jitter",
    yourResult: "Dein Ergebnis",
    connectionReport: "Verbindungsbericht",
  },
  pt: {
    eyebrow: "Inteligência de internet em tempo real",
    heroTitle: "Teste sua <em>internet</em>.",
    heroCopy: "Meça download, upload, latência e estabilidade reais pelo navegador.",
    startTest: "Iniciar teste",
    startSub: "Medir sua conexão",
    testing: "Medindo…",
    testAgain: "Testar de novo",
    stopTest: "Parar",
    download: "Download",
    upload: "Upload",
    yourResult: "Seu resultado",
    connectionReport: "Relatório de conexão",
  },
  zh: {
    eyebrow: "实时网络智能",
    heroTitle: "测试你的<em>网络</em>。",
    heroCopy: "在浏览器中真实测量下载、上传、延迟与稳定性。",
    startTest: "开始测试",
    startSub: "测量你的连接",
    testing: "测试中…",
    testAgain: "再测一次",
    stopTest: "停止",
    download: "下载",
    upload: "上传",
    ping: "延迟",
    jitter: "抖动",
    yourResult: "你的结果",
    connectionReport: "连接报告",
  },
  ja: {
    eyebrow: "リアルタイム回線インテリジェンス",
    heroTitle: "<em>回線</em>を測る。",
    heroCopy: "ブラウザから下り・上り速度、遅延、安定性を実測します。",
    startTest: "テスト開始",
    startSub: "回線を測定",
    testing: "測定中…",
    testAgain: "もう一度",
    stopTest: "停止",
    download: "下り",
    upload: "上り",
    yourResult: "結果",
    connectionReport: "回線レポート",
  },
  ko: { heroTitle: "당신의 <em>인터넷</em>을 측정하세요.", startTest: "테스트 시작", testing: "측정 중…", testAgain: "다시 측정", stopTest: "중지" },
  ru: { heroTitle: "Проверьте свой <em>интернет</em>.", startTest: "Начать тест", testing: "Измерение…", testAgain: "Ещё раз", stopTest: "Остановить" },
  tr: { heroTitle: "<em>Internetini</em> test et.", startTest: "Testi baslat", testing: "Olculuyor…", testAgain: "Tekrar", stopTest: "Durdur" },
  id: { heroTitle: "Uji <em>internet</em> Anda.", startTest: "Mulai tes", testing: "Mengukur…", testAgain: "Ulangi", stopTest: "Berhenti" },
  bn: { heroTitle: "আপনার <em>ইন্টারনেট</em> পরীক্ষা করুন।", startTest: "টেস্ট শুরু", testing: "পরিমাপ চলছে…", testAgain: "আবার", stopTest: "থামান" },
  ur: { heroTitle: "اپنا <em>انٹرنیٹ</em> جانچیں۔", startTest: "ٹیسٹ شروع کریں", testing: "پیمائش…", testAgain: "دوبارہ", stopTest: "روکیں" },
};

/** The language currently applied, and the lookup every JS string goes through. */
let activeLanguage = "en";

/**
 * The translation, or undefined when the interface has nothing to say for this
 * key. Callers that render into the DOM use this and leave the markup alone
 * when it answers undefined.
 *
 * @param {string} key @returns {string | undefined}
 */
function lookup(key) {
  const table = translations[activeLanguage];
  if (table && table[key] !== undefined) return table[key];
  return EN[key];
}

/**
 * The translation for a string built in JavaScript, where there is no markup to
 * fall back to. Returns the key itself only if the English table is missing it,
 * which is a bug rather than a state to design for.
 *
 * @param {string} key @returns {string}
 */
function t(key) {
  return lookup(key) ?? key;
}

/**
 * Phase wording lives in the front end, not in the engine: `core/run.js` reports
 * which phase it is in, and each interface chooses how to say it — in whichever
 * language is active at the moment the phase changes, which is why these are
 * getters rather than a frozen table.
 */
const PHASE_COPY = {
  get select() { return t("copySelect"); },
  get latency() { return t("copyLatency"); },
  get download() { return t("copyDownload"); },
  get upload() { return t("copyUpload"); },
};

const PHASE_NOTE = {
  get select() { return t("noteSelect"); },
  get latency() { return t("noteLatency"); },
  get download() { return t("noteDownload"); },
  get upload() { return t("noteUpload"); },
};

let providers = [];
// The ISP database is content several screens below the fold, and a static
// import puts it in the module graph the dial waits on. It is loaded on idle
// instead, from initIspData().

const regionLabels = ["North America", "South America", "Europe", "Asia", "Middle East", "Africa", "Australia & Oceania"];
const seoLocations = [
  ["New York", "United States"], ["London", "United Kingdom"], ["Dubai", "United Arab Emirates"], ["Sydney", "Australia"],
  ["Mumbai", "India"], ["Surat", "India"], ["Tokyo", "Japan"], ["Singapore", "Singapore"],
  ["Sao Paulo", "Brazil"], ["Johannesburg", "South Africa"], ["Toronto", "Canada"], ["Paris", "France"]
];

function unique(items) {
  return Array.from(new Set(items)).sort((a, b) => a.localeCompare(b));
}

function formatProvider(provider) {
  return `${provider.name} - ${provider.plan}`;
}

function scoreProvider(provider, usage = "balanced", budget = 999, gamingNeed = 5, streamingNeed = 5) {
  const speed = clamp((provider.download.median / 1000) * 26, 0, 26);
  const upload = clamp((provider.upload.median / 700) * 12, 0, 12);
  const latency = clamp(18 - provider.ping.median / 3 - provider.jitter.median / 3, 0, 18);
  const reliability = provider.reliability * 0.16;
  const coverage = provider.coverage * 0.08;
  const value = provider.price <= budget ? 12 : clamp(12 - (provider.price - budget) / 6, 0, 12);
  const usageScore = usage === "gaming" ? provider.gaming * 0.14 :
    usage === "streaming" ? provider.streaming * 0.14 :
    usage === "remote" || usage === "enterprise" ? provider.remote * 0.14 :
    (provider.gaming * gamingNeed + provider.streaming * streamingNeed + provider.remote * 5) / 200;
  return Math.round(speed + upload + latency + reliability + coverage + value + usageScore);
}

function populateSelect(select, values, selected) {
  select.innerHTML = values.map((value) => `<option value="${value}">${value}</option>`).join("");
  if (selected && values.includes(selected)) select.value = selected;
}

function currentProviders() {
  const cards = qsa(".card, .metric");
  cards.forEach(card => {
    card.addEventListener("mousemove", (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const midX = rect.width / 2;
      const midY = rect.height / 2;
      const tiltX = (y - midY) / 15;
      const tiltY = (midX - x) / 15;
      card.style.transform = `perspective(800px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateY(-2px)`;
      card.style.transition = "transform 0.1s ease-out";
    });
    card.addEventListener("mouseleave", () => {
      card.style.transform = "perspective(800px) rotateX(0) rotateY(0) translateY(0)";
      card.style.transition = "transform 0.5s ease-in-out";
    });
  });

  if (state.scopedGlobal) return [...providers];
  const country = qs("#countrySelect").value;
  const city = qs("#citySelect").value;
  return providers.filter((provider) => provider.country === country && provider.city === city);
}

function initLocationControls() {
  const countries = unique(providers.map((provider) => provider.country));
  populateSelect(qs("#countrySelect"), countries, "India");
  populateSelect(qs("#recCountry"), countries, "India");
  updateCityOptions();
  updateRecCityOptions();
}

function updateCityOptions() {
  const country = qs("#countrySelect").value;
  const cities = unique(providers.filter((provider) => provider.country === country).map((provider) => provider.city));
  populateSelect(qs("#citySelect"), cities, cities.includes("Mumbai") ? "Mumbai" : cities[0]);
  updateProviderOptions();
}

function updateProviderOptions() {
  const scoped = currentProviders();
  const fallback = scoped.length ? scoped : providers.filter((provider) => provider.country === qs("#countrySelect").value);
  qs("#providerSelect").innerHTML = fallback.map((provider, index) => `<option value="${index}">${formatProvider(provider)}</option>`).join("");
  qs("#providerSelect").dataset.scope = JSON.stringify(fallback.map((provider) => providers.indexOf(provider)));
  renderSelectedProvider();
  renderComparison();
  renderAvailability();
}

function selectedProvider() {
  const indexes = JSON.parse(qs("#providerSelect").dataset.scope || "[]");
  const selectedIndex = indexes[Number(qs("#providerSelect").value || 0)] ?? 0;
  return providers[selectedIndex] || providers[0];
}

function renderSelectedProvider() {
  const provider = selectedProvider();
  qs("#chainCountry").textContent = provider.country;
  qs("#chainState").textContent = provider.state;
  qs("#chainCity").textContent = provider.city;
  qs("#chainProvider").textContent = provider.name;
  qs("#chainPlan").textContent = provider.plan;
  qs("#profileName").textContent = provider.name;
  qs("#profileSummary").textContent = `${provider.ownership} ${provider.type} provider serving ${provider.city}, ${provider.country}.`;
  qs("#profileScore").textContent = scoreProvider(provider);
  qs("#profileDownload").textContent = provider.download.median;
  qs("#profileUpload").textContent = provider.upload.median;
  qs("#profilePing").textContent = provider.ping.median;
  qs("#profileCoverage").textContent = `${provider.coverage}%`;
  qs("#profileReliability").textContent = provider.reliability;
  qs("#profileRating").textContent = provider.rating.toFixed(1);
  qs("#profileTags").innerHTML = [provider.type, provider.ownership, provider.dataCap, `${provider.uptime}% uptime`, `${provider.currency} ${provider.price}/mo`]
    .map((tag) => `<span class="tag">${tag}</span>`).join("");
}

function renderRegions() {
  qs("#regionMap").innerHTML = regionLabels.map((region) => {
    const regionProviders = providers.filter((provider) => provider.region === region);
    const countries = unique(regionProviders.map((provider) => provider.country)).length;
    const avg = regionProviders.length ? Math.round(regionProviders.reduce((sum, provider) => sum + provider.download.median, 0) / regionProviders.length) : 0;
    return `<article class="region-tile"><strong>${region}</strong><span>${countries || "Expanding"} countries sampled</span><span>${regionProviders.length} seed ISPs</span><span>${avg || "TBD"} Mbps avg download</span></article>`;
  }).join("");
}

function renderComparison() {
  const sortBy = qs("#sortSelect").value;
  const scoped = currentProviders();
  const rows = (scoped.length ? scoped : providers).sort((a, b) => {
    if (sortBy === "ping") return a.ping - b.ping;
    if (sortBy === "value") return (b.download / b.price) - (a.download / a.price);
    return b[sortBy] - a[sortBy];
  }).slice(0, state.scopedGlobal ? 12 : 8);
  qs("#comparisonTable").innerHTML = `
    <div class="comparison-row header"><span>Provider</span><span>Download</span><span>Upload</span><span>Ping</span><span>Price</span><span>Reliability</span></div>
    ${rows.map((provider) => `
      <div class="comparison-row">
        <span class="provider-name">${provider.name}<br><small class="muted">${provider.city}, ${provider.country}</small></span>
        <span>${provider.download.median} Mbps</span>
        <span>${provider.upload.median} Mbps</span>
        <span>${provider.ping.median} ms</span>
        <span>$${provider.price}/mo</span>
        <span><div class="score-bar" aria-label="${provider.reliability} reliability"><span style="width:${provider.reliability}%"></span></div></span>
      </div>`).join("")}
  `;
}

function renderAvailability() {
  const scoped = currentProviders();
  const city = qs("#citySelect").value;
  qs("#availabilityTitle").textContent = state.scopedGlobal ? "Worldwide coverage mix" : `${city} coverage mix`;
  const source = scoped.length ? scoped : providers;
  const types = unique(source.map((provider) => provider.type));
  qs("#availabilityText").textContent = state.scopedGlobal
    ? "Global comparison includes fiber, cable, fixed wireless, mobile, satellite, government-owned, and private providers."
    : `${city} has ${source.length} sampled providers in this prototype. Production coverage maps would add address-level availability.`;
  qs("#availabilityTags").innerHTML = types.map((type) => `<span class="tag">${type}</span>`).join("");
}

function renderRankings() {
  const ranking = state.ranking;
  const ranked = [...providers].sort((a, b) => {
    if (ranking === "gaming") return b.gaming - a.gaming || a.ping - b.ping;
    if (ranking === "streaming") return b.streaming - a.streaming || b.download - a.download;
    if (ranking === "remote") return b.remote - a.remote || b.upload - a.upload;
    if (ranking === "value") return (b.download / b.price) - (a.download / a.price);
    return b.download - a.download;
  }).slice(0, 10);
  qs("#rankingTable").innerHTML = `
    <div class="ranking-row header"><span>Rank</span><span>Provider</span><span>Location</span><span>Speed</span><span>Ping</span><span>Score</span></div>
    ${ranked.map((provider, index) => {
      const score = ranking === "gaming" ? provider.gaming : ranking === "streaming" ? provider.streaming : ranking === "remote" ? provider.remote : ranking === "value" ? Math.round(provider.download.median / provider.price) : provider.download.median;
      return `<div class="ranking-row"><strong>#${index + 1}</strong><span class="provider-name">${provider.name}</span><span>${provider.city}, ${provider.country}</span><span>${provider.download.median} Mbps</span><span>${provider.ping.median} ms</span><span>${score}</span></div>`;
    }).join("")}
  `;
}

function updateRecCityOptions() {
  const country = qs("#recCountry").value;
  const cities = unique(providers.filter((provider) => provider.country === country).map((provider) => provider.city));
  populateSelect(qs("#recCity"), cities, cities[0]);
}

function recommendProviders() {
  const country = qs("#recCountry").value;
  const city = qs("#recCity").value;
  const budget = Number(qs("#recBudget").value) || 999;
  const usage = qs("#recUsage").value;
  const gamingNeed = Number(qs("#gamingNeed").value);
  const streamingNeed = Number(qs("#streamingNeed").value);
  let candidates = providers.filter((provider) => provider.country === country && provider.city === city);
  if (!candidates.length) candidates = providers.filter((provider) => provider.country === country);
  if (!candidates.length) candidates = providers;
  const ranked = candidates.map((provider) => ({ provider, score: scoreProvider(provider, usage, budget, gamingNeed, streamingNeed) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  qs("#recommendations").innerHTML = ranked.map(({ provider, score }, index) => `
    <article class="card">
      <span class="tool-kicker">Recommendation ${index + 1}</span>
      <div class="tool-head">
        <div><h3>${provider.name}</h3><p>${provider.plan} in ${provider.city}. ${provider.type}, ${provider.dataCap} data cap.</p></div>
        <div class="output-number">${score}<small>/100</small></div>
      </div>
      <div class="tag-list">
        <span class="tag">${provider.download.median} Mbps down</span>
        <span class="tag">${provider.upload.median} Mbps up</span>
        <span class="tag">${provider.ping.median} ms ping</span>
        <span class="tag">$${provider.price}/mo</span>
        <span class="tag">${provider.reliability} reliability</span>
      </div>
    </article>
  `).join("");
}

function renderSeoPages() {
  qs("#seoPages").innerHTML = seoLocations.map(([city, country]) => {
    const local = providers.filter((provider) => provider.city === city && provider.country === country);
    const count = local.length || providers.filter((provider) => provider.country === country).length;
    return `<article class="card location-card"><div><span class="tool-kicker">${country}</span><h3>Best ISP in ${city}</h3><p>Compare the providers in this city from the sample dataset — speeds, pricing and ratings.</p></div><a href="#compare" data-city="${city}" data-country="${country}" class="seo-jump">${count} in the sample dataset</a></article>`;
  }).join("");
}

/**
 * The Network Core — the 3D instrument behind the dial.
 *
 * Loaded lazily and OUT OF BAND: the renderer is fetched on idle, after the dial
 * has painted, and never while a measurement is running. A speed test that
 * downloads its own decoration mid-run has measured its own decoration.
 *
 * Everything about it degrades rather than fails. No WebGL, a starved GPU or
 * prefers-reduced-motion all land on the static gradient field the stylesheet
 * already draws, and the test itself is untouched either way.
 */
let networkCore = null;
let coreLoading = false;

/** Ease a measured value onto the 0-1 the renderer wants, on the dial's own scale. */
function coreIntensity(mbps) {
  return fractionFor(mbps, dialStops);
}

/** Put the scene behind the instrument rather than in the middle of the hero. */
function alignCore() {
  const stage = qs("#heroStage");
  const instrument = qs("#instrument");
  if (!networkCore || !stage || !instrument) return;
  const stageBox = stage.getBoundingClientRect();
  const targetBox = instrument.getBoundingClientRect();
  if (!stageBox.width || !stageBox.height) return;
  const x = (targetBox.left + targetBox.width / 2 - stageBox.left) / stageBox.width;
  const y = (targetBox.top + targetBox.height / 2 - stageBox.top) / stageBox.height;
  networkCore.setFocus(-(x * 2 - 1), y * 2 - 1);
}

async function setupNetworkCore() {
  const canvas = qs("#coreCanvas");
  const stage = qs("#heroStage");
  if (!canvas || !stage || coreLoading || networkCore) return;
  coreLoading = true;

  const fallback = () => {
    stage.dataset.fallback = "true";
    canvas.remove();
  };

  let module;
  try {
    module = await import("./ui/network-core.js");
  } catch (error) {
    logError("network core", error);
    fallback();
    return;
  }

  networkCore = module.createNetworkCore(canvas);
  if (!networkCore) {
    fallback();
    return;
  }

  // The static field stays underneath at low opacity on the reduced-motion tier,
  // so a single rendered frame still sits on something rather than on nothing.
  if (networkCore.quality === "minimal") stage.dataset.fallback = "true";

  networkCore.resize();
  alignCore();
  networkCore.setPhase("idle", { intensity: 0.16 });
  networkCore.start();
  canvas.classList.add("ready");
  log("network core", { quality: networkCore.quality, particles: networkCore.particleCount });

  const onResize = () => {
    networkCore.resize();
    alignCore();
  };
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(onResize);
    ro.observe(stage);
  }
  window.addEventListener("resize", onResize, { passive: true });
  window.addEventListener("scroll", alignCore, { passive: true });

  // Stop rendering the moment the canvas leaves the viewport. On a long page
  // this is the difference between a GPU that idles and one that never does.
  if (typeof IntersectionObserver !== "undefined") {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) networkCore.start();
          else networkCore.stop();
        }
      },
      { rootMargin: "80px" },
    );
    io.observe(stage);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) networkCore.stop();
    else if (stage.getBoundingClientRect().bottom > 0) networkCore.start();
  });

  // Parallax only where there is a real pointer. On touch it would be driven by
  // scroll, which is exactly the motion people find nauseating.
  if (window.matchMedia?.("(hover: hover) and (pointer: fine)").matches && networkCore.quality !== "minimal") {
    window.addEventListener(
      "pointermove",
      (event) => {
        const x = (event.clientX / window.innerWidth) * 2 - 1;
        const y = (event.clientY / window.innerHeight) * 2 - 1;
        networkCore.setParallax(x, y);
      },
      { passive: true },
    );
  }
}

/** Fire-and-forget helpers so call sites never have to null-check the renderer. */
function corePhase(phase, options) {
  networkCore?.setPhase(phase, options);
}

/**
 * Hand the CPU and GPU back to the measurement.
 *
 * Called for the whole run rather than per phase: the latency probes are as
 * sensitive to a busy main thread as the throughput phases are, and a scene
 * that changed cadence three times mid-test would draw attention to itself at
 * exactly the wrong moment.
 *
 * @param {boolean} on
 */
function coreMeasurementPriority(on) {
  networkCore?.setMeasurementPriority(on);
}
function coreNoise(value) {
  networkCore?.setNoise(value);
}
function corePulse() {
  networkCore?.pulse();
}

function setMetric(id, value, digits = 0) {
  const el = qs(id);
  if (!el) return;
  const empty = value === null;
  // An em dash, not two hyphens. "--" reads as a glyph that failed to load;
  // "—" is the typographic convention for "no value here", and it lets the
  // tile look deliberate while it waits instead of looking broken.
  el.textContent = empty ? "—" : Number(value).toFixed(digits);
  // Marks the whole value row, so the unit fades with the number rather than
  // sitting at full strength beside a placeholder.
  el.closest(".metric-value")?.setAttribute("data-empty", String(empty));
}

/** The four headline tiles under the instrument. */
const HERO_IDS = {
  download: ["#pmDownload", 1],
  upload: ["#pmUpload", 1],
  ping: ["#pmPing", 0],
  jitter: ["#pmJitter", 1],
};

function setHeroMetric(key, value) {
  const entry = HERO_IDS[key];
  if (!entry) return;
  const el = qs(entry[0]);
  if (!el) return;
  const empty = value === null;
  el.textContent = empty ? "—" : Number(value).toFixed(entry[1]);
  el.dataset.empty = String(empty);
  el.closest(".pm")?.setAttribute("data-live", String(!empty));
}

function updateScores() {
  const scores = qualityScores(state);
  if (!scores) {
    // A run whose latency phase produced nothing cannot be scored. Returning
    // here left the PREVIOUS run's six sub-scores and its verdict on screen
    // beside the new run's blank tiles — so a failed test on a broken link
    // displayed "Excellent global-ready connection" and a gaming score of 78.
    // Nothing measured, nothing claimed.
    state.health = null;
    for (const selector of ["#wifiScore", "#gamingScore", "#streamingScore", "#videoScore", "#workScore", "#dnsScore"]) {
      const el = qs(selector);
      if (el) el.textContent = "—";
    }
    const title = qs("#analysisTitle");
    const text = qs("#analysisText");
    if (title) title.textContent = "Not enough measurements to score this connection";
    if (text) {
      text.textContent =
        "The latency phase did not return enough probes to compute a score. The figures that were measured are still shown above.";
    }
    renderHealth(state, null, state.bufferbloat || null);
    return;
  }
  state.health = scores.health;

  // The six sub-scores, shown in the diagnostics section further down.
  const setScore = (selector, value) => {
    const el = qs(selector);
    if (el) el.textContent = value ?? "--";
  };
  setScore("#wifiScore", scores.health);
  setScore("#gamingScore", scores.gaming);
  setScore("#streamingScore", scores.streaming);
  // Null when the metric each depends on could not be measured: video and work
  // need upload, work and dns need DNS.
  setScore("#videoScore", scores.video);
  setScore("#workScore", scores.work);
  setScore("#dnsScore", scores.dns);

  const verdict = healthVerdict(scores.health);
  const title = qs("#analysisTitle");
  const text = qs("#analysisText");
  if (title) title.textContent = verdict.title;
  if (text) text.textContent = verdict.detail;

  renderHealth(state, scores.health, state.bufferbloat || null);
  renderPath(state, state.bufferbloat || null, {
    degraded: Boolean(state.degraded),
    edgeLabel: state.edgeLabel || null,
  });
  updateAiDoctor();
}

function updateAiDoctor() {
  const panel = qs("#aiDoctorPanel");
  if (!panel) return;
  if (state.download === null) {
    panel.hidden = true;
    return;
  }
  renderDoctor(generateAiDiagnosis(state, state.bufferbloat || null), state, state.bufferbloat || null);
}

// ---- The dial ------------------------------------------------------------
// A 270° sweep on the same non-linear scale consumer testers use: the slow end
// gets most of the arc, so a 30 Mbps line moves the needle across half the dial
// instead of nudging it off zero. The maths is shared with the Next.js front end
// through core/gauge.js — the two dials differ only in sweep and radius.
const DIAL_ARC = 744.56; // path length of the visible 270° arc at r=158
const DIAL_GEOMETRY = { start: 135, sweep: 270 };
const DIAL_CENTER = 200;

/**
 * The scale currently drawn on the dial.
 *
 * `core/gauge.js` has always exported `scaleFor()`, which grows the dial to
 * 2.5G, 5G and 10G — and this front end never called it. Every stop was
 * hardcoded to the 0-1G set and the ticks were drawn exactly once
 * (`if (group.childElementCount) return`), so on a connection faster than a
 * gigabit `fractionFor()` clamped to 1 and the needle sat pinned at the top of
 * the dial while the readout kept climbing past it. The instrument and the
 * number it surrounds disagreed, and the instrument was the one that was wrong.
 *
 * @type {number[]}
 */
let dialStops = [...BASE_STOPS];

/**
 * Grow the dial if the link has outrun it.
 *
 * `scaleFor` never shrinks within a run, so the dial cannot rescale downward
 * mid-measurement — a rising number that appeared to fall because the axis moved
 * under it would be worse than a pinned needle.
 *
 * @param {number} peak highest value the dial must be able to show
 * @returns {boolean} whether the scale changed
 */
function ensureDialScale(peak) {
  const next = scaleFor(peak, dialStops);
  if (next.length === dialStops.length && next.every((v, i) => v === dialStops[i])) return false;
  dialStops = next;
  const group = qs("#dialTicks");
  if (group) group.innerHTML = "";
  renderDialTicks();
  return true;
}

function renderDialTicks() {
  const group = qs("#dialTicks");
  if (!group || group.childElementCount) return;
  const last = dialStops.length - 1;
  const parts = [];
  for (let i = 0; i <= last; i += 1) {
    const fraction = i / last;
    const outer = pointOnArc(fraction, 181, DIAL_CENTER, DIAL_CENTER, DIAL_GEOMETRY);
    const inner = pointOnArc(fraction, 168, DIAL_CENTER, DIAL_CENTER, DIAL_GEOMETRY);
    parts.push(
      `<line class="dial-major" x1="${outer.x}" y1="${outer.y}" x2="${inner.x}" y2="${inner.y}" />`,
    );
    // The 0-100 half is where almost every connection lands, so its labels are
    // the brighter ones. Dimming the top of the scale is what stops a dial that
    // reaches 10 Gbps from making an ordinary link look like a rounding error.
    const at = pointOnArc(fraction, 138, DIAL_CENTER, DIAL_CENTER, DIAL_GEOMETRY);
    const hot = dialStops[i] <= 100 ? " hot" : "";
    parts.push(`<text class="dial-tick${hot}" x="${at.x}" y="${at.y}">${labelFor(dialStops[i])}</text>`);

    if (i < last) {
      for (let m = 1; m < 5; m += 1) {
        const minor = (i + m / 5) / last;
        const a = pointOnArc(minor, 181, DIAL_CENTER, DIAL_CENTER, DIAL_GEOMETRY);
        const b = pointOnArc(minor, 174, DIAL_CENTER, DIAL_CENTER, DIAL_GEOMETRY);
        parts.push(`<line class="dial-minor" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`);
      }
    }
  }
  group.innerHTML = parts.join("");
}

/**
 * Position the arc and write the readout.
 *
 * Kept separate from `setDialSpeed` so a phase can sweep the arc as PROGRESS
 * while the number means something else entirely — during the latency phase the
 * arc is how far through the probes we are, and the number is real milliseconds.
 *
 * @param {number} fraction 0-1 of the arc
 * @param {string} readout
 * @param {string} phase
 * @param {string} unit
 * @param {"down" | "up" | "ping"} [direction]
 */
function setDial(fraction, readout, phase, unit, direction) {
  const bounded = clamp(fraction, 0, 1);
  const progress = qs("#dialProgress");
  const needle = qs("#dialNeedle");
  if (progress) progress.setAttribute("stroke-dashoffset", String(DIAL_ARC * (1 - bounded)));
  if (needle) {
    needle.setAttribute(
      "transform",
      `rotate(${needleAngle(bounded, DIAL_GEOMETRY).toFixed(2)} ${DIAL_CENTER} ${DIAL_CENTER})`,
    );
  }
  const value = qs("#dialValue");
  const unitEl = qs("#dialUnit");
  const phaseEl = qs("#dialPhase");
  if (value) value.textContent = readout;
  if (unitEl) unitEl.textContent = unit;
  if (phase && phaseEl) phaseEl.textContent = phase;
  if (direction) {
    const instrument = qs("#instrument");
    if (instrument) instrument.dataset.dir = direction;
  }
}

/** @param {number} mbps @param {"down" | "up"} direction */
function setDialSpeed(mbps, direction) {
  // Grow the dial BEFORE placing the needle, so a value past the old ceiling is
  // drawn against the scale that can actually contain it rather than clamped to
  // the top of one that cannot.
  ensureDialScale(mbps);
  setDial(
    fractionFor(mbps, dialStops),
    Number(mbps).toFixed(2),
    direction === "up" ? t("phaseUpload") : t("phaseDownload"),
    "Mbps",
    direction,
  );
}

// ---- Phase rail ----------------------------------------------------------
// Six named steps. Each one is marked done only when the thing it names has
// actually finished, so the rail is a record of the run rather than a timer.
const PHASE_ORDER = ["select", "latency", "download", "upload", "stability", "analyse"];

/** @param {string | null} active @param {boolean} [allDone] */
function setPhaseRail(active, allDone = false) {
  const rail = qs("#phaseRail");
  if (!rail) return;
  const index = active ? PHASE_ORDER.indexOf(active) : -1;
  qsa(".phase-step", rail).forEach((step) => {
    const position = PHASE_ORDER.indexOf(step.dataset.phase);
    if (allDone) step.dataset.state = "done";
    else if (index < 0) step.removeAttribute("data-state");
    else if (position < index) step.dataset.state = "done";
    else if (position === index) step.dataset.state = "active";
    else step.removeAttribute("data-state");
  });
}

/**
 * The instrument has three states and the CTA follows them.
 *
 * @param {"idle" | "running" | "done"} mode
 */
function setInstrumentState(mode) {
  const instrument = qs("#instrument");
  const button = qs("#goButton");
  const label = qs("#goLabel");
  const sub = qs("#goSub");
  const stop = qs("#stopTest");
  const report = qs("#seeReport");
  if (instrument) instrument.dataset.state = mode;
  if (button) {
    button.dataset.state = mode;
    button.setAttribute("aria-busy", String(mode === "running"));
  }
  if (label) label.textContent = mode === "running" ? t("testing") : mode === "done" ? t("testAgain") : t("startTest");
  if (sub) sub.hidden = mode !== "idle";
  if (stop) stop.hidden = mode !== "running";
  if (report) report.hidden = mode !== "done";
  if (mode === "idle") {
    setDial(0, "0.00", t("dialReady"), "Mbps", "down");
    const note = qs("#dialNote");
    if (note) note.textContent = t("dialNote");
  }
}

/** Screen readers get the run through here, not through the dial. */
function announce(message) {
  const live = qs("#liveAnnounce");
  if (live) live.textContent = message;
}

// ---- Who you are on the network -----------------------------------------
let isIpMasked = true;
let rawClientIp = "";

function formatIpDisplay(ip) {
  if (!ip || ip === "Unavailable" || ip === "Detecting…") return ip;
  if (!isIpMasked) return ip;
  return ip.replace(/^(\d+\.\d+)\.\d+\.\d+$/, "$1.xx.###");
}

function paintConnection(net, resolved) {
  qs("#connClient").textContent = `${net.browser} · ${net.os} · ${net.device}`;

  if (!resolved) {
    qs("#connIsp").textContent = "Detecting…";
    qs("#connIsp").classList.add("shimmer");
    return;
  }
  qs("#connIsp").classList.remove("shimmer");

  // Every line here is either an observed fact or the word "Unavailable". The
  // ASN line used to fall back to "Edge lookup completed" — filler that reads
  // like a status and states nothing, on a tile whose entire job is to say who
  // your provider is.
  rawClientIp = net.ip || "";
  qs("#connIsp").textContent = net.isp || "Unavailable";
  qs("#connAsn").textContent = net.asn ? `AS${net.asn}` : "";
  qs("#connIp").textContent = net.ip ? formatIpDisplay(net.ip) : "Unavailable";
  if (net.ip) {
    qs("#connIp").title = "Click to reveal / mask IP";
    qs("#connIp").style.cursor = "pointer";
  }
  qs("#connLocation").textContent = [net.city, net.country].filter(Boolean).join(", ");
  qs("#connEdge").textContent = net.edgeCity
    ? `${net.edgeCity} (${net.colo})`
    : net.colo || "Unavailable";
  qs("#connProtocol").textContent = net.httpProtocol ? `over ${net.httpProtocol}` : "";
}

async function renderConnection() {
  paintConnection(localNetInfo(), false);
  const net = await detectNetwork();
  state.network = net;
  paintConnection(net, true);
}

/**
 * Reads a design token so a canvas can be painted in the site's own colours.
 * A canvas cannot inherit CSS, so without this the sparklines are stuck with
 * whatever palette was hardcoded — which is why they used to vanish in the
 * light theme.
 */
function token(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

// ---- Sparklines ----------------------------------------------------------
// The shape of each metric while it is being measured, under its own tile. The
// full-width throughput graph that used to live here is gone: it duplicated the
// dial, doubled the per-frame canvas work during the one phase where the CPU is
// also feeding eight download streams, and nobody read it.
const sparklineData = { down: [], up: [], ping: [], jitter: [] };
let lastGraphSample = { down: 0, up: 0, ping: 0, jitter: 0 };

const SPARK_IDS = {
  down: ["#sparklineDownload", "--brand", "#2ee6f6"],
  up: ["#sparklineUpload", "--up", "#8b8cff"],
  ping: ["#sparklinePing", "--warn", "#ffb454"],
  jitter: ["#sparklineJitter", "--up", "#8b8cff"],
};

function drawSparkline(id, points, color) {
  const canvas = qs(id);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.offsetWidth || 120;
  const height = canvas.offsetHeight || 20;
  // Capped at 2: a 3x phone display gains nothing visible from a 22px-tall
  // sparkline rendered at 3x, and pays for every pixel of it.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(width * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (points.length < 2) return;

  const peak = Math.max(...points);
  const min = Math.min(...points);
  const range = peak === min ? 1 : peak - min;
  const x = (i) => (i / (points.length - 1)) * width;
  const y = (v) => height - 3 - ((v - min) / range) * (height - 6);

  ctx.beginPath();
  ctx.moveTo(x(0), y(points[0]));
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(x(i), y(points[i]));

  const fill = ctx.createLinearGradient(0, 0, 0, height);
  fill.addColorStop(0, color);
  fill.addColorStop(1, "transparent");
  ctx.save();
  ctx.lineTo(x(points.length - 1), height);
  ctx.lineTo(x(0), height);
  ctx.closePath();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(x(0), y(points[0]));
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(x(i), y(points[i]));
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

/**
 * Samples arrive faster than the eye can use, and every one of them lands
 * during the phase that is already saturating the connection. Throttling to
 * ~25 Hz keeps the arrays small and the main thread free for the transfer.
 */
function pushGraphSample(kind, value) {
  const entry = SPARK_IDS[kind];
  if (!entry) return;
  const now = performance.now();
  if (now - lastGraphSample[kind] < 40) return;
  lastGraphSample[kind] = now;
  const series = sparklineData[kind];
  series.push(value);
  // Bounded so a long run cannot grow an unbounded array behind the tile.
  if (series.length > 160) series.shift();
  drawSparkline(entry[0], series, token(entry[1], entry[2]));
}

function clearSparklines() {
  for (const kind of Object.keys(sparklineData)) {
    sparklineData[kind] = [];
    lastGraphSample[kind] = 0;
    const canvas = qs(SPARK_IDS[kind][0]);
    if (!canvas) continue;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function redrawSparklines() {
  for (const [kind, entry] of Object.entries(SPARK_IDS)) {
    drawSparkline(entry[0], sparklineData[kind], token(entry[1], entry[2]));
  }
}

// ---- Local test history --------------------------------------------------
// Storage, capping and delta maths live in core/history.js; ui/report.js draws
// it. This is only the seam between them.
function renderHistory() {
  paintHistory(loadHistory(), downloadDelta);
}

// ---- Shareable result links ---------------------------------------------
// Encoding lives in core/permalink.js. The link carries the whole result in the
// URL fragment, so it works with no backend and leaves nothing to track whoever
// opens it.
function currentResultLink() {
  return resultLink(
    {
      ...state,
      isp: state.network ? state.network.isp : null,
      edgeCity: state.network ? state.network.edgeCity : null,
      at: Date.now(),
    },
    `${location.origin}${location.pathname}`,
  );
}

function applyResultFromHash() {
  const shared = resultFromHash(location.hash);
  if (!shared || shared.download === null) return;

  Object.assign(state, {
    download: shared.download, upload: shared.upload, ping: shared.ping,
    jitter: shared.jitter, loss: shared.loss, dns: shared.dns, stability: shared.stability,
  });
  // A shared link carries someone else's readings. They are real measurements,
  // so they settle their badges the same way a local run does — a field the
  // link did not carry stays unavailable rather than borrowing a claim.
  publishMetric("download", state.download);
  publishMetric("upload", state.upload);
  publishMetric("ping", state.ping);
  publishMetric("jitter", state.jitter);
  publishMetric("loss", state.loss);
  publishMetric("dns", state.dns);
  publishMetric("stability", state.stability);
  updateScores();
  renderDialTicks();
  setDialSpeed(isMeasured(state.download) ? state.download : 0, "down");
  setInstrumentState("done");
  setPhaseRail(null, true);
  revealReport();

  const who = [shared.isp, shared.edgeCity].filter(Boolean).join(" · ");
  qs("#testStatus").textContent = `Shared result${who ? ` from ${who}` : ""}, measured ${new Date(shared.at).toLocaleString()}. Run your own test to compare.`;
}

async function copyResultLink() {
  // Returning silently made this a dead button before a run: a click, and
  // nothing on screen changed. There is no link to copy yet, so say that.
  if (state.download === null) {
    qs("#testStatus").textContent = "Nothing to copy yet — press Start to measure your connection first.";
    return;
  }
  const link = currentResultLink();
  try {
    await navigator.clipboard.writeText(link);
    qs("#testStatus").textContent = "Result link copied. It carries the full result in the URL — no account, no server-side record.";
  } catch {
    // Clipboard denied (common on insecure origins) — surface the link so it can
    // still be copied by hand.
    qs("#testStatus").textContent = link;
  }
}

// ---- Deep-measurement panels --------------------------------------------
function renderLatencyPanel(latency) {
  const probes = qs("#latencyProbes");
  if (probes) {
    // Every one of these can legitimately be null: jitter is undefined from a
    // single sample, and a latency phase that failed outright has no figures
    // at all. Interpolating a null printed "jitter null ms · loss null%".
    const say = (value, unit) => (Number.isFinite(value) ? `${value}${unit}` : "not measurable");
    probes.textContent = latency.samples.length
      ? `${latency.samples.length} probes · jitter ${say(latency.jitter, " ms")} · loss ${say(latency.loss, "%")}`
      : "No latency probe returned — nothing in this panel could be measured.";
  }
  const set = (selector, value) => {
    const el = qs(selector);
    if (el) el.textContent = value === null || value === undefined ? "—" : value;
  };
  set("#latMin", latency.min);
  set("#latMedian", latency.ping);
  set("#latP95", latency.p95);
  set("#latMax", latency.max);
  renderLatencyChart(qs("#latencyChart"), latency, qs("#latencyChartDesc"));
  if (Number.isFinite(latency.jitter)) pushGraphSample("jitter", latency.jitter);
}

function renderBufferbloat(bloat) {
  state.bufferbloat = bloat;
  paintBufferbloat(bloat);
}

/**
 * Name the edge the numbers are actually being measured against.
 *
 * Not decoration: throughput and latency are both properties of a path, and the
 * same link reads differently against an edge 5 ms away and one 200 ms away. A
 * result that does not say where it was measured to is not reproducible.
 *
 * @param {string} label
 */
function setEdgeLabel(label) {
  const el = qs("#selectedEdge");
  el.textContent = `Measuring against ${label}`;
  el.hidden = false;
}

// The GO dial is the only way to start a run, so the guard lives here rather
// than on a button's disabled state.
//
// There is deliberately no quick/full mode switch. One existed in code — it set
// a `currentTestMode` flag that was posted to the worker, printed in the
// finished-status line and stamped into the exported JSON — but the buttons it
// listened for (#modeQuick, #modeFull) are not in the markup, and the engine
// never read the flag. Every run was the same run while the UI and the exported
// result both claimed a mode had been chosen. A label describing a setting that
// does not exist is worse than no setting, so the flag is gone; if the modes
// come back, they belong in `core/run.js` where the measurement windows live.
let activeWorker = null;

// ---- Metric card state ---------------------------------------------------
// Each card's badge is DERIVED from this map, never written by hand. The badges
// used to be hardcoded in index.html, so every card shipped claiming "measured"
// and kept claiming it while its value was an em dash and the run had already
// failed. The rule now: the word "measured" appears only where `isMeasured()`
// says a finite number exists behind it.

/** Which badge element belongs to which metric. */
const BADGE_IDS = {
  download: "#badgeDownload",
  upload: "#badgeUpload",
  ping: "#badgePing",
  jitter: "#badgeJitter",
  loss: "#badgeLoss",
  dns: "#badgeDns",
  stability: "#badgeStability",
  bufferbloat: "#badgeBufferbloat",
};

/** Which value element belongs to which metric, and at what precision. */
const VALUE_IDS = {
  download: ["#downloadValue", 1],
  upload: ["#uploadValue", 1],
  ping: ["#pingValue", 0],
  jitter: ["#jitterValue", 1],
  loss: ["#lossValue", 1],
  dns: ["#dnsValue", 0],
  stability: ["#stabilityValue", 0],
  bufferbloat: ["#bufferbloatValue", 0],
};

/** @type {Record<string, string>} */
let metricStates = createMetricStates();

/**
 * Paint one badge from its state.
 *
 * @param {string} key
 */
function paintBadge(key) {
  const el = qs(BADGE_IDS[key]);
  if (!el) return;
  const badgeState = metricStates[key] ?? MetricState.NOT_STARTED;
  el.textContent = BADGE_TEXT[badgeState];
  el.className = `badge ${badgeState}`;
}

/**
 * Move one or more metrics into a state and repaint their badges.
 *
 * @param {string[]} keys
 * @param {string} next
 */
function setMetricState(keys, next) {
  for (const key of keys) {
    if (!(key in metricStates)) continue;
    metricStates[key] = next;
    paintBadge(key);
  }
}

/**
 * Publish a measured value, or refuse to.
 *
 * This is the single gate between the engine and every surface that shows a
 * number — the headline tiles, the advanced grid and the exported card all read
 * from here. A value that is null, NaN, Infinity or negative never reaches the
 * DOM as a number: the tile keeps its em dash and the badge says why. Without
 * this gate a divide-by-zero in a throughput window renders as "NaN Mbps",
 * which looks like a measurement and is not one.
 *
 * @param {string} key
 * @param {unknown} value
 * @param {string} [whenMissing] state to use when the value is not publishable
 */
function publishMetric(key, value, whenMissing = MetricState.UNAVAILABLE) {
  const entry = VALUE_IDS[key];
  if (!entry) return;
  const [selector, digits] = entry;
  const ok = isMeasured(value);
  setMetric(selector, ok ? Number(value) : null, digits);
  setHeroMetric(key, ok ? Number(value) : null);
  setMetricState([key], settle(value, whenMissing));
}

/**
 * Live value during a phase: shows the number without settling the badge, which
 * stays on "measuring" until the phase actually ends. An in-flight reading is a
 * real measurement of this instant, but it is not the run's answer yet.
 *
 * @param {string} key
 * @param {unknown} value
 */
function publishLiveMetric(key, value) {
  const entry = VALUE_IDS[key];
  if (!entry || !isMeasured(value)) return;
  const [selector, digits] = entry;
  setMetric(selector, Number(value), digits);
  setHeroMetric(key, Number(value));
  if (metricStates[key] === MetricState.NOT_STARTED) setMetricState([key], MetricState.TESTING);
}

/** Blank every tile and reset every badge — used at load and on every re-run. */
function resetMetricCards() {
  metricStates = createMetricStates();
  for (const key of METRIC_KEYS) {
    const [selector, digits] = VALUE_IDS[key];
    setMetric(selector, null, digits);
    setHeroMetric(key, null);
    paintBadge(key);
  }
  renderHealth({ download: null, upload: null, ping: null, jitter: null, loss: null, dns: null, stability: null }, null, null);
}

// Track visibility changes to notify Web Worker
document.addEventListener("visibilitychange", () => {
  if (activeWorker) {
    activeWorker.postMessage({
      type: "visibility",
      data: { visible: !document.hidden },
    });
  }
});

let testRunning = false;

/** Put the whole result surface back to "nothing measured yet". */
function resetRunUi() {
  Object.assign(state, {
    download: null,
    upload: null,
    ping: null,
    jitter: null,
    loss: null,
    dns: null,
    stability: null,
    health: null,
    bufferbloat: null,
    degraded: false,
  });
  resetMetricCards();
  clearSparklines();
  resetReport();
  renderLatencyChart(qs("#latencyChart"), { samples: [] }, qs("#latencyChartDesc"));
  const probes = qs("#latencyProbes");
  if (probes) probes.textContent = "—";
  paintBufferbloat(null);
}

async function runSpeedTest() {
  if (testRunning) return;
  testRunning = true;

  const progress = qs("#testProgress");
  const status = qs("#testStatus");
  const degradedBanner = qs("#degradedBanner");
  const degradedReason = qs("#degradedReason");

  try {
    // ---- Start measuring FIRST -----------------------------------------
    // The worker is spawned and told to run before a single pixel changes, so
    // the button animation is a response to the click rather than a gate in
    // front of it. Nothing below this block delays the first byte.
    //
    // The debug flag rides on the worker's own URL: a Worker has no
    // localStorage and does not inherit the page's query string, so
    // `debugEnabled()` was always false inside it.
    const workerUrl = new URL("./worker/measure.js", import.meta.url);
    if (debugEnabled()) workerUrl.searchParams.set("debug", "1");
    activeWorker = new Worker(workerUrl, { type: "module" });

    // A worker that fails to parse or import never sends a message, so without
    // this the page would sit on "launching…" forever with no explanation.
    activeWorker.onerror = (event) => {
      logError("worker failed to start", event.message || "unknown");
      failRun(`The measurement engine could not start (${event.message || "worker error"}).`);
    };
    activeWorker.onmessage = onWorkerMessage;
    activeWorker.postMessage({ type: "start" });

    // ---- Then paint ------------------------------------------------------
    if (degradedBanner) degradedBanner.hidden = true;
    if (progress) progress.style.width = "0%";
    if (status) status.textContent = t("statusStarting");
    announce(t("statusStarting"));

    dialStops = [...BASE_STOPS];
    const ticks = qs("#dialTicks");
    if (ticks) ticks.innerHTML = "";
    renderDialTicks();
    setInstrumentState("running");
    setPhaseRail("select");
    setDial(0, "—", t("phaseFinding"), "ms", "ping");
    const note = qs("#dialNote");
    if (note) note.textContent = t("noteFinding");

    resetRunUi();
    coreMeasurementPriority(true);
    corePhase("latency", { intensity: 0.3, noise: 0 });
  } catch (error) {
    logError("could not start run", error);
    failRun(`The measurement engine could not start (${error.message}).`);
  }
}

/**
 * Everything the worker reports, in one place.
 *
 * Split out of `runSpeedTest` so the start path is only the four lines that
 * actually start a measurement, and so this can be read as what it is: a state
 * machine over the run.
 */
function onWorkerMessage(event) {
  const { type, data } = event.data;
  const status = qs("#testStatus");
  const progress = qs("#testProgress");

  if (type === "onPhase") {
    if (status) status.textContent = PHASE_COPY[data] || `Running ${data}...`;
    announce(PHASE_COPY[data] || String(data));
    setPhaseRail(data);
    const note = qs("#dialNote");
    if (note) note.textContent = PHASE_NOTE[data] || "";

    // Entering a phase puts its metrics on "measuring", which is what makes the
    // badge tell the truth mid-run instead of pre-claiming a result.
    if (data === "latency") {
      setMetricState(["ping", "jitter", "loss", "dns"], MetricState.TESTING);
      setDial(0, "—", t("phasePing"), "ms", "ping");
      corePhase("latency", { intensity: 0.35 });
    }
    if (data === "download") {
      setMetricState(["download", "bufferbloat"], MetricState.TESTING);
      corePhase("download", { intensity: 0.35 });
    }
    if (data === "upload") {
      setMetricState(["upload", "stability"], MetricState.TESTING);
      corePhase("upload", { intensity: 0.3 });
    }
    return;
  }

  if (type === "onProgress") {
    if (progress) progress.style.width = `${clamp(data, 0, 100)}%`;
    return;
  }

  if (type === "onMetric") {
    // Running values during a phase: shown live, badge stays "measuring".
    for (const key of ["ping", "jitter", "loss", "dns", "download", "upload", "stability"]) {
      if (data[key] !== undefined) publishLiveMetric(key, data[key]);
    }
    // Stability is the last thing the engine derives, after the upload window
    // closes — so it is a real signal that the run has reached its final step.
    if (data.stability !== undefined && data.stability !== null) setPhaseRail("stability");
    return;
  }

  if (type === "onEdge") {
    state.edgeLabel = data.label;
    setEdgeLabel(data.label);
    return;
  }

  if (type === "onFallback") {
    const banner = qs("#degradedBanner");
    const reason = qs("#degradedReason");
    if (banner && reason) {
      banner.hidden = false;
      reason.textContent = `${data.name || "Primary edge"} failed (${data.error}). Measuring against the next edge instead.`;
    }
    state.degraded = true;
    return;
  }

  if (type === "onLatencyProbe") {
    if (data.lastRtt !== null && Number.isFinite(data.lastRtt)) {
      // The arc is progress through the probe budget; the number is real
      // milliseconds. Two different things, deliberately.
      setDial(clamp(data.done / Math.max(1, data.all), 0, 1), data.lastRtt.toFixed(0), t("phasePing"), "ms", "ping");
      pushGraphSample("ping", data.lastRtt);
      corePulse();
    }
    return;
  }

  if (type === "onDownloadSample") {
    setDialSpeed(data.mbps, "down");
    pushGraphSample("down", data.mbps);
    publishLiveMetric("download", data.mbps);
    networkCore?.setIntensity(coreIntensity(data.mbps));
    return;
  }

  if (type === "onUploadSample") {
    setDialSpeed(data.mbps, "up");
    pushGraphSample("up", data.mbps);
    publishLiveMetric("upload", data.mbps);
    networkCore?.setIntensity(coreIntensity(data.mbps));
    return;
  }

  if (type === "onLatencyDetail") {
    // The latency phase is over, so its metrics settle now rather than waiting
    // for the whole run: they are finished readings, and a badge that still
    // says "measuring" through the download is stale.
    renderLatencyPanel(data);
    publishMetric("ping", data.ping);
    publishMetric("jitter", data.jitter);
    publishMetric("loss", data.loss);
    // The flow frays in proportion to how irregular the link actually is.
    const jitter = Number.isFinite(data.jitter) ? data.jitter : 0;
    const loss = Number.isFinite(data.loss) ? data.loss : 0;
    coreNoise(clamp(jitter / 45 + loss / 12, 0, 1));
    // The report starts filling in as soon as there is something real in it,
    // rather than appearing all at once at the end.
    revealReport();
    const debugPre = qs("#debugLatencyArray");
    if (debugPre) debugPre.textContent = JSON.stringify(data.samples, null, 2);
    return;
  }

  if (type === "onBufferbloat") {
    // Null when too few probes survived the saturated link to grade it.
    state.downloadBloat = data;
    renderBufferbloat(data);
    publishMetric("bufferbloat", data ? data.increase : null);
    return;
  }

  if (type === "onUploadBufferbloat") {
    // Latency under UPLOAD load — frequently the worse of the two on an
    // asymmetric line, and the one that breaks a call while photos back up.
    state.uploadBloat = data;
    const worse =
      state.downloadBloat && data
        ? data.increase > state.downloadBloat.increase
          ? data
          : state.downloadBloat
        : data || state.downloadBloat;
    if (worse) {
      renderBufferbloat(worse);
      publishMetric("bufferbloat", worse.increase);
    }
    return;
  }

  if (type === "complete") {
    completeRun(data);
    return;
  }

  if (type === "aborted") {
    endRun();
    // Cancellation invalidates every partial reading on screen. Leaving a
    // half-measured download visible would present the first two seconds of a
    // transfer as the connection's speed.
    resetRunUi();
    if (status) status.textContent = t("statusCancelled");
    announce(t("statusCancelled"));
    return;
  }

  if (type === "error") {
    endRun();
    logError("run failed", data.message);
    // Whatever phase was in flight has no honest value. Anything already
    // settled to MEASURED keeps its badge, because those readings did land.
    for (const key of METRIC_KEYS) {
      if (metricStates[key] === MetricState.TESTING) setMetricState([key], MetricState.ERROR);
    }
    const message = describeFailure(data.message);
    if (status) status.textContent = message;
    announce(message);
    const debugErrors = qs("#debugErrorsList");
    if (debugErrors) {
      const li = document.createElement("li");
      li.textContent = data.message;
      debugErrors.appendChild(li);
    }
  }
}

/**
 * Everything about the finished run, assembled once.
 *
 * One function builds this so the technical drawer, the exported JSON and any
 * future export cannot drift into describing the same run differently. Nothing
 * identifying goes in: the client string is the browser and platform the
 * measurement was taken on, which changes how a result should be read, and the
 * IP address is not here because it explains nothing about the numbers.
 *
 * @returns {object}
 */
function measurementRecord() {
  return {
    at: Date.now(),
    edgeLabel: state.edgeLabel,
    client: state.network ? `${state.network.browser} · ${state.network.os} · ${state.network.device}` : null,
    result: {
      download: state.download,
      upload: state.upload,
      ping: state.ping,
      jitter: state.jitter,
      loss: state.loss,
      dns: state.dns,
      stability: state.stability,
    },
    quality: state.quality,
    evidence: state.evidence,
    bufferbloat: state.bufferbloat,
    downloadBloat: state.downloadBloat,
    uploadBloat: state.uploadBloat,
    uploadNote: state.uploadNote,
    metricStates: { ...metricStates },
    healthScore: state.health,
  };
}

/** @param {object} outcome */
function completeRun(outcome) {
  const status = qs("#testStatus");
  setPhaseRail("analyse");

  Object.assign(state, {
    quality: outcome.quality ?? null,
    evidence: outcome.evidence ?? null,
    downloadBloat: outcome.downloadBloat ?? null,
    uploadBloat: outcome.uploadBloat ?? null,
    uploadNote: outcome.uploadNote ?? null,
    download: outcome.result.download,
    upload: outcome.result.upload,
    ping: outcome.result.ping,
    jitter: outcome.result.jitter,
    loss: outcome.result.loss,
    dns: outcome.result.dns,
    stability: outcome.result.stability,
    bufferbloat: outcome.bufferbloat,
  });

  // Settle every badge against the value that actually came back. Upload is the
  // one metric a run is allowed to finish without, and the outcome carries the
  // reason — so it settles to "failed" with an explanation rather than silently
  // to "unavailable".
  publishMetric("download", state.download, MetricState.ERROR);
  publishMetric("upload", state.upload, outcome.uploadNote ? MetricState.ERROR : MetricState.UNAVAILABLE);
  publishMetric("ping", state.ping);
  publishMetric("jitter", state.jitter);
  publishMetric("loss", state.loss);
  publishMetric("dns", state.dns);
  publishMetric("stability", state.stability);
  publishMetric("bufferbloat", state.bufferbloat ? state.bufferbloat.increase : null);

  coreMeasurementPriority(false);

  // What the run is willing to claim for itself, and the record that backs it.
  renderQuality(state.quality);
  renderTechnical(measurementRecord());

  updateScores();
  setDialSpeed(isMeasured(state.download) ? state.download : 0, "down");
  setInstrumentState("done");
  setPhaseRail(null, true);
  corePhase("idle", { intensity: 0.2 });

  const note = qs("#dialNote");
  if (note) note.textContent = t("noteDone");

  saveHistoryEntry({
    at: Date.now(),
    download: state.download,
    upload: state.upload,
    ping: state.ping,
    isp: state.network ? state.network.isp : null,
    edgeCity: state.network ? state.network.edgeCity : null,
  });
  renderHistory();
  revealReport();

  log("complete", outcome.result);
  // The note names the one metric that could not be produced, so the finished
  // state does not read as a clean sweep when it was not.
  // `state.health` is null when the run could not be scored, and interpolating
  // that read "Connection health null/100 — —" to every user and every screen
  // reader on the aria-live channel.
  const band = healthBand(state.health);
  const scored = typeof state.health === "number" && Number.isFinite(state.health);
  const message = !scored
    ? "Finished, but this run could not be scored — the latency phase returned too few probes. The figures that were measured are shown below."
    : outcome.uploadNote
      ? `Finished, but the upload could not be measured (${outcome.uploadNote}). Everything else on screen is a real reading. Health ${state.health}/100.`
      : `Finished. Connection health ${state.health}/100 — ${band.grade}. Result card, link and sharing are ready below.`;
  if (status) status.textContent = message;
  announce(message);

  releaseWorker();
  testRunning = false;

  // Take the reader to the report, once, and only if they have not already
  // scrolled somewhere themselves. Hijacking a scroll a person started is worse
  // than making them scroll.
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!reduced) {
    window.setTimeout(() => {
      const results = qs("#results");
      if (results && !results.hidden) results.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 700);
  }
}

/**
 * Tear down the running-test UI. Every terminal path goes through here, so
 * "stop the spinner" cannot be implemented four times and forgotten in one.
 *
 * @param {{ release?: boolean }} [options] `release: false` leaves the worker
 *   alive on purpose — a cancel needs it to survive long enough to abort its own
 *   fetches, and killing it here is exactly the race this code had.
 */
function endRun({ release = true } = {}) {
  // Releasing here rather than at each call site is what guarantees no run —
  // finished, failed or cancelled — leaves a thread alive holding open sockets.
  if (release) releaseWorker();
  coreMeasurementPriority(false);
  const progress = qs("#testProgress");
  if (progress) progress.style.width = "0%";
  setInstrumentState("idle");
  setPhaseRail(null);
  corePhase("idle", { intensity: 0.16, noise: 0 });
  testRunning = false;
}

/**
 * Terminal failure before or outside the worker's own error message.
 *
 * @param {string} message
 */
function failRun(message) {
  if (activeWorker) {
    activeWorker.terminate();
    activeWorker = null;
  }
  endRun({ release: false });
  const status = qs("#testStatus");
  if (status) status.textContent = message;
  announce(message);
  logError("run aborted", message);
}

function describeFailure(message) {
  const raw = String(message || "");
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "Test failed: this device is offline. Reconnect and press Start again.";
  }
  if (/no latency samples/i.test(raw)) {
    return "Test failed: no latency probe reached the measurement edge. A VPN, firewall or ad blocker may be blocking speed.cloudflare.com.";
  }
  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return "Test failed: the measurement server stopped responding. This is usually a dropped connection, a blocked request, or an edge that is temporarily down.";
  }
  if (/abort|timeout|timed out/i.test(raw)) {
    return "Test failed: the measurement timed out before enough data moved to produce a result.";
  }
  return `Test failed: ${raw}`;
}

/**
 * How long to let the worker wind itself down before killing it outright.
 *
 * A cancelled run has to stop MOVING BYTES, not merely stop drawing. The worker
 * needs one turn of its message loop to receive `stop` and fire the engine's
 * AbortController, which is what actually aborts the open streams.
 */
const CANCEL_GRACE_MS = 1500;

/** Kill timer for a cancel that the worker never acknowledged. */
let cancelTimer = null;

/**
 * CANCEL. Aborts the in-flight transfers, tears the worker down, and returns
 * the page to idle without recording a result.
 *
 * The order matters, and getting it wrong is invisible on screen. Posting `stop`
 * and calling `terminate()` back to back — as this did — destroys the worker
 * before its message loop can run the handler, so the AbortController never
 * fires and the browser keeps eight 25 MB downloads streaming to a dead thread.
 * The UI said "cancelled" while the connection stayed saturated; measured with
 * Playwright, six requests were still in flight three seconds after the click.
 *
 * So: post `stop`, let the worker abort its own fetches and answer with
 * `aborted`, and terminate on that acknowledgement. `CANCEL_GRACE_MS` is the
 * backstop for a worker too wedged to answer at all.
 */
function stopSpeedTest() {
  if (!activeWorker) return;
  activeWorker.postMessage({ type: "stop" });

  window.clearTimeout(cancelTimer);
  cancelTimer = window.setTimeout(() => {
    if (activeWorker) {
      logError("cancel", "worker did not acknowledge — terminating");
      activeWorker.terminate();
      activeWorker = null;
    }
  }, CANCEL_GRACE_MS);

  // The UI goes idle immediately: the click is the user's decision and must not
  // appear to hang while the streams unwind. The worker stays alive until it
  // acknowledges, or until the grace timer above kills it.
  endRun({ release: false });
  resetRunUi();
  const status = qs("#testStatus");
  if (status) status.textContent = t("statusCancelled");
  announce(t("statusCancelled"));
}

/** Release the worker once it has finished with it. */
function releaseWorker() {
  window.clearTimeout(cancelTimer);
  cancelTimer = null;
  if (activeWorker) {
    activeWorker.terminate();
    activeWorker = null;
  }
}

function updateBandwidth() {
  const devices = Number(qs("#devices").value);
  const streams = Number(qs("#streams").value);
  const gamers = Number(qs("#gamers").value);
  const workers = Number(qs("#workers").value);
  const required = Math.round(devices * 3 + streams * 25 + gamers * 8 + workers * 12 + 15);
  qs("#devicesLabel").textContent = devices;
  qs("#streamsLabel").textContent = streams;
  qs("#gamersLabel").textContent = gamers;
  qs("#workersLabel").textContent = workers;
  qs("#bandwidthResult").textContent = required;
  qs("#bandwidthAdvice").textContent = `A ${required <= 100 ? "100 Mbps" : required <= 250 ? "250 Mbps" : "500 Mbps or higher"} plan is a practical baseline for this household.`;
}

function updatePingCalculator() {
  const target = Number(qs("#gameSelect").value);
  const ping = Number(qs("#pingInput").value);
  const grade = ping <= target ? "A" : ping <= target + 30 ? "B" : ping <= target + 60 ? "C" : "D";
  qs("#pingGrade").textContent = grade;
  qs("#pingAdvice").textContent = grade === "A" ? "Excellent for competitive matches. Keep jitter under 10 ms." :
    grade === "B" ? "Playable, but Ethernet or 5 GHz WiFi can improve consistency." :
    grade === "C" ? "Lag is likely. Close background downloads and choose a closer server." :
    "Too high for competitive gaming. Check routing, signal quality, and ISP congestion.";
}

function shareResult() {
  // Every one of these can be null on a partial run, and only `upload` was
  // guarded — so a shared result read "…, null ms ping, null ms jitter." in
  // somebody else's chat window.
  const say = (value, unit) => (Number.isFinite(value) ? `${value} ${unit}` : `${unit} not measured`);
  const up = state.upload === null ? "upload not measured" : `${state.upload.toFixed(1)} Mbps up`;
  const text = state.download
    ? `WifiPlus Speed Test Result: ${state.download.toFixed(1)} Mbps down, ${up}, ${say(state.ping, "ms ping")}, ${say(state.jitter, "ms jitter")}.`
    : "Test your internet speed with WifiPlus.";
  if (navigator.share) {
    navigator.share({ title: "WifiPlus Speed Test Result", text, url: location.href.split("#")[0] }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(`${text} ${location.href.split("#")[0]}`);
    qs("#testStatus").textContent = "Share text copied to clipboard.";
  }
}

function copyResultJson() {
  const status = qs("#testStatus");
  if (state.download === null) {
    if (status) status.textContent = "Nothing to copy yet — press Start to measure your connection first.";
    return;
  }
  // The full record, not a summary. A result that cannot be recomputed from
  // what it carries is a claim rather than a measurement, and the per-metric
  // states travel with it so a reader can see which figures were measured and
  // which were unavailable instead of inferring it from a null.
  const jsonString = JSON.stringify(
    { schema: "wifiplus.measurement/2", userAgent: navigator.userAgent, ...measurementRecord() },
    null,
    2,
  );
  if (navigator.clipboard) {
    navigator.clipboard
      .writeText(jsonString)
      .then(() => {
        if (status) status.textContent = "Full measurement record copied as JSON — bytes, spans, sample counts and every check the run ran on itself.";
      })
      .catch(() => {
        if (status) status.textContent = jsonString;
      });
  } else if (status) {
    status.textContent = jsonString;
  }
}

/**
 * Export the result as an image.
 *
 * The renderer is imported on demand: it is only ever needed after a run, and
 * loading it up front would put a module on the critical path of a page whose
 * whole promise is being fast.
 */
async function downloadResultCard() {
  const status = qs("#testStatus");
  if (state.download === null) {
    if (status) status.textContent = "No result to put on a card yet — press Start to measure your connection first.";
    return;
  }
  try {
    const { drawResultCard } = await import("./ui/result-card.js");
    const canvas = await drawResultCard(state, {
      score: state.health,
      bufferbloat: state.bufferbloat || null,
      states: metricStates,
      isp: state.network ? state.network.isp : null,
      edge: state.edgeLabel || (state.network ? state.network.edgeCity : null),
    });
    const link = document.createElement("a");
    link.download = `wifiplus-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    if (status) status.textContent = "Result card saved. It carries the same badges as this page — nothing on it claims more than was measured.";
  } catch (error) {
    logError("result card", error);
    if (status) status.textContent = `The result card could not be generated (${error.message}).`;
  }
}

// The `accept` attribute is a file-picker hint, not a guarantee — re-check the
// type and size here, and revoke the previous blob URL so previews don't leak.
const ALLOWED_UPLOAD_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
let activePreviewUrl = null;

function handleUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const preview = qs("#uploadPreview");

  if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
    event.target.value = "";
    preview.textContent = "Unsupported file. Upload a PNG, JPEG, or WebP screenshot.";
    return;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    event.target.value = "";
    preview.textContent = "Screenshot is too large. Upload an image under 8 MB.";
    return;
  }

  if (activePreviewUrl) URL.revokeObjectURL(activePreviewUrl);
  activePreviewUrl = URL.createObjectURL(file);

  const image = document.createElement("img");
  image.alt = "Uploaded router settings screenshot preview";
  image.src = activePreviewUrl;
  preview.textContent = "";
  preview.appendChild(image);

  analyseRouterScreenshot(file);
}

// ---- AI router screenshot analysis ---------------------------------------
// The image is sent to our own Worker, which holds the Anthropic API key. The key
// is never in this file — anything shipped to the browser is public.
const ANALYZER_ENDPOINT = "https://wifiplus-router-analyzer.example.workers.dev";
// Router pages are dense text; downscaling too far makes the mode and channel
// unreadable. 2000px is within what the model accepts at full fidelity.
const MAX_ANALYSIS_EDGE = 2000;

const DOCTOR_FIELDS = {
  security: "#doctorSecurity",
  channels: "#doctorChannel",
  placement: "#doctorPlacement",
  performance: "#doctorPerformance",
};

const DOCTOR_DEFAULTS = {
  security: "Enable WPA3 if available. Disable WPS and use a strong unique password.",
  channels: "Use channels 1, 6, or 11 on 2.4 GHz. Prefer 5 GHz or 6 GHz near the router.",
  placement: "Keep the router central, elevated, and away from thick walls or metal cabinets.",
  performance: "Separate smart home devices from high-speed devices and keep firmware updated.",
};

function setDoctorStatus(message) {
  Object.values(DOCTOR_FIELDS).forEach((selector) => {
    qs(selector).textContent = message;
  });
}

function resetDoctorFields() {
  Object.entries(DOCTOR_FIELDS).forEach(([key, selector]) => {
    qs(selector).textContent = DOCTOR_DEFAULTS[key];
  });
}

// Draw to a canvas so the upload is re-encoded and downscaled: smaller payloads,
// and EXIF metadata (which can carry GPS coordinates) is dropped in the process.
function toAnalysisPayload(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_ANALYSIS_EDGE / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/webp", 0.9);
      resolve({ media_type: "image/webp", data: dataUrl.split(",")[1] });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image could not be decoded."));
    };
    image.src = url;
  });
}

function renderAnalysis(result) {
  if (!result.is_router_screenshot) {
    resetDoctorFields();
    qs("#doctorSecurity").textContent =
      "That does not look like a router settings page. Upload a screenshot of your router's admin panel.";
    return;
  }

  // Every category starts from its finding-free default so a clean config reads as
  // clean, rather than leaving last upload's warning on screen.
  const byCategory = {
    security: [],
    channels: [],
    placement: [],
    performance: [],
  };
  result.findings.forEach((finding) => {
    if (byCategory[finding.category]) byCategory[finding.category].push(finding);
  });

  Object.entries(DOCTOR_FIELDS).forEach(([key, selector]) => {
    const findings = byCategory[key];
    qs(selector).textContent = findings.length
      ? findings.map((f) => `${f.title}: ${f.detail}`).join(" ")
      : DOCTOR_DEFAULTS[key];
  });
}

async function analyseRouterScreenshot(file) {
  setDoctorStatus("Analysing your screenshot...");
  try {
    const payload = await toAnalysisPayload(file);
    const response = await fetch(ANALYZER_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const { error } = await response.json().catch(() => ({}));
      throw new Error(error || "Analysis failed.");
    }
    renderAnalysis(await response.json());
  } catch (error) {
    resetDoctorFields();
    qs("#doctorSecurity").textContent = `Could not analyse the screenshot: ${error.message}`;
  }
}

function applyLanguage(requested) {
  // Persisted values are attacker-writable in a shared browser; only ever apply
  // a language we actually ship, so nothing arbitrary reaches the lang attribute.
  const language = Object.prototype.hasOwnProperty.call(translations, requested) ? requested : "en";
  activeLanguage = language;
  document.documentElement.lang = language;
  document.documentElement.dir = ["ar", "ur"].includes(language) ? "rtl" : "ltr";

  // A key with no entry anywhere leaves the element untouched. Falling back to
  // the key name is how a report ends up displaying "pathNote" to a reader.
  qsa("[data-i18n]").forEach((element) => {
    const value = lookup(element.dataset.i18n);
    if (value !== undefined) element.textContent = value;
  });
  // Two strings carry inline emphasis. They come from the constant table above,
  // never from anything a user or a server supplied, which is the only reason
  // setting innerHTML here is safe — and the reason the attribute is separate
  // rather than a flag on the ordinary one.
  qsa("[data-i18n-html]").forEach((element) => {
    const value = lookup(element.dataset.i18nHtml);
    if (value !== undefined) element.innerHTML = value;
  });

  // Anything the interface says while a run is idle has to be re-said in the
  // new language; anything mid-run keeps the wording the run produced.
  if (!testRunning) {
    setInstrumentState(qs("#results")?.hidden === false ? "done" : "idle");
  }
  localStorage.setItem("wifiplus-language", language);
}

function initTheme() {
  const saved = localStorage.getItem("wifiplus-theme");
  if (saved === "dark" || saved === "light") document.documentElement.dataset.theme = saved;
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("wifiplus-theme", next);
  // A canvas cannot inherit CSS, so both the 3D scene and the sparklines have to
  // be told the palette changed or they keep the old theme's colours.
  networkCore?.refreshTheme();
  redrawSparklines();
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

let deferredInstallPrompt = null;

/**
 * Install, offered once and from one place.
 *
 * The old hero carried a permanently visible "Install App" button that did
 * nothing at all in browsers that never fire `beforeinstallprompt` — which is
 * most of them. The banner below only appears when there is a real prompt to
 * show, and remembers being dismissed.
 */
function setupInstallPrompt() {
  const banner = qs("#installPromptBanner");
  const accept = qs("#installPromptAccept");
  const dismiss = qs("#installPromptDismiss");
  if (!banner || !accept || !dismiss) return;

  const DISMISS_KEY = "wifiplus-install-dismissed";

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
    // Not during a run: a banner sliding in mid-measurement is a layout shift
    // on the one screen that must not move.
    window.setTimeout(() => {
      if (!testRunning) banner.hidden = false;
    }, 6000);
  });

  window.addEventListener("appinstalled", () => {
    banner.hidden = true;
    deferredInstallPrompt = null;
  });

  dismiss.addEventListener("click", () => {
    banner.hidden = true;
    localStorage.setItem(DISMISS_KEY, "1");
  });

  accept.addEventListener("click", async () => {
    banner.hidden = true;
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => {});
    deferredInstallPrompt = null;
  });
}

/** The header only materialises once the page has actually moved. */
function setupHeader() {
  const header = qs(".site-header");
  if (!header) return;
  const sentinel = document.createElement("div");
  sentinel.setAttribute("aria-hidden", "true");
  sentinel.style.cssText = "position:absolute;top:0;height:1px;width:1px;";
  document.body.prepend(sentinel);
  if (typeof IntersectionObserver === "undefined") {
    header.classList.add("stuck");
    return;
  }
  new IntersectionObserver(
    ([entry]) => header.classList.toggle("stuck", !entry.isIntersecting),
    { threshold: 0 },
  ).observe(sentinel);
}

function bindEvents() {
  const on = (selector, event, handler, options) => {
    const el = qs(selector);
    if (el) el.addEventListener(event, handler, options);
  };

  on("#menuButton", "click", () => {
    const nav = qs("#navLinks");
    const isOpen = nav.classList.toggle("open");
    document.body.classList.toggle("menu-open", isOpen);
    qs("#menuButton").setAttribute("aria-expanded", String(isOpen));
  });
  qsa(".nav-links a").forEach((link) =>
    link.addEventListener("click", () => {
      qs("#navLinks")?.classList.remove("open");
      document.body.classList.remove("menu-open");
      qs("#menuButton")?.setAttribute("aria-expanded", "false");
    }),
  );
  // Escape closes the mobile menu, because a full-screen overlay with no
  // keyboard exit is a trap.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (qs("#navLinks")?.classList.contains("open")) {
      qs("#navLinks").classList.remove("open");
      document.body.classList.remove("menu-open");
      qs("#menuButton")?.setAttribute("aria-expanded", "false");
      qs("#menuButton")?.focus();
    }
  });

  on("#themeToggle", "click", toggleTheme);
  on("#languageSelect", "change", (event) => applyLanguage(event.target.value));

  // ---- The test -----------------------------------------------------------
  const go = qs("#goButton");
  if (go) {
    go.addEventListener("click", () => {
      if (testRunning) return;
      runSpeedTest();
      // Purely a response to the press. The worker already has its start
      // message by the time this class lands.
      go.classList.remove("pressed");
      void go.offsetWidth;
      go.classList.add("pressed");
      window.setTimeout(() => go.classList.remove("pressed"), 320);
    });
  }
  on("#stopTest", "click", stopSpeedTest);
  on("#bottomNavGo", "click", (event) => {
    event.preventDefault();
    qs("#speed-test")?.scrollIntoView({ behavior: "smooth" });
    if (!testRunning) runSpeedTest();
  });

  // Connection loss during a run invalidates the numbers still in flight, so
  // say so rather than letting a stalled transfer read as a slow link.
  window.addEventListener("offline", () => {
    const banner = qs("#offlineBanner");
    if (banner) banner.hidden = false;
    activeWorker?.postMessage({ type: "offline" });
    if (testRunning) {
      logError("network", "went offline mid-run");
      stopSpeedTest();
      const status = qs("#testStatus");
      if (status) {
        status.textContent =
          "Test cancelled: this device went offline mid-measurement, so the partial readings were discarded.";
      }
    }
  });
  window.addEventListener("online", () => {
    const banner = qs("#offlineBanner");
    if (banner) banner.hidden = true;
  });
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const banner = qs("#offlineBanner");
    if (banner) banner.hidden = false;
  }

  // ---- Result actions ------------------------------------------------------
  on("#downloadCard", "click", downloadResultCard);
  on("#shareResult", "click", shareResult);
  on("#copyResultLink", "click", copyResultLink);
  on("#copyResultJson", "click", copyResultJson);
  on("#clearHistory", "click", () => {
    clearHistory();
    renderHistory();
  });
  on("#connIp", "click", () => {
    isIpMasked = !isIpMasked;
    qs("#connIp").textContent = formatIpDisplay(rawClientIp);
  });

  // ---- ISP intelligence and tools -----------------------------------------
  on("#countrySelect", "change", () => { state.scopedGlobal = false; updateCityOptions(); });
  on("#citySelect", "change", () => { state.scopedGlobal = false; updateProviderOptions(); });
  on("#providerSelect", "change", renderSelectedProvider);
  on("#sortSelect", "change", renderComparison);
  on("#globalScopeButton", "click", () => {
    state.scopedGlobal = !state.scopedGlobal;
    qs("#globalScopeButton").textContent = state.scopedGlobal ? "Show Selected City" : "Show Worldwide";
    renderComparison();
    renderAvailability();
  });
  qsa(".tab-button").forEach((button) =>
    button.addEventListener("click", () => {
      qsa(".tab-button").forEach((tab) => tab.classList.remove("active"));
      button.classList.add("active");
      state.ranking = button.dataset.rank;
      renderRankings();
    }),
  );
  on("#recCountry", "change", updateRecCityOptions);
  on("#recommendButton", "click", recommendProviders);
  ["#gamingNeed", "#streamingNeed"].forEach((selector) =>
    on(selector, "input", () => {
      const label = qs(`${selector}Label`);
      if (label) label.textContent = qs(selector).value;
    }),
  );
  ["#devices", "#streams", "#gamers", "#workers"].forEach((selector) => on(selector, "input", updateBandwidth));
  on("#gameSelect", "change", updatePingCalculator);
  on("#pingInput", "input", updatePingCalculator);
  on("#routerUpload", "change", handleUpload);
  qsa(".seo-jump").forEach((link) =>
    link.addEventListener("click", (event) => {
      const country = event.currentTarget.dataset.country;
      const city = event.currentTarget.dataset.city;
      const countrySelect = qs("#countrySelect");
      if (!countrySelect) return;
      if ([...countrySelect.options].some((option) => option.value === country)) {
        countrySelect.value = country;
        updateCityOptions();
        const citySelect = qs("#citySelect");
        if (citySelect && [...citySelect.options].some((option) => option.value === city)) {
          citySelect.value = city;
          updateProviderOptions();
        }
      }
    }),
  );

  // ---- Sheets and bottom nav ------------------------------------------------
  const backdrop = qs("#bottomSheetBackdrop");
  const closeSheets = () => {
    backdrop?.classList.remove("open");
    qsa(".bottom-sheet").forEach((sheet) => sheet.classList.remove("open"));
    document.body.classList.remove("sheet-open");
  };
  backdrop?.addEventListener("click", closeSheets);
  on("#closeAiDoctorSheet", "click", closeSheets);

  qsa(".mobile-bottom-nav .nav-item").forEach((item) =>
    item.addEventListener("click", () => {
      qsa(".mobile-bottom-nav .nav-item").forEach((nav) => nav.classList.remove("active"));
      item.classList.add("active");
    }),
  );

  // Badges reflect "not tested" from the moment the page paints, rather than
  // inheriting whatever the markup shipped with.
  resetMetricCards();
}

/* ---------------------------------------------------------------------------
   Boot.
   The order below is the priority order of the page: theme (so nothing flashes),
   then the instrument, then the identity strip, then everything that is not the
   speed test. The 3D scene and the ISP database both load AFTER first paint —
   neither is allowed to delay the dial.
   ------------------------------------------------------------------------- */
initTheme();
setupHeader();
bindEvents();
setInstrumentState("idle");
renderDialTicks();

const detectedLanguage = (navigator.language || "en").slice(0, 2);
const savedLanguage = localStorage.getItem("wifiplus-language");
const language = savedLanguage || (translations[detectedLanguage] ? detectedLanguage : "en");
const languageSelect = qs("#languageSelect");
if (languageSelect) languageSelect.value = language;
applyLanguage(language);

// Identify the connection up front so the strip is populated before anyone
// presses Start, then restore local history and any shared result in the URL.
renderConnection();
renderHistory();
applyResultFromHash();
// A shared link opened from inside the page changes only the fragment, which is
// a same-document navigation: the module never re-evaluates, so the result has
// to be applied on the event as well as at boot.
window.addEventListener("hashchange", () => {
  if (!testRunning) applyResultFromHash();
});
setupInstallPrompt();
registerServiceWorker();

/**
 * Everything that is not the speed test, deferred.
 *
 * The ISP database is a JSON fetch and eleven render passes for content that
 * lives several screens down; the 3D scene is a module and a GPU context. Both
 * used to run during boot, competing with the dial for the main thread on the
 * one interaction the page exists for.
 */
function whenIdle(task, timeout = 1200) {
  if (typeof requestIdleCallback === "function") requestIdleCallback(task, { timeout });
  else window.setTimeout(task, 200);
}

async function initIspData() {
  const { fetchIspData } = await import("./core/isp-data.js");
  providers = await fetchIspData();
  initLocationControls();
  renderRegions();
  renderRankings();
  renderSeoPages();
  updateBandwidth();
  updatePingCalculator();
  recommendProviders();
}

whenIdle(() => {
  setupNetworkCore();
});
whenIdle(() => {
  initIspData().catch((error) => logError("isp data", error));
}, 3000);

// Panels below the fold fade in as they are reached. One shared observer, not
// one per element, and it disconnects each element after it has been revealed.
whenIdle(() => {
  if (typeof IntersectionObserver === "undefined") {
    qsa(".section .card, .section .panel").forEach((node) => node.classList.add("animate-in"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("animate-in");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
  );
  qsa(".section .card").forEach((node) => {
    node.classList.add("animate-panel");
    observer.observe(node);
  });
}, 2000);

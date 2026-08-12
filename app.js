/**
 * WifiPlus — static site shell.
 *
 * All measurement, scoring, history and permalink logic lives in `core/`, which
 * the Next.js app in `web/` imports from too. This file is deliberately only the
 * DOM layer for that engine: rendering, wiring and page state. Anything that
 * computes a number belongs in core, so the two front ends can never disagree.
 */
import { TestAborted } from "./core/measure.js";
import { runMeasurement } from "./core/run.js";
import { BASE_STOPS, fractionFor, labelFor, needleAngle, pointOnArc } from "./core/gauge.js";
import { detectNetwork, localNetInfo } from "./core/netinfo.js";
import { bufferbloatVerdict, healthVerdict, qualityScores } from "./core/scoring.js";
import { clearHistory, downloadDelta, loadHistory, saveHistoryEntry } from "./core/history.js";
import { resultFromHash, resultLink } from "./core/permalink.js";
import { generateAiDiagnosis } from "./core/ai-doctor.js";

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
  scopedGlobal: false,
  ranking: "world"
};

let activeTestController = null;

const translations = {
  en: { heroTitle: "WifiPlus — test your internet speed anywhere on Earth", heroCopy: "WifiPlus measures speed, latency, DNS response, packet loss, and WiFi health, then compares results against providers in every major global region.", startTest: "Start Global Test" },
  hi: { heroTitle: "दुनिया में कहीं भी इंटरनेट स्पीड टेस्ट करें", heroCopy: "WifiPlus स्पीड, लेटेंसी, DNS, पैकेट लॉस और WiFi हेल्थ मापता है और परिणामों की तुलना वैश्विक प्रदाताओं से करता है.", startTest: "ग्लोबल टेस्ट शुरू करें" },
  ar: { heroTitle: "اختبر سرعة الإنترنت في أي مكان في العالم", heroCopy: "يقيس WifiPlus السرعة وزمن الاستجابة وDNS وفقدان الحزم وصحة WiFi ثم يقارن النتائج بمزودي الخدمة عالميًا.", startTest: "ابدأ الاختبار العالمي" },
  es: { heroTitle: "Prueba tu velocidad de internet en cualquier lugar", heroCopy: "WifiPlus mide velocidad, latencia, DNS, pérdida de paquetes y salud WiFi, y compara resultados con proveedores globales.", startTest: "Iniciar prueba global" },
  fr: { heroTitle: "Testez votre débit internet partout dans le monde", heroCopy: "WifiPlus mesure débit, latence, DNS, perte de paquets et santé WiFi, puis compare les résultats aux fournisseurs mondiaux.", startTest: "Lancer le test global" },
  de: { heroTitle: "Teste deine Internetgeschwindigkeit weltweit", heroCopy: "WifiPlus misst Geschwindigkeit, Latenz, DNS, Paketverlust und WiFi-Zustand und vergleicht Ergebnisse mit globalen Anbietern.", startTest: "Globalen Test starten" },
  pt: { heroTitle: "Teste sua internet em qualquer lugar do mundo", heroCopy: "WifiPlus mede velocidade, latência, DNS, perda de pacotes e saúde do WiFi, comparando resultados com provedores globais.", startTest: "Iniciar teste global" },
  zh: { heroTitle: "在全球任何地方测试网速", heroCopy: "WifiPlus 测量速度、延迟、DNS、丢包和 WiFi 健康，并与全球主要运营商对比。", startTest: "开始全球测试" },
  ja: { heroTitle: "世界中どこでもインターネット速度を測定", heroCopy: "WifiPlus は速度、遅延、DNS、パケット損失、WiFi 健康度を測定し、世界のプロバイダーと比較します。", startTest: "グローバルテスト開始" },
  ko: { heroTitle: "전 세계 어디서나 인터넷 속도 테스트", heroCopy: "WifiPlus는 속도, 지연, DNS, 패킷 손실, WiFi 상태를 측정하고 글로벌 제공업체와 비교합니다.", startTest: "글로벌 테스트 시작" },
  ru: { heroTitle: "Проверьте скорость интернета в любой стране", heroCopy: "WifiPlus измеряет скорость, задержку, DNS, потери пакетов и состояние WiFi, сравнивая результаты с мировыми провайдерами.", startTest: "Начать глобальный тест" },
  tr: { heroTitle: "Dunyanin her yerinde internet hizini test edin", heroCopy: "WifiPlus hiz, gecikme, DNS, paket kaybi ve WiFi sagligini olcer, sonuclari kuresel saglayicilarla karsilastirir.", startTest: "Global testi baslat" },
  id: { heroTitle: "Uji kecepatan internet di mana saja", heroCopy: "WifiPlus mengukur kecepatan, latensi, DNS, packet loss, dan kesehatan WiFi, lalu membandingkan hasil dengan penyedia global.", startTest: "Mulai tes global" },
  bn: { heroTitle: "বিশ্বের যেকোনো জায়গায় ইন্টারনেট স্পিড টেস্ট করুন", heroCopy: "WifiPlus স্পিড, লেটেন্সি, DNS, প্যাকেট লস এবং WiFi স্বাস্থ্য মাপে এবং ফলাফল বিশ্বব্যাপী প্রদানকারীদের সঙ্গে তুলনা করে।", startTest: "গ্লোবাল টেস্ট শুরু করুন" },
  ur: { heroTitle: "دنیا میں کہیں بھی انٹرنیٹ اسپیڈ ٹیسٹ کریں", heroCopy: "WifiPlus رفتار، تاخیر، DNS، پیکٹ لاس اور WiFi صحت ناپتا ہے اور نتائج کا عالمی فراہم کنندگان سے موازنہ کرتا ہے۔", startTest: "گلوبل ٹیسٹ شروع کریں" }
};

let providers = [];
import { fetchIspData } from "./core/isp-data.js";

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

function setupCanvas() {
  const canvas = qs("#heroCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let width = 0;
  let height = 0;
  let nodes = [];
  let isVisible = false;
  let animFrameId = null;

  function resize() {
    const pixelRatio = window.devicePixelRatio || 1;
    width = canvas.offsetWidth;
    height = canvas.offsetHeight;
    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const count = Math.max(48, Math.floor((width * height) / 21000));
    nodes = Array.from({ length: count }, (_, index) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: rand(-0.25, 0.25),
      vy: rand(-0.18, 0.18),
      radius: index % 9 === 0 ? 2.4 : 1.35,
      color: ["#24d1c3", "#57a6ff", "#f6b64b", "#62d26f"][index % 4]
    }));
  }

  function draw() {
    if (!isVisible) return;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#071116";
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      node.x += node.vx;
      node.y += node.vy;
      if (node.x < -20) node.x = width + 20;
      if (node.x > width + 20) node.x = -20;
      if (node.y < -20) node.y = height + 20;
      if (node.y > height + 20) node.y = -20;
      for (let j = i + 1; j < nodes.length; j += 1) {
        const other = nodes[j];
        const distance = Math.hypot(node.x - other.x, node.y - other.y);
        if (distance < 150) {
          ctx.strokeStyle = `rgba(36, 209, 195, ${0.18 * (1 - distance / 150)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(other.x, other.y);
          ctx.stroke();
        }
      }
    }
    nodes.forEach((node) => {
      ctx.beginPath();
      ctx.globalAlpha = 0.78;
      ctx.fillStyle = node.color;
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    animFrameId = window.requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener("resize", resize);

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      isVisible = entry.isIntersecting;
      if (isVisible) {
        if (!animFrameId) draw();
      } else {
        if (animFrameId) {
          window.cancelAnimationFrame(animFrameId);
          animFrameId = null;
        }
      }
    });
  }, { rootMargin: "50px" });

  observer.observe(canvas);
}

function setMetric(id, value, digits = 0) {
  const el = qs(id);
  const empty = value === null;
  // An em dash, not two hyphens. "--" reads as a glyph that failed to load;
  // "—" is the typographic convention for "no value here", and it lets the
  // tile look deliberate while it waits instead of looking broken.
  el.textContent = empty ? "—" : Number(value).toFixed(digits);
  // Marks the whole value row, so the unit fades with the number rather than
  // sitting at full strength beside a placeholder.
  el.closest(".metric-value")?.setAttribute("data-empty", String(empty));
}

function updateScores() {
  const scores = qualityScores(state);
  if (!scores) return;
  state.health = scores.health;
  qs("#wifiScore").textContent = scores.health;
  qs("#gamingScore").textContent = scores.gaming;
  qs("#streamingScore").textContent = scores.streaming;
  // Null when the metric each depends on could not be measured: video and work
  // need upload, work and dns need DNS. Printing the placeholder keeps these
  // tiles consistent with the raw "-- Mbps" shown further up the page.
  qs("#videoScore").textContent = scores.video ?? "--";
  qs("#workScore").textContent = scores.work ?? "--";
  qs("#dnsScore").textContent = scores.dns ?? "--";
  const verdict = healthVerdict(scores.health);
  qs("#analysisTitle").textContent = verdict.title;
  qs("#analysisText").textContent = verdict.detail;
  renderResultSummary(scores);
  updateAiDoctor();
}

function updateAiDoctor() {
  const panel = qs("#aiDoctorPanel");
  const summaryEl = qs("#aiDoctorSummary");
  const recsEl = qs("#aiDoctorRecommendations");
  if (!panel || !summaryEl || !recsEl) return;

  if (state.download === null) {
    panel.hidden = true;
    return;
  }

  const diagnosis = generateAiDiagnosis(state, state.bufferbloat || null);
  panel.hidden = false;
  summaryEl.classList.remove("shimmer-placeholder");
  summaryEl.textContent = diagnosis.summary;

  recsEl.innerHTML = diagnosis.recommendations.map(rec => `
    <div style="display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border: 1px solid rgba(0, 242, 255, 0.2); border-radius: 10px; background: rgba(0, 242, 255, 0.05); backdrop-filter: blur(12px);">
      <span style="color: var(--teal); font-weight: 800; font-size: 1rem; flex-shrink: 0; margin-top: 1px;">✦</span>
      <span style="font-size: 0.88rem; color: var(--ink); font-weight: 600; line-height: 1.5;">${rec}</span>
    </div>
  `).join("");
}

function renderResultSummary(scores) {
  const panel = qs("#resultSummary");
  if (!panel) return;
  panel.hidden = false;
  qs("#summaryHealth").textContent = `Health ${scores.health}/100`;
  qs("#summaryHealthText").textContent = healthVerdict(scores.health).detail;

  const loss = state.loss ?? 0;
  qs("#summaryLoss").textContent = loss > 0 ? `${loss.toFixed(1)}% packet loss` : "No packet loss detected";
  qs("#summaryLossText").textContent = loss > 0
    ? "Loss causes lag spikes, buffering and call drops. Check WiFi signal, cabling, router load and ISP congestion."
    : "No probe loss landed in this run. Focus on latency, jitter and queueing if the connection still feels bad.";

  const uploadRatio = state.download && state.upload ? state.upload / state.download : 0;
  qs("#summaryBalance").textContent = uploadRatio > 0.35 ? "Balanced upstream" : "Upload-limited link";
  qs("#summaryBalanceText").textContent = uploadRatio > 0.35
    ? "Upload is strong enough for video calls, cloud backup and sending large files while browsing."
    : "Upload is much lower than download. Video calls, livestreaming and cloud backup may saturate the line first.";
}

// ---- GO button + live gauge ---------------------------------------------
// The dial uses the same non-linear scale as consumer speed testers: the slow
// end gets most of the sweep, so a 30 Mbps line still moves the needle across
// half the dial instead of nudging it off zero.
const GAUGE_ARC = 612.6;   // path length of the 270 degree visible arc
// This dial sweeps 270 degrees starting at the lower left; the 180 degree dial
// in web/ passes different values to the same shared helpers.
const GAUGE_GEOMETRY = { start: 135, sweep: 270 };
const GAUGE_CENTER = 170;

// Scale numbers sit just inside the arc, each at its own angle.
function renderGaugeTicks() {
  const group = qs("#gaugeTicks");
  if (!group || group.childElementCount) return;
  const last = BASE_STOPS.length - 1;
  group.innerHTML = BASE_STOPS.map((stop, index) => {
    const { x, y } = pointOnArc(index / last, 103, GAUGE_CENTER, GAUGE_CENTER, GAUGE_GEOMETRY);
    // Dim the top half of the scale so the range people actually land in reads first.
    const dim = stop >= 100 ? " dim" : "";
    return `<text class="gauge-tick${dim}" x="${x.toFixed(1)}" y="${y.toFixed(1)}">${labelFor(stop)}</text>`;
  }).join("");
}

// Positions the dial and writes the readout. Kept separate from setGauge so a
// phase can sweep the arc as progress while showing a number that means
// something else — during ping the arc is progress and the number is real ms.
function setGaugeFraction(fraction, readout, phase, unit) {
  const fill = qs("#gaugeFill");
  const needle = qs("#gaugeNeedle");
  if (!fill || !needle) return;
  const bounded = clamp(fraction, 0, 1);
  fill.setAttribute("stroke-dashoffset", String(GAUGE_ARC * (1 - bounded)));
  needle.setAttribute(
    "transform",
    `rotate(${needleAngle(bounded, GAUGE_GEOMETRY).toFixed(2)} ${GAUGE_CENTER} ${GAUGE_CENTER})`,
  );
  qs("#gaugeReadout").textContent = readout;
  qs("#gaugeUnit").textContent = unit;
  if (phase) qs("#gaugePhase").textContent = phase;
}

function setGauge(mbps, phase) {
  setGaugeFraction(fractionFor(mbps, BASE_STOPS), Number(mbps).toFixed(2), phase, "Mbps");
}

// Swaps the GO button for the dial (and back) without disturbing the metric grid.
// mode: "idle" (GO only) | "running" (dial only) | "done" (dial + small AGAIN)
function showGauge(mode) {
  const button = qs("#goButton");
  const gauge = qs("#gauge");
  if (!button || !gauge) return;
  const dial = mode !== "idle";
  gauge.hidden = !dial;
  gauge.setAttribute("aria-hidden", dial ? "false" : "true");
  button.hidden = mode === "running";
  button.classList.toggle("compact", mode === "done");
  button.textContent = mode === "done" ? "AGAIN" : "GO";
  const caption = qs("#goCaption");
  if (caption) caption.hidden = mode !== "idle";
}

// ---- Who you are on the network -----------------------------------------
// The facts come from core/netinfo.js (Cloudflare's edge `meta` endpoint); this
// only renders them.
//
// Two stages on purpose. Browser, OS and device are derived from the user agent
// with no network at all, so they paint immediately; only the ISP, IP and edge
// need the lookup. Waiting for the request before showing anything is what left
// the strip reading "Detecting…" indefinitely whenever an ad blocker, a proxy or
// a captive portal swallowed it.
function paintConnection(net, resolved) {
  qs("#connClient").textContent = `${net.browser} · ${net.os} · ${net.device}`;

  if (!resolved) {
    qs("#connIsp").textContent = "Detecting…";
    qs("#connIsp").classList.add("shimmer");
    return;
  }
  qs("#connIsp").classList.remove("shimmer");

  // A failed lookup says so rather than leaving a dash the reader has to
  // interpret. It stops no one from testing — only the labels are unknown.
  qs("#connIsp").textContent = net.isp || "Provider unavailable";
  qs("#connAsn").textContent = net.asn ? `AS${net.asn}` : "Edge lookup blocked or timed out";
  qs("#connIp").textContent = net.ip || "Unavailable";
  qs("#connLocation").textContent =
    [net.city, net.country].filter(Boolean).join(", ") || "Location unavailable";
  qs("#connEdge").textContent = net.edgeCity
    ? `${net.edgeCity} (${net.colo})`
    : net.colo || "Nearest edge";
  qs("#connProtocol").textContent = net.httpProtocol ? `over ${net.httpProtocol}` : "";
}

async function renderConnection() {
  paintConnection(localNetInfo(), false);
  const net = await detectNetwork();
  state.network = net;
  paintConnection(net, true);
}

// ---- Live throughput graph ----------------------------------------------
// Plots the exact samples the measurement reports, download and upload on one
// timeline, redrawn on rAF so it stays smooth without re-running any layout.
const graphData = { down: [], up: [], startAt: 0 };
let graphFrame = null;

/**
 * Reads a design token so the canvas can be painted in the site's own colours.
 * A canvas cannot inherit CSS, so without this the graph is stuck with whatever
 * palette was hardcoded — which is why its gridlines and label used to vanish
 * against the light theme.
 */
function token(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function drawGraph() {
  const canvas = qs("#liveGraph");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const pad = 6;
  ctx.clearRect(0, 0, width, height);

  const all = graphData.down.concat(graphData.up);
  const peak = Math.max(1, ...all.map((point) => point.v));
  const span = Math.max(1000, ...all.map((point) => point.t));

  // Horizontal reference lines at quarters of the peak.
  ctx.strokeStyle = token("--line", "rgba(255,255,255,0.09)");
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = pad + ((height - pad * 2) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
  }

  const plot = (points, stroke, fill) => {
    if (points.length < 2) return;
    const x = (t) => pad + ((width - pad * 2) * t) / span;
    const y = (v) => height - pad - ((height - pad * 2) * v) / peak;

    ctx.beginPath();
    ctx.moveTo(x(points[0].t), y(points[0].v));
    points.forEach((point) => ctx.lineTo(x(point.t), y(point.v)));

    // Area under the trace, then the trace itself on top.
    ctx.save();
    ctx.lineTo(x(points[points.length - 1].t), height - pad);
    ctx.lineTo(x(points[0].t), height - pad);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(x(points[0].t), y(points[0].v));
    points.forEach((point) => ctx.lineTo(x(point.t), y(point.v)));
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.stroke();
  };

  // Download in brand blue, upload in brand teal — the same pair the dial's arc
  // and the rest of the page use, so the traces are readable without a legend.
  const down = token("--blue", "#57a6ff");
  const up = token("--teal", "#24d1c3");
  plot(graphData.down, down, `color-mix(in srgb, ${down} 22%, transparent)`);
  plot(graphData.up, up, `color-mix(in srgb, ${up} 20%, transparent)`);

  ctx.fillStyle = token("--muted", "rgba(255,255,255,0.55)");
  ctx.font = "600 13px Inter, system-ui, sans-serif";
  ctx.fillText(`peak ${peak.toFixed(1)} Mbps`, pad + 4, pad + 16);
}

function startGraph() {
  graphData.down = [];
  graphData.up = [];
  graphData.startAt = performance.now();
  const canvas = qs("#liveGraph");
  if (canvas) canvas.hidden = false;
  if (graphFrame === null) {
    const loop = () => {
      drawGraph();
      graphFrame = window.requestAnimationFrame(loop);
    };
    graphFrame = window.requestAnimationFrame(loop);
  }
}

function stopGraph() {
  if (graphFrame !== null) {
    window.cancelAnimationFrame(graphFrame);
    graphFrame = null;
  }
  drawGraph(); // leave the finished shape on screen
}

// Samples arrive faster than the eye can use; ~25 Hz keeps the arrays small.
let lastGraphSample = { down: 0, up: 0, ping: 0 };
const sparklineData = { down: [], up: [], ping: [] };

function drawSparkline(id, points, color) {
  const canvas = qs(id);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.offsetWidth || 300;
  const height = canvas.offsetHeight || 36;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== width * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (points.length < 2) return;
  
  const peak = Math.max(...points) || 1;
  const min = Math.min(...points) || 0;
  const range = peak === min ? 1 : peak - min;
  
  ctx.beginPath();
  points.forEach((val, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - 4 - ((val - min) / range) * (height - 8);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, color);
  grad.addColorStop(1, "transparent");
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.fillStyle = grad;
  ctx.globalAlpha = 0.2;
  ctx.fill();
  ctx.globalAlpha = 1.0;
}

function pushGraphSample(kind, mbps) {
  const now = performance.now();
  if (now - lastGraphSample[kind] < 40) return;
  lastGraphSample[kind] = now;
  
  if (kind === 'down' || kind === 'up') {
    graphData[kind].push({ t: now - graphData.startAt, v: mbps });
  }
  
  sparklineData[kind].push(mbps);
  
  if (kind === 'down') drawSparkline("#sparklineDownload", sparklineData.down, token("--blue", "#57a6ff"));
  if (kind === 'up') drawSparkline("#sparklineUpload", sparklineData.up, token("--teal", "#24d1c3"));
  if (kind === 'ping') drawSparkline("#sparklinePing", sparklineData.ping, token("--amber", "#f6b64b"));
}

// ---- Local test history --------------------------------------------------
// Storage, capping and delta maths live in core/history.js; this renders them.
function renderHistory() {
  const history = loadHistory();
  const panel = qs("#historyPanel");
  const list = qs("#historyList");
  if (!panel || !list) return;
  panel.hidden = history.length === 0;

  list.innerHTML = history.map((entry, index) => {
    // Change against the run before it, so a slowdown is visible at a glance.
    const delta = downloadDelta(entry, history[index + 1]);
    const deltaLabel = delta === null
      ? ""
      : `<span class="delta ${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(0)}% vs previous</span>`;
    const when = new Date(entry.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    return `<div class="history-row">
      <span class="when">${when}</span>
      <span>${entry.download} Mbps down</span>
      <span>${entry.upload === null ? "upload n/a" : `${entry.upload} Mbps up`}</span>
      <span>${entry.ping} ms</span>
      ${deltaLabel || "<span></span>"}
    </div>`;
  }).join("");
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
  setMetric("#downloadValue", state.download, 1);
  setMetric("#uploadValue", state.upload, 1);
  setMetric("#pingValue", state.ping);
  setMetric("#jitterValue", state.jitter, 1);
  setMetric("#lossValue", state.loss, 1);
  setMetric("#dnsValue", state.dns);
  setMetric("#stabilityValue", state.stability);
  updateScores();
  renderGaugeTicks();
  setGauge(state.download || 0, "DOWNLOAD");
  showGauge("done");

  const who = [shared.isp, shared.edgeCity].filter(Boolean).join(" · ");
  qs("#testStatus").textContent = `Shared result${who ? ` from ${who}` : ""}, measured ${new Date(shared.at).toLocaleString()}. Run your own test to compare.`;
}

async function copyResultLink() {
  // Returning silently made this a dead button before a run: a click, and
  // nothing on screen changed. There is no link to copy yet, so say that.
  if (state.download === null) {
    qs("#testStatus").textContent = "Nothing to copy yet — press GO to measure your connection first.";
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
  qs("#insightGrid").hidden = false;
  // Jitter is null when a single probe returned — variation between samples is
  // undefined with one sample. Interpolating that null printed "jitter null ms".
  const jitter = latency.jitter === null ? "not measurable" : `${latency.jitter} ms`;
  qs("#latencyProbes").textContent = `${latency.samples.length} probes · jitter ${jitter} · loss ${latency.loss}%`;
  qs("#latMin").textContent = latency.min;
  qs("#latMedian").textContent = latency.ping;
  qs("#latP95").textContent = latency.p95;
  qs("#latMax").textContent = latency.max;
}

function renderBufferbloat(bloat) {
  state.bufferbloat = bloat;
  qs("#insightGrid").hidden = false;
  const badge = qs("#bloatGrade");

  // Too few probes survived the saturated link to judge it. Saying so beats
  // printing a grade derived from one straggler that spent its life queued.
  if (!bloat) {
    badge.textContent = "?";
    badge.classList.remove("warn", "bad");
    qs("#bloatDelta").textContent = "Not measurable this run";
    qs("#bloatDetail").textContent =
      "Too few latency probes returned while the link was saturated to judge queueing.";
    qs("#bloatVerdict").textContent =
      "This usually means the connection was fully occupied by the download. Re-run the test, ideally with other devices idle.";
    return;
  }

  badge.textContent = bloat.grade;
  badge.classList.toggle("warn", ["B", "C"].includes(bloat.grade));
  badge.classList.toggle("bad", ["D", "F"].includes(bloat.grade));
  qs("#bloatDelta").textContent = `+${bloat.increase} ms under load`;
  qs("#bloatDetail").textContent = `Idle ${bloat.idle} ms rising to ${bloat.loaded} ms while the link is saturated.`;
  qs("#bloatVerdict").textContent = bufferbloatVerdict(bloat.increase);
}

/**
 * What the page says during each phase. The wording lives here rather than in
 * the engine: `core/run.js` reports which phase it is in, and each front end
 * chooses how to say it.
 *
 * @type {Record<string, string>}
 */
const PHASE_COPY = {
  select: "Selecting the nearest measurement edge by latency...",
  latency: "Measuring ping, jitter, percentiles, packet loss and DNS...",
  download: "Measuring download throughput and latency under load...",
  upload: "Measuring upload throughput...",
};

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
let currentTestMode = "quick";
let activeWorker = null;

function setupTestModeToggle() {
  const modeQuick = qs("#modeQuick");
  const modeFull = qs("#modeFull");
  if (!modeQuick || !modeFull) return;

  modeQuick.addEventListener("click", () => {
    currentTestMode = "quick";
    modeQuick.style.background = "var(--teal)";
    modeQuick.style.color = "#041113";
    modeQuick.style.borderColor = "var(--teal)";
    modeFull.style.background = "transparent";
    modeFull.style.color = "var(--ink)";
    modeFull.style.borderColor = "var(--line)";
  });

  modeFull.addEventListener("click", () => {
    currentTestMode = "full";
    modeFull.style.background = "var(--teal)";
    modeFull.style.color = "#041113";
    modeFull.style.borderColor = "var(--teal)";
    modeQuick.style.background = "transparent";
    modeQuick.style.color = "var(--ink)";
    modeQuick.style.borderColor = "var(--line)";
  });
}

function updateCardBadges(badges) {
  if (!badges) return;
  const map = {
    download: "#badgeDownload",
    upload: "#badgeUpload",
    ping: "#badgePing",
    jitter: "#badgeJitter",
    packetLoss: "#badgeLoss",
    dnsLatency: "#badgeDns",
    stability: "#badgeStability",
  };

  for (const [key, badgeId] of Object.entries(map)) {
    const el = qs(badgeId);
    if (!el) continue;
    const badgeType = badges[key] || "measured";
    el.textContent = badgeType;
    el.className = `badge ${badgeType}`;
  }
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

async function runSpeedTest() {
  const progress = qs("#testProgress");
  const status = qs("#testStatus");
  const degradedBanner = qs("#degradedBanner");
  const degradedReason = qs("#degradedReason");

  if (testRunning) return;
  testRunning = true;

  if (degradedBanner) degradedBanner.hidden = true;
  progress.style.width = "0%";
  status.textContent = "Launching measurement engine in Web Worker...";
  qs("#stopTest").hidden = false;
  qs("#resultSummary").hidden = true;
  qs(".gauge-stage")?.classList.add("active");
  renderGaugeTicks();
  showGauge("running");
  setGaugeFraction(0, "—", "PING", "ms");

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
  });

  const aiDoctor = qs("#aiDoctorPanel");
  if (aiDoctor) aiDoctor.hidden = true;
  qsa(".animate-panel").forEach((p) => p.classList.remove("animate-in"));

  sparklineData.down = [];
  sparklineData.up = [];
  sparklineData.ping = [];
  qsa(".sparkline-canvas").forEach((c) => {
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
  });

  ["#downloadValue", "#uploadValue", "#pingValue", "#jitterValue", "#lossValue", "#dnsValue", "#stabilityValue"].forEach((id) => setMetric(id, null));

  try {
    const endpoint = "https://speed.cloudflare.com/__down";
    setEdgeLabel("Cloudflare Edge Node");

    // Launch Web Worker measurement
    activeWorker = new Worker(new URL("./worker/measure.js", import.meta.url), { type: "module" });

    activeWorker.onmessage = (e) => {
      const { type, data } = e.data ?? {};

      if (type === "snapshot") {
        if (data.phase) {
          const copy = PHASE_COPY[data.phase] || `Running ${data.phase}...`;
          status.textContent = copy;

          if (data.phase === "download" && data.downloadMbps) {
            setGauge(data.downloadMbps, "DOWNLOAD");
            pushGraphSample("down", data.downloadMbps);
          } else if (data.phase === "upload" && data.uploadMbps) {
            setGauge(data.uploadMbps, "UPLOAD");
            pushGraphSample("up", data.uploadMbps);
          } else if (data.phase === "ping" && data.pingMs) {
            setGaugeFraction(0.5, data.pingMs.toString(), "PING", "ms");
            pushGraphSample("ping", data.pingMs);
          }
        }

        if (data.downloadMbps !== null) setMetric("#downloadValue", data.downloadMbps, 1);
        if (data.uploadMbps !== null) setMetric("#uploadValue", data.uploadMbps, 1);
        if (data.pingMs !== null) setMetric("#pingValue", data.pingMs);
        if (data.jitterMs !== null) setMetric("#jitterValue", data.jitterMs, 1);
        if (data.lossPct !== null) setMetric("#lossValue", data.lossPct, 1);
        if (data.dnsMs !== null) setMetric("#dnsValue", data.dnsMs);
        if (data.stabilityScore !== null) setMetric("#stabilityValue", data.stabilityScore);

        if (data.badges) updateCardBadges(data.badges);
        if (data.progressPct) progress.style.width = `${data.progressPct}%`;
      } else if (type === "degraded_warning") {
        if (degradedBanner && degradedReason) {
          degradedBanner.hidden = false;
          degradedReason.textContent = data.degradedReason || "Background tab or CPU starvation detected.";
        }
      } else if (type === "complete") {
        stopGraph();
        Object.assign(state, {
          download: data.downloadP90 ?? data.downloadMbps,
          upload: data.uploadP90 ?? data.uploadMbps,
          ping: data.pingMs,
          jitter: data.jitterMs,
          loss: data.lossPct,
          dns: data.dnsMs,
          stability: data.stabilityScore,
        });

        state.badges = data.badges;
        updateScores();
        setGauge(state.download || 0, "DOWNLOAD");
        showGauge("done");

        saveHistoryEntry({
          at: Date.now(),
          download: state.download,
          upload: state.upload,
          ping: state.ping,
          isp: state.network ? state.network.isp : null,
          edgeCity: state.network ? state.network.edgeCity : null,
        });
        renderHistory();

        status.textContent = `Finished (${currentTestMode} mode). WiFi health score: ${state.health}/100. Result card, link and sharing ready.`;

        const aiDoctor = qs("#aiDoctorPanel");
        if (aiDoctor && state.download !== null) {
          const diagnosis = generateAiDiagnosis(state, state.bufferbloat);
          const sum = qs("#aiDoctorSummary");
          if (sum) {
            sum.textContent = diagnosis.summary;
            sum.classList.remove("shimmer-placeholder");
          }
          const recs = qs("#aiDoctorRecommendations");
          if (recs) {
            recs.innerHTML = diagnosis.recommendations
              .map((rec) => `<div style="display: flex; gap: 8px; font-size: 0.88rem; color: var(--muted);"><span style="color: var(--teal);">•</span><span>${rec}</span></div>`)
              .join("");
          }
          aiDoctor.hidden = false;
        }

        qs(".gauge-stage")?.classList.remove("active");
        testRunning = false;
        qs("#stopTest").hidden = true;
      } else if (type === "aborted") {
        stopGraph();
        showGauge("idle");
        status.textContent = "Test stopped. Partial measurements discarded.";
        testRunning = false;
        qs("#stopTest").hidden = true;
      } else if (type === "error") {
        stopGraph();
        showGauge("idle");
        status.textContent = `Test error: ${data?.error || "Unknown worker error"}`;
        testRunning = false;
        qs("#stopTest").hidden = true;
      }
    };

    activeWorker.postMessage({
      type: "start",
      data: { endpoint, mode: currentTestMode },
    });
  } catch (error) {
    progress.style.width = "0%";
    stopGraph();
    showGauge("idle");
    status.textContent = `Test failed: ${error.message}.`;
    testRunning = false;
    qs("#stopTest").hidden = true;
  }
}

function stopSpeedTest() {
  if (activeWorker) {
    activeWorker.postMessage({ type: "stop" });
    activeWorker.terminate();
    activeWorker = null;
  }
  testRunning = false;
  qs("#stopTest").hidden = true;
  showGauge("idle");
  qs("#testStatus").textContent = "Test stopped by user.";
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
  const up = state.upload === null ? "upload n/a" : `${state.upload.toFixed(1)} Mbps up`;
  const text = state.download
    ? `WifiPlus Speed Test Result: ${state.download.toFixed(1)} Mbps down, ${up}, ${state.ping} ms ping, ${state.jitter} ms jitter.`
    : "Test your internet speed with WifiPlus.";
  if (navigator.share) {
    navigator.share({ title: "WifiPlus Speed Test Result", text, url: location.href.split("#")[0] }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(`${text} ${location.href.split("#")[0]}`);
    qs("#testStatus").textContent = "Share text copied to clipboard.";
  }
}

function downloadResultCard() {
  if (state.download === null) {
    qs("#testStatus").textContent = "No result to put on a card yet — press GO to measure your connection first.";
    return;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d");

  // Background
  const grad = ctx.createLinearGradient(0, 0, 1200, 630);
  grad.addColorStop(0, "#09121d");
  grad.addColorStop(1, "#111827");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1200, 630);

  // Top accent bar
  ctx.fillStyle = "#24d1c3";
  ctx.fillRect(0, 0, 1200, 12);

  // Header Title & Subtitle
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 48px Inter, system-ui, sans-serif";
  ctx.fillText("WifiPlus Speed Test Result", 60, 90);

  ctx.fillStyle = "#9ca3af";
  ctx.font = "600 20px Inter, system-ui, sans-serif";
  const when = new Date().toLocaleString();
  ctx.fillText(`Measured in Web Worker · Pure browser measurement · ${when}`, 60, 130);

  // Metric Tiles Grid (7 tiles)
  const tiles = [
    { label: "DOWNLOAD", val: `${state.download?.toFixed(1) ?? "—"} Mbps`, badge: state.badges?.download || "measured", color: "#57a6ff" },
    { label: "UPLOAD", val: state.upload !== null ? `${state.upload?.toFixed(1)} Mbps` : "n/a", badge: state.badges?.upload || "measured", color: "#24d1c3" },
    { label: "PING", val: state.ping !== null ? `${state.ping} ms` : "—", badge: state.badges?.ping || "measured", color: "#f59e0b" },
    { label: "JITTER", val: state.jitter !== null ? `${state.jitter?.toFixed(1)} ms` : "—", badge: state.badges?.jitter || "measured", color: "#a855f7" },
    { label: "PACKET LOSS", val: state.loss !== null ? `${state.loss}%` : "—", badge: state.badges?.packetLoss || "measured", color: "#ef4444" },
    { label: "DNS LATENCY", val: state.dns !== null ? `${state.dns} ms` : "—", badge: state.badges?.dnsLatency || "estimated", color: "#38bdf8" },
    { label: "STABILITY", val: state.stability !== null ? `${state.stability}%` : "—", badge: state.badges?.stability || "measured", color: "#22c55e" },
  ];

  tiles.forEach((tile, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = 60 + col * 265;
    const y = 170 + row * 165;
    const w = 245;
    const h = 145;

    ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#9ca3af";
    ctx.font = "800 13px Inter, system-ui, sans-serif";
    ctx.fillText(tile.label, x + 16, y + 32);

    // Badge
    const isMeas = tile.badge === "measured";
    ctx.fillStyle = isMeas ? "rgba(36, 209, 195, 0.2)" : "rgba(245, 158, 11, 0.2)";
    ctx.beginPath();
    ctx.roundRect(x + w - 85, y + 16, 70, 20, 10);
    ctx.fill();

    ctx.fillStyle = isMeas ? "#24d1c3" : "#f59e0b";
    ctx.font = "700 11px Inter, system-ui, sans-serif";
    ctx.fillText(tile.badge, x + w - 75, y + 30);

    // Value
    ctx.fillStyle = tile.color;
    ctx.font = "800 32px Outfit, sans-serif";
    ctx.fillText(tile.val, x + 16, y + 95);
  });

  // Footer branding
  ctx.fillStyle = "#6b7280";
  ctx.font = "600 16px Inter, system-ui, sans-serif";
  ctx.fillText("https://wifiplus.prathamgosai.in/ — End-to-end browser speed measurement engine", 60, 580);

  const link = document.createElement("a");
  link.download = `wifiplus-speedtest-${Date.now()}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x, y, 448, 210);
    ctx.fillStyle = item[2];
    ctx.font = "900 28px Segoe UI, sans-serif";
    ctx.fillText(item[0], x + 34, y + 58);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 54px Segoe UI, sans-serif";
    ctx.fillText(item[1], x + 34, y + 136);
  });
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = "650 28px Segoe UI, sans-serif";
  ctx.fillText("Global speed test, ISP comparison, and AI WiFi Doctor.", 74, 900);
  ctx.fillText("wifiplus.prathamgosai.in", 74, 956);
  const link = document.createElement("a");
  link.download = "wifiplus-global-result-card.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
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
  const active = translations[language];
  document.documentElement.lang = language;
  document.documentElement.dir = ["ar", "ur"].includes(language) ? "rtl" : "ltr";
  qsa("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    if (active[key]) element.textContent = active[key];
  });
  localStorage.setItem("wifiplus-language", language);
}

function initTheme() {
  const saved = localStorage.getItem("wifiplus-theme");
  if (saved === "dark" || saved === "light") document.documentElement.dataset.theme = saved;
}

function updatePlatformNotice() {
  const notice = qs("#platformNotice");
  const userAgent = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const isApple = /Mac|iPhone|iPad|iPod/.test(userAgent) || /Mac|iPhone|iPad|iPod/.test(platform);
  const isLinux = /Linux|X11|Unix/.test(userAgent) || /Linux|X11|Unix/.test(platform);
  const isWindows = /Windows|Win32|Win64/.test(userAgent) || /Windows|Win32|Win64/.test(platform);
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/.test(userAgent);

  if (notice) {
    if (isApple) {
      notice.textContent = "Optimized for Apple devices and macOS with install support in Safari and supported browsers.";
    } else if (isLinux) {
      notice.textContent = "Optimized for Linux and Unix-like systems with a desktop-friendly layout and app-style install support.";
    } else if (isWindows) {
      notice.textContent = "Optimized for Windows desktop and browser-based app install workflows.";
    } else if (isMobile) {
      notice.textContent = "Optimized for phones and tablets with touch-friendly controls and home-screen installation.";
    } else {
      notice.textContent = "Cross-platform ready for desktop, mobile, macOS, Windows, Linux, and Unix-like systems.";
    }
  }
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("wifiplus-theme", next);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

let deferredInstallPrompt = null;

function setupInstallPrompt() {
  const installButton = qs("#installAppButton");
  if (!installButton) return;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButton.hidden = false;
    installButton.textContent = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? "Install on Apple device" : "Install App";
  });

  window.addEventListener("appinstalled", () => {
    installButton.hidden = true;
    installButton.textContent = "Installed";
  });

  installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      qs("#testStatus").textContent = "Use your browser's Share or Install option to add WifiPlus to your home screen or desktop.";
      return;
    }

    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice.outcome === "accepted") {
      installButton.hidden = true;
      qs("#testStatus").textContent = "WifiPlus is now installed for quick access.";
    }
    deferredInstallPrompt = null;
  });
}

function bindEvents() {
  qs("#menuButton").addEventListener("click", () => {
    const isOpen = qs("#navLinks").classList.toggle("open");
    document.body.classList.toggle("menu-open", isOpen);
    qs("#menuButton").setAttribute("aria-expanded", String(isOpen));
  });
  qsa(".nav-links a").forEach((link) => link.addEventListener("click", () => {
    qs("#navLinks").classList.remove("open");
    document.body.classList.remove("menu-open");
    qs("#menuButton").setAttribute("aria-expanded", "false");
  }));
  qs("#themeToggle").addEventListener("click", toggleTheme);
  qs("#languageSelect").addEventListener("change", (event) => applyLanguage(event.target.value));
  qs("#countrySelect").addEventListener("change", () => { state.scopedGlobal = false; updateCityOptions(); });
  qs("#citySelect").addEventListener("change", () => { state.scopedGlobal = false; updateProviderOptions(); });
  qs("#providerSelect").addEventListener("change", renderSelectedProvider);
  qs("#sortSelect").addEventListener("change", renderComparison);
  qs("#globalScopeButton").addEventListener("click", () => {
    state.scopedGlobal = !state.scopedGlobal;
    qs("#globalScopeButton").textContent = state.scopedGlobal ? "Show Selected City" : "Show Worldwide";
    renderComparison();
    renderAvailability();
  });
  qsa(".tab-button").forEach((button) => button.addEventListener("click", () => {
    qsa(".tab-button").forEach((tab) => tab.classList.remove("active"));
    button.classList.add("active");
    state.ranking = button.dataset.rank;
    renderRankings();
  }));
  qs("#recCountry").addEventListener("change", updateRecCityOptions);
  qs("#recommendButton").addEventListener("click", recommendProviders);
  ["#gamingNeed", "#streamingNeed"].forEach((selector) => qs(selector).addEventListener("input", () => {
    qs(`${selector}Label`).textContent = qs(selector).value;
  }));
  ["#devices", "#streams", "#gamers", "#workers"].forEach((selector) => qs(selector).addEventListener("input", updateBandwidth));
  qs("#gameSelect").addEventListener("change", updatePingCalculator);
  qs("#pingInput").addEventListener("input", updatePingCalculator);
  setupTestModeToggle();
  qs("#goButton").addEventListener("click", runSpeedTest);
  qs("#stopTest").addEventListener("click", stopSpeedTest);
  qs("#heroStart").addEventListener("click", (event) => {
    event.preventDefault();
    qs("#speed-test").scrollIntoView({ behavior: "smooth" });
    window.setTimeout(runSpeedTest, 420);
  });
  qs("#downloadCard").addEventListener("click", downloadResultCard);
  qs("#shareResult").addEventListener("click", shareResult);
  qs("#copyResultLink").addEventListener("click", copyResultLink);
  qs("#clearHistory").addEventListener("click", () => {
    clearHistory();
    renderHistory();
  });
  qs("#routerUpload").addEventListener("change", handleUpload);
  qsa(".seo-jump").forEach((link) => link.addEventListener("click", (event) => {
    const country = event.currentTarget.dataset.country;
    const city = event.currentTarget.dataset.city;
    if ([...qs("#countrySelect").options].some((option) => option.value === country)) {
      qs("#countrySelect").value = country;
      updateCityOptions();
      if ([...qs("#citySelect").options].some((option) => option.value === city)) {
        qs("#citySelect").value = city;
        updateProviderOptions();
      }
    }
  }));

  // Mobile Bottom Sheet Handlers
  const backdrop = qs("#bottomSheetBackdrop");
  const aiSheet = qs("#aiDoctorSheet");
  const closeAiSheet = qs("#closeAiDoctorSheet");

  function closeSheets() {
    if (backdrop) backdrop.classList.remove("open");
    qsa(".bottom-sheet").forEach(s => s.classList.remove("open"));
  }

  backdrop?.addEventListener("click", closeSheets);
  closeAiSheet?.addEventListener("click", closeSheets);

  // Bottom Nav handlers
  qsa(".mobile-bottom-nav .nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      qsa(".mobile-bottom-nav .nav-item").forEach((nav) => nav.classList.remove("active"));
      item.classList.add("active");
    });
  });

  qs("#bottomNavGo")?.addEventListener("click", (e) => {
    e.preventDefault();
    qs("#speed-test")?.scrollIntoView({ behavior: "smooth" });
    runSpeedTest();
  });

  // Offline / Online status
  window.addEventListener("online", () => {
    const banner = qs("#offlineBanner");
    if (banner) banner.hidden = true;
  });
  window.addEventListener("offline", () => {
    const banner = qs("#offlineBanner");
    if (banner) banner.hidden = false;
  });
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const banner = qs("#offlineBanner");
    if (banner) banner.hidden = false;
  }
}

initTheme();
updatePlatformNotice();
setupCanvas();
async function initIspData() {
  providers = await fetchIspData();
  initLocationControls();
  renderRegions();
  renderRankings();
  renderSeoPages();
  updateBandwidth();
  updatePingCalculator();
  recommendProviders();
}
initIspData();
setupInstallPrompt();
bindEvents();
const detectedLanguage = (navigator.language || "en").slice(0, 2);
const savedLanguage = localStorage.getItem("wifiplus-language");
const language = savedLanguage || (translations[detectedLanguage] ? detectedLanguage : "en");
qs("#languageSelect").value = language;
applyLanguage(language);
registerServiceWorker();
// Identify the connection up front so the strip is populated before anyone
// presses GO, then restore local history and any shared result in the URL.
renderConnection();
renderHistory();
applyResultFromHash();

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

const providers = [
  { name: "Jio Fiber", country: "India", code: "IN", region: "Asia", state: "Maharashtra", city: "Mumbai", type: "Fiber broadband", ownership: "Private", plan: "Fiber 1 Gbps", download: 840, upload: 620, ping: 8, jitter: 2.4, loss: 0.1, price: 48, currency: "USD", coverage: 86, reliability: 94, uptime: 99.95, rating: 4.4, dataCap: "3.3 TB", gaming: 93, streaming: 96, remote: 94 },
  { name: "Airtel Xstream", country: "India", code: "IN", region: "Asia", state: "Delhi", city: "New Delhi", type: "Fiber broadband", ownership: "Private", plan: "Xstream 1 Gbps", download: 790, upload: 590, ping: 9, jitter: 2.8, loss: 0.1, price: 50, currency: "USD", coverage: 82, reliability: 93, uptime: 99.93, rating: 4.3, dataCap: "3.3 TB", gaming: 92, streaming: 95, remote: 93 },
  { name: "BSNL Bharat Fiber", country: "India", code: "IN", region: "Asia", state: "Gujarat", city: "Surat", type: "Government fiber", ownership: "Government-owned", plan: "Fiber Premium", download: 245, upload: 185, ping: 22, jitter: 5.6, loss: 0.4, price: 18, currency: "USD", coverage: 76, reliability: 82, uptime: 99.2, rating: 3.8, dataCap: "3.3 TB", gaming: 74, streaming: 82, remote: 80 },
  { name: "ACT Fibernet", country: "India", code: "IN", region: "Asia", state: "Karnataka", city: "Bengaluru", type: "Fiber broadband", ownership: "Private", plan: "ACT Giga", download: 620, upload: 430, ping: 11, jitter: 3.2, loss: 0.2, price: 42, currency: "USD", coverage: 68, reliability: 89, uptime: 99.75, rating: 4.2, dataCap: "3 TB", gaming: 88, streaming: 91, remote: 90 },
  { name: "Tata Play Fiber", country: "India", code: "IN", region: "Asia", state: "Maharashtra", city: "Mumbai", type: "Fiber broadband", ownership: "Private", plan: "300 Mbps Unlimited", download: 285, upload: 250, ping: 12, jitter: 3.1, loss: 0.2, price: 32, currency: "USD", coverage: 62, reliability: 88, uptime: 99.7, rating: 4.1, dataCap: "Unlimited", gaming: 86, streaming: 90, remote: 88 },
  { name: "Xfinity", country: "United States", code: "US", region: "North America", state: "New York", city: "New York", type: "Cable broadband", ownership: "Private", plan: "Gigabit Extra", download: 980, upload: 42, ping: 18, jitter: 4.2, loss: 0.2, price: 80, currency: "USD", coverage: 89, reliability: 87, uptime: 99.82, rating: 3.9, dataCap: "1.2 TB", gaming: 82, streaming: 93, remote: 84 },
  { name: "Verizon Fios", country: "United States", code: "US", region: "North America", state: "New York", city: "New York", type: "Fiber broadband", ownership: "Private", plan: "Fios 1 Gig", download: 940, upload: 880, ping: 7, jitter: 1.8, loss: 0.1, price: 90, currency: "USD", coverage: 58, reliability: 95, uptime: 99.97, rating: 4.5, dataCap: "Unlimited", gaming: 96, streaming: 97, remote: 96 },
  { name: "AT&T Fiber", country: "United States", code: "US", region: "North America", state: "Texas", city: "Dallas", type: "Fiber broadband", ownership: "Private", plan: "Fiber 2 Gig", download: 1900, upload: 1650, ping: 6, jitter: 1.4, loss: 0.1, price: 110, currency: "USD", coverage: 61, reliability: 96, uptime: 99.98, rating: 4.4, dataCap: "Unlimited", gaming: 97, streaming: 98, remote: 97 },
  { name: "Spectrum", country: "United States", code: "US", region: "North America", state: "California", city: "Los Angeles", type: "Cable broadband", ownership: "Private", plan: "Internet Gig", download: 930, upload: 38, ping: 20, jitter: 4.8, loss: 0.3, price: 90, currency: "USD", coverage: 91, reliability: 86, uptime: 99.8, rating: 3.8, dataCap: "Unlimited", gaming: 80, streaming: 92, remote: 82 },
  { name: "T-Mobile 5G Home", country: "United States", code: "US", region: "North America", state: "Washington", city: "Seattle", type: "Fixed wireless", ownership: "Private", plan: "5G Home", download: 245, upload: 38, ping: 30, jitter: 8.5, loss: 0.5, price: 50, currency: "USD", coverage: 79, reliability: 80, uptime: 99.3, rating: 4.0, dataCap: "Unlimited", gaming: 68, streaming: 81, remote: 76 },
  { name: "Rogers Ignite", country: "Canada", code: "CA", region: "North America", state: "Ontario", city: "Toronto", type: "Cable broadband", ownership: "Private", plan: "Ignite 1.5 Gig", download: 1350, upload: 52, ping: 16, jitter: 4.1, loss: 0.2, price: 78, currency: "USD", coverage: 83, reliability: 86, uptime: 99.82, rating: 3.9, dataCap: "Unlimited", gaming: 81, streaming: 93, remote: 83 },
  { name: "Bell Fibe", country: "Canada", code: "CA", region: "North America", state: "Ontario", city: "Toronto", type: "Fiber broadband", ownership: "Private", plan: "Fibe 3 Gig", download: 2700, upload: 2200, ping: 5, jitter: 1.2, loss: 0.1, price: 95, currency: "USD", coverage: 63, reliability: 96, uptime: 99.98, rating: 4.4, dataCap: "Unlimited", gaming: 98, streaming: 98, remote: 98 },
  { name: "BT Broadband", country: "United Kingdom", code: "GB", region: "Europe", state: "England", city: "London", type: "Fiber broadband", ownership: "Private", plan: "Full Fibre 900", download: 900, upload: 110, ping: 9, jitter: 2.2, loss: 0.1, price: 72, currency: "USD", coverage: 78, reliability: 91, uptime: 99.9, rating: 4.1, dataCap: "Unlimited", gaming: 91, streaming: 94, remote: 92 },
  { name: "Virgin Media", country: "United Kingdom", code: "GB", region: "Europe", state: "England", city: "London", type: "Cable broadband", ownership: "Private", plan: "Gig1 Fibre", download: 1130, upload: 104, ping: 13, jitter: 3.4, loss: 0.2, price: 70, currency: "USD", coverage: 73, reliability: 88, uptime: 99.83, rating: 4.0, dataCap: "Unlimited", gaming: 87, streaming: 94, remote: 87 },
  { name: "Sky Broadband", country: "United Kingdom", code: "GB", region: "Europe", state: "England", city: "Manchester", type: "Fiber broadband", ownership: "Private", plan: "Gigafast", download: 900, upload: 100, ping: 11, jitter: 2.9, loss: 0.2, price: 64, currency: "USD", coverage: 71, reliability: 88, uptime: 99.84, rating: 4.0, dataCap: "Unlimited", gaming: 87, streaming: 92, remote: 88 },
  { name: "Deutsche Telekom", country: "Germany", code: "DE", region: "Europe", state: "Berlin", city: "Berlin", type: "Fiber broadband", ownership: "Private", plan: "MagentaZuhause Fiber", download: 930, upload: 480, ping: 8, jitter: 2.0, loss: 0.1, price: 75, currency: "USD", coverage: 65, reliability: 94, uptime: 99.96, rating: 4.2, dataCap: "Unlimited", gaming: 94, streaming: 95, remote: 95 },
  { name: "Orange", country: "France", code: "FR", region: "Europe", state: "Ile-de-France", city: "Paris", type: "Fiber broadband", ownership: "Private", plan: "Livebox Max Fibre", download: 2000, upload: 800, ping: 7, jitter: 1.7, loss: 0.1, price: 62, currency: "USD", coverage: 74, reliability: 94, uptime: 99.95, rating: 4.2, dataCap: "Unlimited", gaming: 95, streaming: 97, remote: 95 },
  { name: "Movistar", country: "Spain", code: "ES", region: "Europe", state: "Madrid", city: "Madrid", type: "Fiber broadband", ownership: "Private", plan: "Fibra 1 Gb", download: 940, upload: 860, ping: 8, jitter: 2.0, loss: 0.1, price: 65, currency: "USD", coverage: 82, reliability: 93, uptime: 99.93, rating: 4.1, dataCap: "Unlimited", gaming: 93, streaming: 95, remote: 94 },
  { name: "e&", country: "United Arab Emirates", code: "AE", region: "Middle East", state: "Dubai", city: "Dubai", type: "Fiber broadband", ownership: "Government-linked", plan: "Ultra 1 Gbps", download: 940, upload: 610, ping: 6, jitter: 1.8, loss: 0.1, price: 105, currency: "USD", coverage: 91, reliability: 96, uptime: 99.98, rating: 4.4, dataCap: "Unlimited", gaming: 96, streaming: 97, remote: 97 },
  { name: "du", country: "United Arab Emirates", code: "AE", region: "Middle East", state: "Dubai", city: "Dubai", type: "Fiber broadband", ownership: "Private", plan: "Home Wireless Plus", download: 640, upload: 290, ping: 12, jitter: 3.5, loss: 0.2, price: 82, currency: "USD", coverage: 86, reliability: 90, uptime: 99.85, rating: 4.1, dataCap: "Unlimited", gaming: 88, streaming: 92, remote: 90 },
  { name: "stc", country: "Saudi Arabia", code: "SA", region: "Middle East", state: "Riyadh", city: "Riyadh", type: "Fiber and mobile", ownership: "Government-linked", plan: "Baity Fiber", download: 520, upload: 190, ping: 14, jitter: 3.2, loss: 0.2, price: 78, currency: "USD", coverage: 84, reliability: 91, uptime: 99.9, rating: 4.2, dataCap: "Unlimited", gaming: 88, streaming: 91, remote: 89 },
  { name: "Ooredoo", country: "Qatar", code: "QA", region: "Middle East", state: "Doha", city: "Doha", type: "Fiber and mobile", ownership: "Government-linked", plan: "One 1 Gbps", download: 910, upload: 520, ping: 7, jitter: 1.9, loss: 0.1, price: 116, currency: "USD", coverage: 88, reliability: 95, uptime: 99.96, rating: 4.3, dataCap: "Unlimited", gaming: 95, streaming: 97, remote: 95 },
  { name: "Telstra", country: "Australia", code: "AU", region: "Australia & Oceania", state: "New South Wales", city: "Sydney", type: "NBN and mobile", ownership: "Private", plan: "Ultrafast NBN", download: 700, upload: 45, ping: 14, jitter: 3.0, loss: 0.2, price: 72, currency: "USD", coverage: 88, reliability: 91, uptime: 99.9, rating: 4.1, dataCap: "Unlimited", gaming: 88, streaming: 93, remote: 89 },
  { name: "Optus", country: "Australia", code: "AU", region: "Australia & Oceania", state: "New South Wales", city: "Sydney", type: "NBN and 5G", ownership: "Private", plan: "5G Home Internet", download: 320, upload: 55, ping: 24, jitter: 6.1, loss: 0.3, price: 58, currency: "USD", coverage: 77, reliability: 84, uptime: 99.5, rating: 3.9, dataCap: "Unlimited", gaming: 76, streaming: 86, remote: 81 },
  { name: "Spark", country: "New Zealand", code: "NZ", region: "Australia & Oceania", state: "Auckland", city: "Auckland", type: "Fiber and mobile", ownership: "Private", plan: "Fibre Max", download: 870, upload: 520, ping: 8, jitter: 2.0, loss: 0.1, price: 68, currency: "USD", coverage: 79, reliability: 92, uptime: 99.91, rating: 4.2, dataCap: "Unlimited", gaming: 92, streaming: 95, remote: 93 },
  { name: "Singtel", country: "Singapore", code: "SG", region: "Asia", state: "Singapore", city: "Singapore", type: "Fiber and mobile", ownership: "Private", plan: "10Gbps Fibre", download: 5200, upload: 4100, ping: 3, jitter: 0.8, loss: 0.1, price: 95, currency: "USD", coverage: 96, reliability: 98, uptime: 99.99, rating: 4.6, dataCap: "Unlimited", gaming: 99, streaming: 99, remote: 99 },
  { name: "NTT East", country: "Japan", code: "JP", region: "Asia", state: "Tokyo", city: "Tokyo", type: "Fiber broadband", ownership: "Private", plan: "FLET'S Hikari Cross", download: 4100, upload: 3300, ping: 4, jitter: 0.9, loss: 0.1, price: 70, currency: "USD", coverage: 93, reliability: 97, uptime: 99.98, rating: 4.5, dataCap: "Unlimited", gaming: 99, streaming: 99, remote: 98 },
  { name: "KT", country: "South Korea", code: "KR", region: "Asia", state: "Seoul", city: "Seoul", type: "Fiber and mobile", ownership: "Private", plan: "10G Internet", download: 4800, upload: 3900, ping: 3, jitter: 0.8, loss: 0.1, price: 78, currency: "USD", coverage: 94, reliability: 98, uptime: 99.99, rating: 4.5, dataCap: "Unlimited", gaming: 99, streaming: 99, remote: 99 },
  { name: "China Telecom", country: "China", code: "CN", region: "Asia", state: "Shanghai", city: "Shanghai", type: "Government-owned fiber", ownership: "Government-owned", plan: "Gigabit Fiber", download: 930, upload: 420, ping: 9, jitter: 2.2, loss: 0.1, price: 42, currency: "USD", coverage: 90, reliability: 93, uptime: 99.94, rating: 4.2, dataCap: "Unlimited", gaming: 91, streaming: 94, remote: 92 },
  { name: "MTN", country: "South Africa", code: "ZA", region: "Africa", state: "Gauteng", city: "Johannesburg", type: "Mobile and fixed wireless", ownership: "Private", plan: "5G Home", download: 260, upload: 48, ping: 28, jitter: 7.0, loss: 0.4, price: 45, currency: "USD", coverage: 76, reliability: 83, uptime: 99.45, rating: 3.9, dataCap: "1 TB", gaming: 70, streaming: 84, remote: 79 },
  { name: "Vodacom", country: "South Africa", code: "ZA", region: "Africa", state: "Western Cape", city: "Cape Town", type: "Mobile and fiber", ownership: "Private", plan: "Fibre 500", download: 480, upload: 240, ping: 18, jitter: 4.4, loss: 0.3, price: 58, currency: "USD", coverage: 72, reliability: 86, uptime: 99.65, rating: 4.0, dataCap: "Unlimited", gaming: 82, streaming: 89, remote: 84 },
  { name: "Safaricom", country: "Kenya", code: "KE", region: "Africa", state: "Nairobi", city: "Nairobi", type: "Fiber and mobile", ownership: "Private", plan: "Home Fibre Platinum", download: 180, upload: 90, ping: 20, jitter: 5.2, loss: 0.4, price: 38, currency: "USD", coverage: 69, reliability: 84, uptime: 99.5, rating: 4.1, dataCap: "Unlimited", gaming: 78, streaming: 84, remote: 82 },
  { name: "Maroc Telecom", country: "Morocco", code: "MA", region: "Africa", state: "Casablanca-Settat", city: "Casablanca", type: "Fiber and mobile", ownership: "Government-linked", plan: "Fibre Optique 200", download: 205, upload: 105, ping: 18, jitter: 4.9, loss: 0.3, price: 50, currency: "USD", coverage: 65, reliability: 84, uptime: 99.45, rating: 3.8, dataCap: "Unlimited", gaming: 80, streaming: 85, remote: 82 },
  { name: "Vivo Fibra", country: "Brazil", code: "BR", region: "South America", state: "Sao Paulo", city: "Sao Paulo", type: "Fiber broadband", ownership: "Private", plan: "Fibra 700 Mega", download: 690, upload: 350, ping: 10, jitter: 2.8, loss: 0.2, price: 36, currency: "USD", coverage: 74, reliability: 90, uptime: 99.85, rating: 4.2, dataCap: "Unlimited", gaming: 90, streaming: 93, remote: 91 },
  { name: "Claro", country: "Argentina", code: "AR", region: "South America", state: "Buenos Aires", city: "Buenos Aires", type: "Fiber and mobile", ownership: "Private", plan: "Fibra 600", download: 590, upload: 310, ping: 12, jitter: 3.1, loss: 0.2, price: 32, currency: "USD", coverage: 67, reliability: 87, uptime: 99.7, rating: 4.0, dataCap: "Unlimited", gaming: 87, streaming: 91, remote: 88 },
  { name: "Entel", country: "Chile", code: "CL", region: "South America", state: "Santiago", city: "Santiago", type: "Fiber and mobile", ownership: "Private", plan: "Fibra 940", download: 910, upload: 690, ping: 8, jitter: 2.1, loss: 0.1, price: 44, currency: "USD", coverage: 70, reliability: 91, uptime: 99.87, rating: 4.2, dataCap: "Unlimited", gaming: 93, streaming: 95, remote: 93 },
  { name: "Antel", country: "Uruguay", code: "UY", region: "South America", state: "Montevideo", city: "Montevideo", type: "Government fiber", ownership: "Government-owned", plan: "Fibra Hogar", download: 620, upload: 260, ping: 9, jitter: 2.3, loss: 0.1, price: 50, currency: "USD", coverage: 84, reliability: 92, uptime: 99.9, rating: 4.2, dataCap: "Unlimited", gaming: 91, streaming: 93, remote: 92 },
  { name: "Starlink", country: "Global", code: "GL", region: "Satellite", state: "Low Earth Orbit", city: "Worldwide", type: "Satellite internet", ownership: "Private", plan: "Residential", download: 180, upload: 25, ping: 38, jitter: 9.2, loss: 0.6, price: 120, currency: "USD", coverage: 92, reliability: 82, uptime: 99.4, rating: 4.1, dataCap: "Fair use", gaming: 70, streaming: 83, remote: 78 }
];

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
  const speed = clamp((provider.download / 1000) * 26, 0, 26);
  const upload = clamp((provider.upload / 700) * 12, 0, 12);
  const latency = clamp(18 - provider.ping / 3 - provider.jitter / 3, 0, 18);
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
  qs("#profileDownload").textContent = provider.download;
  qs("#profileUpload").textContent = provider.upload;
  qs("#profilePing").textContent = provider.ping;
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
    const avg = regionProviders.length ? Math.round(regionProviders.reduce((sum, provider) => sum + provider.download, 0) / regionProviders.length) : 0;
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
        <span>${provider.download} Mbps</span>
        <span>${provider.upload} Mbps</span>
        <span>${provider.ping} ms</span>
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
      const score = ranking === "gaming" ? provider.gaming : ranking === "streaming" ? provider.streaming : ranking === "remote" ? provider.remote : ranking === "value" ? Math.round(provider.download / provider.price) : provider.download;
      return `<div class="ranking-row"><strong>#${index + 1}</strong><span class="provider-name">${provider.name}</span><span>${provider.city}, ${provider.country}</span><span>${provider.download} Mbps</span><span>${provider.ping} ms</span><span>${score}</span></div>`;
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
        <span class="tag">${provider.download} Mbps down</span>
        <span class="tag">${provider.upload} Mbps up</span>
        <span class="tag">${provider.ping} ms ping</span>
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
  const ctx = canvas.getContext("2d");
  let width = 0;
  let height = 0;
  let nodes = [];

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
    window.requestAnimationFrame(draw);
  }

  resize();
  draw();
  window.addEventListener("resize", resize);
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
    return;
  }

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
let lastGraphSample = { down: 0, up: 0 };
function pushGraphSample(kind, mbps) {
  const now = performance.now();
  if (now - lastGraphSample[kind] < 40) return;
  lastGraphSample[kind] = now;
  graphData[kind].push({ t: now - graphData.startAt, v: mbps });
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
let testRunning = false;

async function runSpeedTest() {
  const progress = qs("#testProgress");
  const status = qs("#testStatus");
  if (testRunning) return; // a run is already in flight
  testRunning = true;
  /** Set when a phase could not produce a figure, so the result says why. */
  let uploadNote = null;
  activeTestController = new AbortController();
  const { signal } = activeTestController;
  progress.style.width = "0%";
  status.textContent = "Selecting the nearest measurement edge by latency...";
  qs("#stopTest").hidden = false;
  qs("#resultSummary").hidden = true;
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
  });
  ["#downloadValue", "#uploadValue", "#pingValue", "#jitterValue", "#lossValue", "#dnsValue", "#stabilityValue"].forEach((id) => setMetric(id, null));

  try {
    // Sequencing, edge selection and failover live in core/run.js, which the
    // Next.js app drives too. Everything below is rendering: this file decides
    // what the page says and shows, never what order things happen in.
    const outcome = await runMeasurement(
      {
        onPhase: (phase) => {
          if (PHASE_COPY[phase]) status.textContent = PHASE_COPY[phase];
          // Not zero — nothing has been measured yet, and 0.00 Mbps is a claim.
          if (phase === "download") {
            setGaugeFraction(0, "—", "DOWNLOAD", "Mbps");
            startGraph();
          }
          if (phase === "upload") setGaugeFraction(0, "—", "UPLOAD", "Mbps");
        },
        onEdge: (label) => setEdgeLabel(label),
        onFallback: (failed) => {
          // Said out loud rather than swallowed: a number measured against a
          // different server than the one on screen misleads the user.
          status.textContent = `${failed.name} did not respond — falling back to the next edge...`;
        },
        onProgress: (percent) => {
          progress.style.width = `${percent}%`;
        },
        onMetric: (patch) => {
          if ("ping" in patch) setMetric("#pingValue", patch.ping);
          if ("jitter" in patch) setMetric("#jitterValue", patch.jitter, 1);
          if ("loss" in patch) setMetric("#lossValue", patch.loss, 1);
          if ("dns" in patch) setMetric("#dnsValue", patch.dns);
          if ("download" in patch) setMetric("#downloadValue", patch.download, 1);
          if ("upload" in patch) setMetric("#uploadValue", patch.upload, 1);
          if ("stability" in patch) setMetric("#stabilityValue", patch.stability);
          Object.assign(state, patch);
        },
        // The arc tracks probe progress; the number is the round trip that just
        // came back, so nothing on screen is a placeholder.
        onLatencyProbe: (done, all, lastRtt) =>
          setGaugeFraction(done / all, lastRtt === undefined ? "—" : lastRtt.toFixed(0), "PING", "ms"),
        onDownloadSample: (mbps) => {
          setGauge(mbps, "DOWNLOAD");
          pushGraphSample("down", mbps);
        },
        onUploadSample: (mbps) => {
          setGauge(mbps, "UPLOAD");
          pushGraphSample("up", mbps);
        },
        onLatencyDetail: renderLatencyPanel,
        onBufferbloat: renderBufferbloat,
      },
      signal,
    );

    Object.assign(state, outcome.result);
    uploadNote = outcome.uploadNote;
    stopGraph();
    updateScores();
    // Leave the dial parked on the headline number — the download result.
    setGauge(state.download, "DOWNLOAD");
    showGauge("done");
    saveHistoryEntry({
      at: Date.now(),
      download: state.download,
      upload: state.upload,
      ping: state.ping,
      isp: state.network ? state.network.isp : null,
      edgeCity: state.network ? state.network.edgeCity : null,
    });
    // The panel was only rendered on page load, so the run that had just been
    // written to history did not appear in it until the next reload — the list
    // showed every result except the one the user was looking at.
    renderHistory();
    // A missing metric is stated, not left as a dash the user has to interpret.
    status.textContent = uploadNote
      ? `Finished, but upload could not be measured: ${uploadNote}. Every other figure is from this run.`
      : `Finished. WiFi health score: ${state.health}/100. Result card, link and sharing are ready.`;
  } catch (error) {
    if (error instanceof TestAborted) {
      // Blank the tiles. The figures on screen were real, but a download
      // averaged over one second of a six-second window is not a download
      // speed — it is an unfinished measurement, and leaving it displayed
      // beside a finished-looking layout invites it to be read as a result.
      ["#downloadValue", "#uploadValue", "#pingValue", "#jitterValue", "#lossValue", "#dnsValue", "#stabilityValue"]
        .forEach((id) => setMetric(id, null));
      showGauge("idle");
      status.textContent = "Test stopped. Partial measurements were discarded — nothing here is a completed result.";
      return;
    }
    progress.style.width = "0%";
    stopGraph();
    showGauge(state.download === null ? "idle" : "done");
    status.textContent = `Test failed: ${error.message}. Check your connection and try again.`;
  } finally {
    testRunning = false;
    activeTestController = null;
    qs("#stopTest").hidden = true;
  }
}

function stopSpeedTest() {
  activeTestController?.abort();
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
  // Upload is null when the uplink was too slow to complete a chunk in the
  // window. Interpolating it threw a TypeError on .toFixed and killed the share.
  const up = state.upload === null ? "upload not measurable" : `${state.upload.toFixed(1)} Mbps up`;
  const text = state.download
    ? `WifiPlus result: ${state.download.toFixed(1)} Mbps down, ${up}, ${state.ping} ms ping.`
    : "Test your internet speed globally with WifiPlus.";
  if (navigator.share) {
    navigator.share({ title: "WifiPlus Speed Result", text, url: location.href.split("#")[0] }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(`${text} ${location.href.split("#")[0]}`);
    qs("#testStatus").textContent = "Share text copied to clipboard.";
  }
}

function downloadResultCard() {
  // Previously this quietly started a speed test — a button labelled "Download
  // Result Card" doing something entirely different, with no warning and an
  // 11-second wait before anything explained itself. Say what is missing and
  // leave the decision to start a run where the user put it: the GO dial.
  if (state.download === null) {
    qs("#testStatus").textContent = "No result to put on a card yet — press GO to measure your connection first.";
    return;
  }
  const canvas = qs("#resultCardCanvas");
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#071116";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#24d1c3";
  ctx.fillRect(0, 0, canvas.width, 18);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 64px Segoe UI, sans-serif";
  ctx.fillText("WifiPlus Global Result", 74, 130);
  ctx.font = "700 30px Segoe UI, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  // The card carries measurements, not analysis. Nothing on it is produced
  // by a model, and the AI Doctor is a separate, opt-in feature.
  ctx.fillText("Measured in the browser — real bytes, no simulation", 74, 184);
  // A card is a durable artefact people post publicly, so a metric that was not
  // measured says so rather than printing a number it never had.
  const items = [
    ["Download", `${state.download.toFixed(1)} Mbps`, "#24d1c3"],
    ["Upload", state.upload === null ? "Not measurable" : `${state.upload.toFixed(1)} Mbps`, "#f6b64b"],
    ["Ping", `${state.ping} ms`, "#57a6ff"],
    ["WiFi Health", state.health === null ? "--" : `${state.health}/100`, "#62d26f"]
  ];
  items.forEach((item, index) => {
    const x = index % 2 === 0 ? 74 : 558;
    const y = index < 2 ? 310 : 585;
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
}

initTheme();
updatePlatformNotice();
setupCanvas();
initLocationControls();
renderRegions();
renderRankings();
renderSeoPages();
updateBandwidth();
updatePingCalculator();
recommendProviders();
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

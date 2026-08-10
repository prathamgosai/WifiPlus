/**
 * Landing-page test runner.
 *
 * The full tool at / drives a large dashboard; a landing page only needs the GO
 * control, a live readout and a results table. Both run the identical engine
 * from core/, so a number measured here and a number measured on the home page
 * are the same measurement — there is no "lite" version of the maths.
 */
import {
  bufferbloatFrom,
  measureDns,
  measureDownload,
  measureLatency,
  measureLoadedLatency,
  measureUpload,
  stabilityFrom,
} from "./core/measure.js";

const qs = (selector) => document.querySelector(selector);

let running = false;

/**
 * Localised strings, published by the generator as data attributes on the tool
 * container. They cannot be an inline script — CSP forbids that — and hardcoding
 * English here would leave every translated page reporting progress in the wrong
 * language halfway through the run.
 *
 * @param {string} name
 * @param {string} fallback
 */
function t(name, fallback) {
  const tool = qs(".tool");
  const value = tool instanceof HTMLElement ? tool.dataset[name] : undefined;
  return value && value.length ? value : fallback;
}

/**
 * @param {string} selector
 * @param {number | string | null} value
 * @param {number} [digits]
 */
function setResult(selector, value, digits = 0) {
  const node = qs(selector);
  if (!node) return;
  const unit = node.querySelector("span");
  node.textContent = value === null || value === undefined ? "--" : Number(value).toFixed(digits);
  if (unit) node.append(unit);
}

/**
 * @param {number} fraction 0-1
 * @param {string} readout
 * @param {string} phase
 * @param {string} unit
 */
function setReadout(fraction, readout, phase, unit) {
  const bar = qs("#bar");
  if (bar instanceof HTMLElement) bar.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
  const value = qs("#value");
  const unitNode = qs("#unit");
  const phaseNode = qs("#phase");
  if (value) value.textContent = readout;
  if (unitNode) unitNode.textContent = unit;
  if (phaseNode) phaseNode.textContent = phase;
}

function setStatus(message) {
  const node = qs("#status");
  if (node) node.textContent = message;
}

async function run() {
  if (running) return;
  running = true;

  const button = qs("#goButton");
  const caption = qs("#goCaption");
  const readout = qs("#readout");
  const results = qs("#results");
  if (button instanceof HTMLElement) button.hidden = true;
  if (caption instanceof HTMLElement) caption.hidden = true;
  if (readout instanceof HTMLElement) readout.hidden = false;

  setReadout(0, "—", t("phasePing", "PING"), "ms");
  setStatus(t("statusLatency", "Measuring ping, jitter, packet loss and DNS…"));

  try {
    // Idle latency and DNS together — DNS is off the throughput path, so it
    // costs no extra wall-clock here.
    const [latency, dns] = await Promise.all([
      measureLatency((done, all, lastRtt) => {
        setReadout(done / all, lastRtt === undefined ? "—" : lastRtt.toFixed(0), t("phasePing", "PING"), "ms");
      }),
      measureDns(),
    ]);

    setResult("#rPing", latency.ping);
    setResult("#rJitter", latency.jitter, 1);
    setResult("#rLoss", latency.loss, 1);
    setResult("#rDns", dns);
    if (results instanceof HTMLElement) results.hidden = false;

    // Download and latency-under-load together: the bufferbloat reading is taken
    // during the real download, so the load is the actual test traffic.
    setStatus(t("statusDownload", "Measuring download and latency under load…"));
    const [down, loadedProbes] = await Promise.all([
      measureDownload((mbps, fraction) =>
        setReadout(fraction, mbps.toFixed(2), t("phaseDownload", "DOWNLOAD"), "Mbps"),
      ),
      measureLoadedLatency(),
    ]);
    setResult("#rDownload", Number(down.toFixed(1)), 1);

    // Null when too few probes returned under load — see core/measure.js.
    const bloat = bufferbloatFrom(latency.ping, loadedProbes);
    const bloatNode = qs("#rBloat");
    if (bloatNode) {
      const unit = bloatNode.querySelector("span");
      bloatNode.textContent = bloat ? bloat.grade : "?";
      if (unit) {
        unit.textContent = bloat ? `+${bloat.increase} ms` : "not measurable";
        bloatNode.append(unit);
      }
    }

    setStatus(t("statusUpload", "Measuring upload…"));
    const up = await measureUpload(
      (mbps, fraction) => setReadout(fraction, mbps.toFixed(2), t("phaseUpload", "UPLOAD"), "Mbps"),
      undefined,
      undefined,
      // Seed the first chunk from the download just measured.
      down,
    );
    setResult("#rUpload", Number(up.toFixed(1)), 1);
    setResult("#rStability", stabilityFrom(latency.samples, latency.jitter, latency.loss));

    setReadout(1, down.toFixed(2), t("phaseDownload", "DOWNLOAD"), "Mbps");
    // Thresholds live in core so every surface grades identically; only the
    // wording comes from the page, which is what makes it translatable.
    const verdict = !bloat
      ? t("verdictUnavailable", "Latency under load could not be measured this run.")
      : bloat.increase < 30
        ? t("verdictGood", "Your router keeps queues short.")
        : bloat.increase < 100
          ? t("verdictQueueing", "Noticeable queueing under load.")
          : t("verdictSevere", "Severe bufferbloat under load.");
    setStatus(verdict);
  } catch (error) {
    setStatus(`${t("statusFailed", "Test failed. Check your connection and try again.")} (${error instanceof Error ? error.message : "unknown error"})`);
    if (readout instanceof HTMLElement) readout.hidden = true;
  } finally {
    running = false;
    if (button instanceof HTMLElement) {
      button.hidden = false;
      button.textContent = t("labelAgain", "AGAIN");
      button.classList.add("small");
    }
  }
}

qs("#goButton")?.addEventListener("click", run);

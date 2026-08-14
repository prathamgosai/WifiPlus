/**
 * Landing-page test runner.
 *
 * The full tool at / drives a large dashboard; a landing page only needs the GO
 * control, a live readout and a results table. Both run the identical engine
 * from core/, so a number measured here and a number measured on the home page
 * are the same measurement — there is no "lite" version of the maths.
 */
import { runMeasurement } from "./core/run.js";

const qs = (selector) => document.querySelector(selector);

let running = false;
let testController = null;

function t(name, fallback) {
  const tool = qs(".tool");
  const value = tool instanceof HTMLElement ? tool.dataset[name] : undefined;
  return value && value.length ? value : fallback;
}

function setResult(selector, value, digits = 0) {
  const node = qs(selector);
  if (!node) return;
  const unit = node.querySelector("span");
  node.textContent = value === null || value === undefined ? "--" : Number(value).toFixed(digits);
  if (unit) node.append(unit);
}

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
  if (running) {
    testController?.abort();
    return;
  }
  running = true;
  testController = new AbortController();

  const button = qs("#goButton");
  const caption = qs("#goCaption");
  const readout = qs("#readout");
  const results = qs("#results");
  if (button instanceof HTMLElement) {
    button.textContent = "STOP";
    button.classList.add("cancel");
  }
  if (caption instanceof HTMLElement) caption.hidden = true;
  if (readout instanceof HTMLElement) readout.hidden = false;

  setReadout(0, "—", t("phasePing", "PING"), "ms");
  setStatus(t("statusLatency", "Measuring ping, jitter, packet loss and DNS…"));

  try {
    const outcome = await runMeasurement({
      onPhase: (phase) => {
        if (phase === 'download') setStatus(t("statusDownload", "Measuring download and latency under load…"));
        else if (phase === 'upload') setStatus(t("statusUpload", "Measuring upload…"));
      },
      onProgress: (percent) => {
        // Handled by specific sample callbacks
      },
      onLatencyProbe: (done, all, lastRtt) => {
        setReadout(done / all, lastRtt === undefined ? "—" : lastRtt.toFixed(0), t("phasePing", "PING"), "ms");
      },
      onDownloadSample: (mbps, fraction) => {
        setReadout(fraction, mbps.toFixed(2), t("phaseDownload", "DOWNLOAD"), "Mbps");
      },
      onUploadSample: (mbps, fraction) => {
        setReadout(fraction, mbps.toFixed(2), t("phaseUpload", "UPLOAD"), "Mbps");
      },
      onMetric: (patch) => {
        if (results instanceof HTMLElement) results.hidden = false;
        if (patch.ping !== undefined) setResult("#rPing", patch.ping);
        if (patch.jitter !== undefined) setResult("#rJitter", patch.jitter, 1);
        if (patch.loss !== undefined) setResult("#rLoss", patch.loss, 1);
        if (patch.dns !== undefined) setResult("#rDns", patch.dns);
        if (patch.download !== undefined) setResult("#rDownload", patch.download, 1);
        if (patch.upload !== undefined) setResult("#rUpload", patch.upload, 1);
        if (patch.stability !== undefined) setResult("#rStability", patch.stability);
      },
      onBufferbloat: (bloat) => {
        const bloatNode = qs("#rBloat");
        if (bloatNode) {
          const unit = bloatNode.querySelector("span");
          bloatNode.textContent = bloat ? bloat.grade : "?";
          if (unit) {
            unit.textContent = bloat ? `+${bloat.increase} ms` : "not measurable";
            bloatNode.append(unit);
          }
        }
        const verdict = !bloat
          ? t("verdictUnavailable", "Latency under load could not be measured this run.")
          : bloat.increase < 30
            ? t("verdictGood", "Your router keeps queues short.")
            : bloat.increase < 100
              ? t("verdictQueueing", "Noticeable queueing under load.")
              : t("verdictSevere", "Severe bufferbloat under load.");
        setStatus(verdict);
      }
    }, testController.signal);

    setReadout(1, (outcome.result.download || 0).toFixed(2), t("phaseDownload", "DOWNLOAD"), "Mbps");
  } catch (error) {
    if (error.name === "TestAborted") {
      setStatus("Test cancelled.");
    } else {
      setStatus(`${t("statusFailed", "Test failed. Check your connection and try again.")} (${error.message || "unknown error"})`);
    }
    if (readout instanceof HTMLElement) readout.hidden = true;
  } finally {
    running = false;
    testController = null;
    if (button instanceof HTMLElement) {
      button.hidden = false;
      button.textContent = t("labelAgain", "AGAIN");
      button.classList.remove("cancel");
      button.classList.add("small");
    }
  }
}

qs("#goButton")?.addEventListener("click", run);

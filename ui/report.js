/**
 * The result report — DOM rendering for everything below the instrument.
 * -----------------------------------------------------------------------------
 * Pure presentation. Every number here arrives already computed by `core/` and
 * every verdict by `core/health.js`; nothing in this file decides what a
 * measurement means, it only decides how it looks. That separation is what lets
 * the scoring be checked by a unit test rather than by reading a render tree.
 */

import { bottleneck, diagnosisConfidence, healthBand, suitability } from "../core/health.js";
import { bufferbloatVerdict } from "../core/scoring.js";
import { verdictLabel } from "../core/quality.js";

const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/** Circumference of the health ring at r=86, matching the markup. */
const HEALTH_ARC = 2 * Math.PI * 86;

const LEVEL_TEXT = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
  unknown: "Unknown",
};

const TONE_VAR = {
  excellent: "var(--good)",
  good: "var(--brand)",
  fair: "var(--warn)",
  poor: "var(--bad)",
  unknown: "var(--ink-3)",
};

/** @param {unknown} value @returns {value is number} */
const num = (value) => typeof value === "number" && Number.isFinite(value);

/**
 * @param {number | null} value
 * @param {number} digits
 * @param {string} unit
 */
function figure(value, digits, unit) {
  if (!num(value)) return `—${unit ? `<small>${unit}</small>` : ""}`;
  return `${value.toFixed(digits)}${unit ? `<small>${unit}</small>` : ""}`;
}

/**
 * The headline panel: score, band, what the connection is good for, and the four
 * figures people recognise.
 *
 * @param {import("../core/scoring.js").SpeedResult & { health?: number | null }} result
 * @param {number | null} score
 * @param {import("../core/measure.js").BufferbloatResult | null} bufferbloat
 */
export function renderHealth(result, score, bufferbloat) {
  const band = healthBand(score);
  const color = TONE_VAR[band.tone];

  const card = qs("#healthCard");
  if (card) card.style.setProperty("--health-color", color);

  const value = qs("#healthValue");
  if (value) value.textContent = num(score) ? String(Math.round(score)) : "--";

  const grade = qs("#healthGrade");
  if (grade) grade.textContent = band.grade;

  const verdict = qs("#healthVerdict");
  if (verdict) verdict.textContent = band.verdict;

  const ring = qs("#healthRingFill");
  if (ring) {
    const fraction = num(score) ? Math.max(0, Math.min(1, score / 100)) : 0;
    ring.setAttribute("stroke-dashoffset", String(HEALTH_ARC * (1 - fraction)));
  }

  // Suitability: four graded verdicts, each from the thresholds declared in
  // core/health.js rather than from a feeling about the number.
  const verdicts = suitability(result, bufferbloat);
  for (const item of verdicts) {
    const node = qs(`.suit[data-use="${item.key}"]`);
    if (!node) continue;
    node.dataset.level = item.level;
    const level = qs(".suit-level", node);
    const note = qs(".suit-note", node);
    if (level) level.textContent = LEVEL_TEXT[item.level];
    if (note) note.textContent = item.note;
  }

  setHtml("#hfDownload", figure(result.download, 1, "Mbps"));
  setHtml("#hfUpload", figure(result.upload, 1, "Mbps"));
  setHtml("#hfPing", figure(result.ping, 0, "ms"));
  setHtml("#hfJitter", figure(result.jitter, 1, "ms"));
  setHtml("#hfBloat", bufferbloat ? `${bufferbloat.grade}<small>+${bufferbloat.increase}ms</small>` : "—");
}

/** @param {string} selector @param {string} html */
function setHtml(selector, html) {
  const node = qs(selector);
  if (node) node.innerHTML = html;
}

/**
 * Bufferbloat, expressed as a bar rather than only a number: the idle latency
 * you paid for, and the queueing delay stacked on top of it.
 *
 * @param {import("../core/measure.js").BufferbloatResult | null} bloat
 */
export function renderBufferbloat(bloat) {
  const badge = qs("#bloatGrade");
  const delta = qs("#bloatDelta");
  const detail = qs("#bloatDetail");
  const verdict = qs("#bloatVerdict");
  const bar = qs("#bloatBar");
  if (!badge || !delta || !detail || !verdict) return;

  badge.classList.remove("warn", "bad", "unknown");

  // Null is a real answer: too few probes survived the saturated link to grade
  // it. Printing a grade derived from one straggler would be worse than saying so.
  if (!bloat) {
    badge.textContent = "?";
    badge.classList.add("unknown");
    delta.textContent = "Not measurable this run";
    detail.textContent = "Too few latency probes returned while the link was saturated to judge queueing.";
    verdict.textContent =
      "This usually means the connection was fully occupied by the download. Re-run the test, ideally with other devices idle.";
    if (bar) bar.hidden = true;
    return;
  }

  badge.textContent = bloat.grade;
  if (["B", "C"].includes(bloat.grade)) badge.classList.add("warn");
  if (["D", "F"].includes(bloat.grade)) badge.classList.add("bad");

  delta.textContent = `+${bloat.increase} ms under load`;
  // The basis is stated, not implied. A grade taken from the median of a few
  // probes and one taken from the p95 of sixty are different claims, and a
  // reader comparing two runs deserves to know which they are looking at.
  const basis =
    bloat.basis === "median"
      ? ` Graded on the median of ${bloat.probes} probes — too few for a p95, so this is the gentler reading.`
      : bloat.probes
        ? ` Graded on the 95th percentile of ${bloat.probes} probes.`
        : "";
  detail.textContent = `Idle ${bloat.idle} ms rising to ${bloat.loaded} ms while the link is saturated.${basis}`;
  verdict.textContent = bufferbloatVerdict(bloat.increase);

  if (bar) {
    bar.hidden = false;
    const total = Math.max(1, bloat.loaded);
    const idlePct = Math.max(2, Math.min(100, (bloat.idle / total) * 100));
    const addedPct = Math.max(0, Math.min(100 - idlePct, (bloat.increase / total) * 100));
    const idleEl = qs("#bloatBarIdle");
    const addedEl = qs("#bloatBarAdded");
    if (idleEl) idleEl.style.width = `${idlePct}%`;
    if (addedEl) addedEl.style.width = `${addedPct}%`;
  }
}

/**
 * Light the hop the measurement points at.
 *
 * @param {import("../core/scoring.js").SpeedResult} result
 * @param {import("../core/measure.js").BufferbloatResult | null} bufferbloat
 * @param {{ degraded?: boolean, edgeLabel?: string | null }} context
 */
export function renderPath(result, bufferbloat, context) {
  const hops = bottleneck(result, bufferbloat, context);
  for (const hop of hops) {
    const node = qs(`.hop[data-hop="${hop.hop}"]`);
    if (!node) continue;
    node.dataset.flag = hop.flag;
    const state = qs(".hop-state", node);
    if (state) state.textContent = hop.note;
  }
}

/**
 * The doctor panel. The diagnosis itself comes from `core/ai-doctor.js`; this
 * lays it out and states how much weight the run supports.
 *
 * @param {{ summary: string, recommendations: string[] }} diagnosis
 * @param {import("../core/scoring.js").SpeedResult} result
 * @param {import("../core/measure.js").BufferbloatResult | null} bufferbloat
 */
export function renderDoctor(diagnosis, result, bufferbloat) {
  const panel = qs("#aiDoctorPanel");
  const summary = qs("#aiDoctorSummary");
  const list = qs("#aiDoctorRecommendations");
  const confidence = qs("#doctorConfidence");
  if (!panel || !summary || !list) return;

  panel.hidden = false;
  summary.classList.remove("shimmer");
  summary.textContent = diagnosis.summary;

  list.textContent = "";
  for (const line of diagnosis.recommendations) {
    const item = document.createElement("div");
    item.className = "doctor-item";
    // textContent, not innerHTML: the recommendation strings are generated
    // locally today, but a rule that only holds while nobody adds a user-derived
    // string to them is not a rule.
    const text = document.createElement("span");
    text.textContent = line;
    item.appendChild(text);
    list.appendChild(item);
  }

  if (confidence) confidence.textContent = diagnosisConfidence(result, bufferbloat).confidence;
}

/**
 * The run grading itself.
 *
 * Deliberately shows the checks that PASSED as well as the ones that did not.
 * A verdict with no visible basis is a badge, and a badge is exactly the kind
 * of unearned reassurance this panel exists to replace — a reader should be
 * able to see which specific things were confirmed and disagree with any of
 * them.
 *
 * @param {import("../core/quality.js").QualityReport | null} quality
 */
export function renderQuality(quality) {
  const pill = qs("#measurementVerdict");
  const pillLabel = qs("#measurementVerdictLabel");
  const level = qs("#qualityLevel");
  const detail = qs("#qualityVerdictDetail");
  const checks = qs("#qualityChecks");

  if (!quality) {
    if (pill) pill.dataset.level = "unknown";
    if (pillLabel) pillLabel.textContent = "Measurement";
    if (level) level.textContent = "—";
    if (detail) detail.textContent = "";
    if (checks) checks.textContent = "";
    return;
  }

  const { label, detail: text } = verdictLabel(quality.verdict);
  if (pill) pill.dataset.level = quality.verdict;
  if (pillLabel) pillLabel.textContent = label;
  if (level) level.textContent = quality.level.toUpperCase();
  if (detail) detail.textContent = text;

  if (!checks) return;
  checks.textContent = "";
  for (const reason of quality.reasons) {
    const row = document.createElement("p");
    row.className = "quality-line warn";
    row.textContent = reason;
    checks.appendChild(row);
  }
  for (const ok of quality.passed) {
    const row = document.createElement("p");
    row.className = "quality-line pass";
    row.textContent = ok;
    checks.appendChild(row);
  }
}

/**
 * Everything the engine recorded, laid out so a figure above can be
 * recomputed rather than believed.
 *
 * @param {object | null} record
 */
export function renderTechnical(record) {
  const grid = qs("#technicalDetails");
  if (!grid) return;
  grid.textContent = "";
  if (!record) return;

  const bytes = (n) =>
    typeof n === "number" && Number.isFinite(n)
      ? n >= 1e9
        ? `${(n / 1e9).toFixed(2)} GB`
        : n >= 1e6
          ? `${(n / 1e6).toFixed(1)} MB`
          : `${Math.round(n / 1e3)} kB`
      : "—";
  const ms = (n) => (typeof n === "number" && Number.isFinite(n) ? `${Math.round(n)} ms` : "—");
  const mbps = (n) => (typeof n === "number" && Number.isFinite(n) ? `${n.toFixed(2)} Mbps` : "—");
  const pct = (n) => (typeof n === "number" && Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : "—");

  const down = record.evidence?.download ?? null;
  const up = record.evidence?.upload ?? null;

  /** @type {Array<[string, string]>} */
  const rows = [
    ["Measurement edge", record.edgeLabel || "—"],
    ["HTTP version", record.evidence?.protocol || "not reported"],
    ["Test started", record.at ? new Date(record.at).toISOString() : "—"],
    ["Client", record.client || "—"],

    ["Download figure", mbps(down?.mbps)],
    ["Download method", down?.method || "—"],
    ["Download bytes", bytes(down?.bytes)],
    ["Download window", ms(down?.measuredMs)],
    ["Download streams", down ? String(down.streams) : "—"],
    ["Download warm-up discarded", ms(down?.warmupMs)],
    ["Download samples", down ? String(down.samples.length) : "—"],
    ["Download cross-check", mbps(down?.reconciliationMbps)],
    ["Download agreement", pct(record.quality?.reconcile?.download)],

    ["Upload figure", mbps(up?.mbps)],
    ["Upload method", up?.method || (record.uploadNote ? `failed: ${record.uploadNote}` : "—")],
    ["Upload bytes acknowledged", bytes(up?.bytes)],
    ["Upload window", ms(up?.measuredMs)],
    ["Upload streams", up ? String(up.streams) : "—"],
    ["Upload posts acknowledged", up?.posts ? String(up.posts.length) : "—"],
    ["Upload cross-check", mbps(up?.reconciliationMbps)],
    ["Upload agreement", pct(record.quality?.reconcile?.upload)],

    ["Idle latency probes", record.evidence ? String(record.evidence.idleProbes) : "—"],
    ["Probes under download load", record.evidence ? String(record.evidence.downloadLoadedProbes) : "—"],
    ["Probes under upload load", record.evidence ? String(record.evidence.uploadLoadedProbes) : "—"],
    [
      "Latency added by download",
      record.downloadBloat
        ? `+${record.downloadBloat.increase} ms (${record.downloadBloat.grade})`
        : "not measurable",
    ],
    [
      "Latency added by upload",
      record.uploadBloat
        ? `+${record.uploadBloat.increase} ms (${record.uploadBloat.grade})`
        : "not measurable",
    ],
  ];

  for (const [key, value] of rows) {
    const cell = document.createElement("div");
    cell.className = "tech-item";
    const k = document.createElement("span");
    k.className = "tech-key";
    k.textContent = key;
    const v = document.createElement("span");
    v.className = "tech-val";
    v.textContent = value;
    cell.append(k, v);
    grid.appendChild(cell);
  }
}

/**
 * Local history, as a trend plus a list.
 *
 * @param {Array<{ at: number, download: number, upload: number | null, ping: number, isp?: string | null }>} history
 * @param {(entry: object, previous: object | undefined) => number | null} deltaFor
 */
export function renderHistory(history, deltaFor) {
  const panel = qs("#historyPanel");
  const list = qs("#historyList");
  const trend = qs("#historyTrend");
  if (!panel || !list) return;

  panel.hidden = history.length === 0;
  if (!history.length) {
    list.textContent = "";
    if (trend) trend.textContent = "";
    return;
  }

  // Oldest on the left, so the bars read left to right like a timeline.
  if (trend) {
    const ordered = [...history].reverse();
    const peak = Math.max(1, ...ordered.map((entry) => entry.download || 0));
    trend.innerHTML = ordered
      .map((entry) => {
        const height = Math.max(6, ((entry.download || 0) / peak) * 100);
        return `<i style="height:${height.toFixed(1)}%"></i>`;
      })
      .join("");
  }

  list.innerHTML = history
    .map((entry, index) => {
      const delta = deltaFor(entry, history[index + 1]);
      const deltaLabel =
        delta === null
          ? "<span></span>"
          : `<span class="delta ${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(0)}%</span>`;
      const when = new Date(entry.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
      return `<div class="history-row">
        <span class="when">${escapeHtml(when)}</span>
        <span>${entry.download} Mbps down</span>
        <span>${entry.upload === null ? "upload n/a" : `${entry.upload} Mbps up`}</span>
        <span>${entry.ping === null || entry.ping === undefined ? "ping n/a" : `${entry.ping} ms`}</span>
        ${deltaLabel}
      </div>`;
    })
    .join("");
}

/** @param {string} value */
function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

/**
 * Reveal the report, one panel at a time.
 *
 * Staggered rather than simultaneous because six panels appearing at once reads
 * as a page reload; one after another reads as a report being written.
 */
export function revealReport() {
  const results = qs("#results");
  if (!results) return;
  results.hidden = false;
  const panels = qsa("#results .animate-panel");
  panels.forEach((panel, index) => {
    window.setTimeout(() => panel.classList.add("animate-in"), index * 70);
  });
}

/** Put the report back to its pre-run state. */
export function resetReport() {
  qsa("#results .animate-panel").forEach((panel) => panel.classList.remove("animate-in"));
  // A stale verdict beside blank figures is the worst of both: it claims
  // something about numbers that are no longer there.
  renderQuality(null);
  renderTechnical(null);
  const doctor = qs("#aiDoctorPanel");
  if (doctor) doctor.hidden = true;
  const bar = qs("#bloatBar");
  if (bar) bar.hidden = true;
  qsa(".suit").forEach((node) => {
    node.dataset.level = "unknown";
    const level = qs(".suit-level", node);
    const note = qs(".suit-note", node);
    if (level) level.textContent = "—";
    if (note) note.textContent = "";
  });
  qsa(".hop").forEach((node) => {
    node.dataset.flag = "unknown";
    const state = qs(".hop-state", node);
    if (state) state.textContent = "—";
  });
}

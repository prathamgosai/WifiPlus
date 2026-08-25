/**
 * Latency distribution chart.
 * -----------------------------------------------------------------------------
 * SVG rather than WebGL on purpose: this is thirty rectangles and two rules, it
 * needs crisp hairlines and real text, and it has to survive being printed and
 * read by a screen reader. WebGL would be slower to first paint and worse at all
 * three.
 *
 * The point of the chart is the SHAPE. An average latency of 28 ms means nothing
 * on its own — a link that is 28 ms every time and a link that is 12 ms most of
 * the time and 300 ms twice a minute both report 28. The second one is the one
 * that breaks calls, and the only way to see the difference is the tail. So the
 * p95 is a hard rule on the chart and everything beyond it is coloured as the
 * failure it represents.
 */

const NS = "http://www.w3.org/2000/svg";

const VIEW_W = 600;
const VIEW_H = 168;
const PAD_L = 8;
const PAD_R = 8;
const PAD_T = 26;
const BASE_Y = 138;

/** Below this there is no distribution to show, only a handful of readings. */
export const MIN_SAMPLES = 5;

/** @param {string} name @param {Record<string, string | number>} attrs */
function el(name, attrs) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/**
 * @param {number[]} sorted ascending
 * @param {number} p 0..100
 */
function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

/**
 * Render the distribution of a completed latency phase.
 *
 * @param {SVGSVGElement | null} svg
 * @param {{ samples: number[], ping: number | null, p95: number | null, min: number | null, max: number | null }} latency
 * @param {HTMLElement | null} [description] element to carry the text alternative
 */
export function renderLatencyChart(svg, latency, description = null) {
  if (!svg) return;
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const samples = (latency?.samples || []).filter((v) => Number.isFinite(v) && v >= 0);

  svg.appendChild(el("line", { class: "lc-axis", x1: PAD_L, y1: BASE_Y, x2: VIEW_W - PAD_R, y2: BASE_Y }));

  if (samples.length < MIN_SAMPLES) {
    const text = el("text", { class: "lc-empty", x: VIEW_W / 2, y: BASE_Y / 2 + 6 });
    text.textContent = "Not enough probes returned to plot a distribution.";
    svg.appendChild(text);
    if (description) description.textContent = "Not enough latency probes returned to plot a distribution.";
    return;
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const trueMax = sorted[sorted.length - 1];

  // The percentiles come from the ENGINE when it supplied them, not from a
  // second calculation here. Two implementations of "median" on the same panel
  // disagreed by 16 ms, and a chart that contradicts the table beneath it is
  // worse than no chart: the reader has no way to tell which one is lying.
  const finite = (v) => typeof v === "number" && Number.isFinite(v);
  const min = finite(latency?.min) ? latency.min : sorted[0];
  const p50 = finite(latency?.ping) ? latency.ping : percentile(sorted, 50);
  const p95 = finite(latency?.p95) ? latency.p95 : percentile(sorted, 95);

  // The very top of the range is usually one straggler. Clipping the axis just
  // past p95 keeps the detail where the samples actually are, and the outlier
  // is still counted — it lands in the final bucket.
  const axisMax = Math.max(percentile(sorted, 99), p95, min + 1);

  // One bucket per two samples, bounded. A fixed 34 buckets turns a six-probe
  // run into five lonely spikes in a field of white space, which reads as a
  // broken chart rather than a small sample.
  const BUCKETS = Math.max(8, Math.min(34, Math.round(sorted.length / 2) + 4));
  const span = Math.max(1e-6, axisMax - min);
  const counts = new Array(BUCKETS).fill(0);
  for (const value of sorted) {
    const raw = Math.floor(((value - min) / span) * BUCKETS);
    counts[Math.min(BUCKETS - 1, Math.max(0, raw))] += 1;
  }
  const peak = Math.max(1, ...counts);

  const innerW = VIEW_W - PAD_L - PAD_R;
  const bucketW = innerW / BUCKETS;
  const maxBarH = BASE_Y - PAD_T;

  /** Value → x, clamped so the p95 rule cannot leave the plot. */
  const xFor = (value) => PAD_L + ((Math.min(value, axisMax) - min) / span) * innerW;

  const group = el("g", {});
  for (let i = 0; i < BUCKETS; i += 1) {
    if (!counts[i]) continue;
    const height = Math.max(2, (counts[i] / peak) * maxBarH);
    // The bucket that CONTAINS p95 is part of the tail, not part of the body:
    // taking its start meant the bar holding the 95th percentile was coloured as
    // if it were typical.
    const bucketEnd = min + ((i + 1) / BUCKETS) * span;
    const bar = el("rect", {
      class: bucketEnd > p95 ? "lc-bar tail" : "lc-bar",
      x: (PAD_L + i * bucketW + 0.6).toFixed(2),
      y: (BASE_Y - height).toFixed(2),
      width: Math.max(1, bucketW - 1.2).toFixed(2),
      height: height.toFixed(2),
      rx: 1.5,
    });
    group.appendChild(bar);
  }
  svg.appendChild(group);

  const medianX = xFor(p50);
  svg.appendChild(el("line", { class: "lc-marker", x1: medianX, y1: PAD_T - 12, x2: medianX, y2: BASE_Y }));
  const medianLabel = el("text", {
    class: "lc-label",
    x: Math.min(VIEW_W - PAD_R - 60, Math.max(PAD_L, medianX + 5)),
    y: PAD_T - 15,
  });
  medianLabel.textContent = `median ${Math.round(p50)}ms`;
  svg.appendChild(medianLabel);

  const p95X = xFor(p95);
  svg.appendChild(el("line", { class: "lc-marker p95", x1: p95X, y1: PAD_T - 12, x2: p95X, y2: BASE_Y }));
  const p95Label = el("text", {
    class: "lc-label p95",
    x: Math.min(VIEW_W - PAD_R - 52, Math.max(PAD_L, p95X + 5)),
    y: PAD_T - 2,
  });
  p95Label.textContent = `p95 ${Math.round(p95)}ms`;
  svg.appendChild(p95Label);

  const lo = el("text", { class: "lc-label", x: PAD_L, y: BASE_Y + 18 });
  lo.textContent = `${Math.round(min)}ms`;
  svg.appendChild(lo);

  const hi = el("text", { class: "lc-label", x: VIEW_W - PAD_R, y: BASE_Y + 18, "text-anchor": "end" });
  hi.textContent =
    trueMax > axisMax
      ? `${Math.round(axisMax)}ms · max ${Math.round(trueMax)}ms`
      : `${Math.round(trueMax)}ms`;
  svg.appendChild(hi);

  if (description) {
    description.textContent =
      `Distribution of ${sorted.length} latency probes. Fastest ${Math.round(min)} milliseconds, ` +
      `median ${Math.round(p50)}, 95th percentile ${Math.round(p95)}, slowest ${Math.round(trueMax)}. ` +
      `Five percent of probes were slower than ${Math.round(p95)} milliseconds.`;
  }
}

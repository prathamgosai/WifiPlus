/**
 * Connection health presentation — bands, suitability and bottleneck reading.
 * -----------------------------------------------------------------------------
 * `scoring.js` owns the arithmetic: it turns a finished measurement into the six
 * sub-scores and the 0-100 health figure. This module owns what those numbers
 * MEAN to a person — which band a score falls in, whether the link is good
 * enough for a video call, and which hop the readings point at.
 *
 * It deliberately does not compute a second health score. Two scores derived
 * from the same run that disagree is worse than one score with no interpretation
 * at all, so everything here is a pure function of what `scoring.js` already
 * produced plus the raw result.
 *
 * Every threshold in this file is a declared constant rather than a literal
 * buried in a branch, because the interface promises the scoring is transparent
 * and deterministic — a claim that only holds if the numbers can be read.
 */

/**
 * @typedef {import("./scoring.js").SpeedResult} SpeedResult
 * @typedef {import("./measure.js").BufferbloatResult} BufferbloatResult
 */

/**
 * @typedef {"excellent" | "good" | "fair" | "poor" | "unknown"} Level
 */

/**
 * Health bands. `min` is inclusive and the list is ordered high to low, so the
 * first match wins.
 *
 * @type {ReadonlyArray<{ min: number, grade: string, verdict: string }>}
 */
export const HEALTH_BANDS = [
  {
    min: 90,
    grade: "Exceptional",
    verdict: "This connection handles everything a home or small office asks of it, with headroom to spare.",
  },
  {
    min: 78,
    grade: "Excellent",
    verdict: "A strong connection. Streaming, calls and games should all feel immediate.",
  },
  {
    min: 62,
    grade: "Good",
    verdict: "Solid for everyday use. One or two dimensions are holding it back from excellent.",
  },
  {
    min: 42,
    grade: "Fair",
    verdict: "Usable, but you will notice it under load — during calls, or when someone else is downloading.",
  },
  {
    min: 0,
    grade: "Poor",
    verdict:
      "This connection is struggling. The diagnostics below point at where the problem most likely is.",
  },
];

/**
 * @param {number | null} score
 * @returns {{ grade: string, verdict: string, tone: Level }}
 */
export function healthBand(score) {
  if (score === null || !Number.isFinite(score)) {
    return { grade: "—", verdict: "Run a test to generate a connection verdict.", tone: "unknown" };
  }
  // The last band has min 0, so `find` always matches for a finite score. The
  // fallback exists for the type, not for a case that can happen.
  const band = HEALTH_BANDS.find((entry) => score >= entry.min);
  const tone = score >= 78 ? "excellent" : score >= 62 ? "good" : score >= 42 ? "fair" : "poor";
  return {
    grade: band?.grade ?? "Poor",
    verdict:
      band?.verdict ??
      "This connection is struggling. The diagnostics below point at where the problem most likely is.",
    tone,
  };
}

/**
 * Suitability thresholds, stated once.
 *
 * These are the numbers the interface claims to grade against, so they live here
 * rather than inside the branches that read them. Sources are the ordinary
 * published requirements: ~25 Mbps for a 4K stream, ~3-5 Mbps up for HD video
 * calling, and the latency ranges competitive titles are playable in.
 */
export const SUITABILITY = /** @type {const} */ ({
  gaming: {
    excellent: { ping: 40, jitter: 10, loss: 0.5, loadedIncrease: 60 },
    good: { ping: 80, jitter: 20, loss: 2 },
    fair: { ping: 150, loss: 5 },
  },
  streaming: {
    excellent: { download: 50, stability: 82 },
    good: { download: 25 },
    fair: { download: 10 },
  },
  calls: {
    excellent: { upload: 5, jitter: 15, ping: 80, loss: 1 },
    good: { upload: 3, jitter: 30, loss: 3 },
    fair: { upload: 1.5 },
  },
  work: {
    excellent: { download: 50, upload: 10, ping: 60 },
    good: { download: 25, upload: 5, ping: 100 },
    fair: { download: 10 },
  },
});

/** @param {unknown} value @returns {value is number} */
const num = (value) => typeof value === "number" && Number.isFinite(value);

/**
 * How well this connection serves each of the four things people actually do
 * with one.
 *
 * A dimension whose deciding input could not be measured returns "unknown"
 * rather than a grade, because a verdict on video calls that never saw an upload
 * figure is a verdict on latency wearing the wrong label.
 *
 * @param {SpeedResult} result
 * @param {BufferbloatResult | null} [bufferbloat]
 * @returns {Array<{ key: string, level: Level, note: string }>}
 */
export function suitability(result, bufferbloat = null) {
  const { download, upload, ping, jitter, loss, stability } = result;
  const t = SUITABILITY;
  const added = bufferbloat ? bufferbloat.increase : null;

  /** @type {Array<{ key: string, level: Level, note: string }>} */
  const out = [];

  // ---- Gaming: latency-bound. Throughput plays no part — a gigabit line with
  // a 200 ms ping is still bad for games.
  if (!num(ping) || !num(jitter) || !num(loss)) {
    out.push({ key: "gaming", level: "unknown", note: "Latency could not be measured." });
  } else if (
    ping <= t.gaming.excellent.ping &&
    jitter <= t.gaming.excellent.jitter &&
    loss <= t.gaming.excellent.loss &&
    (added === null || added < t.gaming.excellent.loadedIncrease)
  ) {
    out.push({ key: "gaming", level: "excellent", note: `${Math.round(ping)} ms with a steady tail.` });
  } else if (ping <= t.gaming.good.ping && jitter <= t.gaming.good.jitter && loss <= t.gaming.good.loss) {
    out.push({ key: "gaming", level: "good", note: `${Math.round(ping)} ms. Fine outside ranked play.` });
  } else if (ping <= t.gaming.fair.ping && loss <= t.gaming.fair.loss) {
    out.push({ key: "gaming", level: "fair", note: "Playable, but you will feel the delay." });
  } else {
    out.push({ key: "gaming", level: "poor", note: "Latency or loss is too high for real-time play." });
  }

  // ---- 4K streaming: throughput-bound, against the ~25 Mbps a stream needs.
  if (!num(download)) {
    out.push({ key: "streaming", level: "unknown", note: "Download could not be measured." });
  } else if (
    download >= t.streaming.excellent.download &&
    (!num(stability) || stability >= t.streaming.excellent.stability)
  ) {
    out.push({ key: "streaming", level: "excellent", note: "Multiple 4K streams at once." });
  } else if (download >= t.streaming.good.download) {
    out.push({ key: "streaming", level: "good", note: "One 4K stream, comfortably." });
  } else if (download >= t.streaming.fair.download) {
    out.push({ key: "streaming", level: "fair", note: "HD is fine, 4K will buffer." });
  } else {
    out.push({ key: "streaming", level: "poor", note: "Below what SD streaming needs reliably." });
  }

  // ---- Video calls: upload matters, and consistency matters more than speed.
  if (!num(upload)) {
    out.push({ key: "calls", level: "unknown", note: "Upload could not be measured this run." });
  } else if (
    upload >= t.calls.excellent.upload &&
    num(jitter) &&
    jitter <= t.calls.excellent.jitter &&
    num(ping) &&
    ping <= t.calls.excellent.ping &&
    num(loss) &&
    loss <= t.calls.excellent.loss
  ) {
    out.push({ key: "calls", level: "excellent", note: `${upload.toFixed(1)} Mbps up, low jitter.` });
  } else if (
    upload >= t.calls.good.upload &&
    num(jitter) &&
    jitter <= t.calls.good.jitter &&
    num(loss) &&
    loss <= t.calls.good.loss
  ) {
    out.push({ key: "calls", level: "good", note: "HD calling should hold." });
  } else if (upload >= t.calls.fair.upload) {
    out.push({ key: "calls", level: "fair", note: "Expect the picture to drop under load." });
  } else {
    out.push({ key: "calls", level: "poor", note: "Not enough upstream for a stable call." });
  }

  // ---- Work from home: a blend, weighted toward not being interrupted.
  if (!num(download) || !num(upload)) {
    out.push({ key: "work", level: "unknown", note: "Needs both directions to judge." });
  } else if (
    download >= t.work.excellent.download &&
    upload >= t.work.excellent.upload &&
    num(ping) &&
    ping <= t.work.excellent.ping
  ) {
    out.push({ key: "work", level: "excellent", note: "Cloud apps, VPN and calls together." });
  } else if (
    download >= t.work.good.download &&
    upload >= t.work.good.upload &&
    num(ping) &&
    ping <= t.work.good.ping
  ) {
    out.push({ key: "work", level: "good", note: "Comfortable for a normal working day." });
  } else if (download >= t.work.fair.download) {
    out.push({ key: "work", level: "fair", note: "Large files and backups will drag." });
  } else {
    out.push({ key: "work", level: "poor", note: "Too slow to work from reliably." });
  }

  return out;
}

/**
 * Which hop the readings point at.
 *
 * This is an INTERPRETATION and the interface says so. A browser cannot trace a
 * route, read a WiFi radio or see inside a router, so every hop returns one of
 * three honest answers: consistent with a problem here, no sign of a problem
 * here, or nothing measured that can speak to it.
 *
 * @param {SpeedResult} result
 * @param {BufferbloatResult | null} bufferbloat
 * @param {{ degraded?: boolean, edgeLabel?: string | null, protocol?: string | null }} [context]
 * @returns {Array<{ hop: string, flag: "ok" | "suspect" | "unknown", note: string }>}
 */
export function bottleneck(result, bufferbloat, context = {}) {
  const { jitter, loss, ping, stability } = result;
  const grade = bufferbloat ? bufferbloat.grade : null;

  /** @type {Array<{ hop: string, flag: "ok" | "suspect" | "unknown", note: string }>} */
  const hops = [];

  // Device — the only hop this page can observe directly, and only in the
  // negative: a starved tab produces numbers that are about the CPU, not the link.
  hops.push(
    context.degraded
      ? { hop: "device", flag: "suspect", note: "This tab was starved mid-run" }
      : { hop: "device", flag: "ok", note: "Ran at full speed" },
  );

  // WiFi — inferred from the shape of the latency, never observed. Wireless
  // interference shows up as variance and probe loss long before it shows up as
  // a lower average.
  if (!num(jitter) || !num(loss)) {
    hops.push({ hop: "wifi", flag: "unknown", note: "Not enough probes" });
  } else if (jitter > 20 || loss > 1.5 || (num(stability) && stability < 70)) {
    hops.push({
      hop: "wifi",
      flag: "suspect",
      note: `Jitter ${jitter.toFixed(1)} ms, loss ${loss.toFixed(1)}%`,
    });
  } else {
    hops.push({ hop: "wifi", flag: "ok", note: `Jitter ${jitter.toFixed(1)} ms` });
  }

  // Router — bufferbloat is the one router-side fault a browser CAN measure,
  // because queueing delay is visible from the far end of the queue.
  if (!bufferbloat || !grade) {
    hops.push({ hop: "router", flag: "unknown", note: "Queueing not measurable" });
  } else if (["C", "D", "F"].includes(grade)) {
    hops.push({ hop: "router", flag: "suspect", note: `+${bufferbloat.increase} ms queueing (${grade})` });
  } else {
    hops.push({ hop: "router", flag: "ok", note: `Queue grade ${grade}` });
  }

  // ISP — baseline latency to the nearest edge is the closest proxy available.
  // It cannot separate the access network from transit, and does not claim to.
  if (!num(ping)) {
    hops.push({ hop: "isp", flag: "unknown", note: "Latency not measurable" });
  } else if (ping > 90 || (num(loss) && loss > 3)) {
    hops.push({ hop: "isp", flag: "suspect", note: `${Math.round(ping)} ms to the nearest edge` });
  } else {
    hops.push({ hop: "isp", flag: "ok", note: `${Math.round(ping)} ms to the nearest edge` });
  }

  // The edge is the reference point, not a suspect. Naming it matters because
  // the same link reads differently against an edge 5 ms away and one 200 ms away.
  hops.push({
    hop: "internet",
    flag: "ok",
    note: context.edgeLabel ? String(context.edgeLabel) : "Global edge",
  });

  return hops;
}

/**
 * The one-line diagnosis, and how much weight to put on it.
 *
 * Confidence is not a mood: it is high when the deciding metric was measured
 * directly (bufferbloat, probe loss), medium when the reading is consistent with
 * several causes, and low when the run is missing an input the verdict depends on.
 *
 * @param {SpeedResult} result
 * @param {BufferbloatResult | null} bufferbloat
 * @returns {{ confidence: "High" | "Medium" | "Low" }}
 */
export function diagnosisConfidence(result, bufferbloat) {
  const measured = [result.download, result.ping, result.jitter, result.loss].filter(num).length;
  if (measured < 3) return { confidence: "Low" };
  if (bufferbloat && num(result.upload)) return { confidence: "High" };
  return { confidence: "Medium" };
}

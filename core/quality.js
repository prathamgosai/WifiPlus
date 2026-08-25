/**
 * Measurement validation and confidence.
 * -----------------------------------------------------------------------------
 * Every other module in `core/` answers "what is the number". This one answers
 * "should the number be shown at all, and how much weight does it carry".
 *
 * It exists because arithmetic honesty is not the same as trustworthiness. Every
 * figure this engine has ever produced was arithmetically honest — bytes over
 * time, no invention anywhere — and a run taken in a backgrounded tab, or
 * against an endpoint that failed over halfway through, or from four latency
 * probes, was just as arithmetically honest as a clean one and meant far less.
 * A result that cannot say which of those it is has not finished reporting.
 *
 * Two independent judgements are produced, and they are not the same thing:
 *
 *   RECONCILIATION  Does the headline figure survive being recomputed a
 *                   different way? Each throughput phase reports both a
 *                   statistical rate and a flat bytes-over-time rate. They are
 *                   not expected to be equal — the statistical one deliberately
 *                   excludes the ramp — but a large gap means one of them is
 *                   describing something other than the link.
 *
 *   SUFFICIENCY     Were there enough samples for the statistics to mean
 *                   anything, and did the run happen under conditions that
 *                   allow the reading to stand?
 *
 * Nothing here can improve a measurement. It can only refuse to overstate one.
 */

import { MIN_BUCKETS, MIN_LOADED_PROBES, PING_MIN_SAMPLES } from "./measure.js";

/**
 * @typedef {import("./measure.js").ThroughputResult} ThroughputResult
 */

/**
 * How far the statistical figure may sit from the flat bytes-over-time figure
 * before the result is flagged.
 *
 * Not an arbitrary round number. The two differ for a structural reason: the
 * flat rate includes the congestion-window ramp and the trimmed mean excludes
 * it, so on a link that reaches steady state in half a second inside a six
 * second window, the flat rate is mechanically lower by roughly the ramp's share
 * of the window. Measured across runs on links from 9 to 490 Mbps that gap sat
 * between 4% and 22%. The threshold is set beyond the top of that range: inside
 * it, the difference is the warm-up doing its job; outside it, the two
 * calculations are describing different things and the run should say so rather
 * than pick one.
 */
export const RECONCILE_TOLERANCE = 0.35;

/** @typedef {"high" | "medium" | "low"} QualityLevel */
/** @typedef {"verified" | "partial" | "incomplete"} Verdict */

/**
 * Check one throughput phase against its own evidence.
 *
 * @param {ThroughputResult | null} result
 * @param {string} label "download" | "upload"
 * @returns {{ ok: boolean, issues: string[], reconcileDelta: number | null }}
 */
export function validateThroughput(result, label) {
  /** @type {string[]} */
  const issues = [];
  if (!result) return { ok: false, issues: [`${label} did not complete`], reconcileDelta: null };

  const { mbps, bytes, elapsedMs, measuredBytes, measuredMs, samples } = result;

  // The impossible-value gate. These cannot happen if the phase behaved, which
  // is exactly why they are worth asserting: each one has been produced at some
  // point by a division whose denominator collapsed.
  if (!Number.isFinite(mbps) || mbps < 0) issues.push(`${label} produced a non-finite rate`);
  if (!(bytes > 0)) issues.push(`${label} moved no bytes`);
  if (!(elapsedMs > 0)) issues.push(`${label} had no duration`);
  if (!(measuredMs > 0)) issues.push(`${label} measured window was empty`);
  if (measuredBytes > bytes) issues.push(`${label} measured more bytes than it counted`);
  if (measuredMs > elapsedMs + 1) issues.push(`${label} measured window outlasted the phase`);

  // Sample sufficiency. Below this the aggregation is a mean of too few things
  // to describe a distribution, and the figure should not be presented as a
  // sustained rate.
  if (samples.length < MIN_BUCKETS) {
    issues.push(`${label} produced ${samples.length} samples, fewer than the ${MIN_BUCKETS} needed to trim`);
  }

  // Something on the path inflated the payload, so the byte counter measured a
  // decompressor rather than a link. Stated rather than silently corrected:
  // there is no honest way to recover the wire bytes after the fact.
  if (typeof result.inflatedResponses === "number" && result.inflatedResponses > 0) {
    issues.push(
      `${label} received more data than the server said it sent — something between here and the edge is compressing the test payload, so this figure is not a wire measurement`,
    );
  }

  // Reconciliation. Recomputing the headline a second, simpler way is the only
  // check here that could catch a bug in the aggregation itself.
  let reconcileDelta = null;
  const reference = result.reconciliationMbps;
  if (Number.isFinite(reference) && reference > 0 && Number.isFinite(mbps)) {
    reconcileDelta = Math.abs(mbps - reference) / reference;
    if (reconcileDelta > RECONCILE_TOLERANCE) {
      issues.push(
        `${label} statistical rate (${mbps.toFixed(1)} Mbps) and whole-phase rate ` +
          `(${reference.toFixed(1)} Mbps) differ by ${Math.round(reconcileDelta * 100)}%`,
      );
    }
  }

  return { ok: issues.length === 0, issues, reconcileDelta };
}

/**
 * @typedef {object} QualityInput
 * @property {ThroughputResult | null} download
 * @property {ThroughputResult | null} upload
 * @property {number} latencySamples probes that returned
 * @property {number} loadedProbes probes that returned under load
 * @property {boolean} completed the run reached its end
 * @property {boolean} [hiddenDuringRun] the tab was backgrounded mid-measurement
 * @property {boolean} [endpointChanged] a phase failed over to another edge
 * @property {boolean} [wentOffline]
 * @property {number} [serverLoad] normalised load of the edge, when it reports one
 */

/**
 * @typedef {object} QualityReport
 * @property {QualityLevel} level
 * @property {Verdict} verdict
 * @property {string[]} reasons Every check that did not pass, in plain language.
 * @property {string[]} passed Every check that did.
 * @property {Record<string, number | null>} reconcile Per-phase delta, 0-1.
 */

/**
 * Grade a finished run.
 *
 * The grade is deliberately hard to earn and easy to lose. A speed test that
 * says "high confidence" on a run it cannot vouch for has spent the only thing
 * it had; one that says "medium" slightly too often has cost nobody anything.
 *
 * @param {QualityInput} input
 * @returns {QualityReport}
 */
export function measurementQuality(input) {
  /** @type {string[]} */
  const reasons = [];
  /** @type {string[]} */
  const passed = [];

  const down = validateThroughput(input.download, "download");
  const up = input.upload ? validateThroughput(input.upload, "upload") : null;

  if (down.ok) passed.push("Download reconciled against total bytes");
  else reasons.push(...down.issues);

  if (!input.upload) {
    // Not a failure of the run — one metric is simply absent, and the verdict
    // has to reflect that without condemning the seven that are present.
    reasons.push("Upload could not be measured");
  } else if (up && up.ok) {
    passed.push("Upload reconciled against acknowledged bytes");
  } else if (up) {
    reasons.push(...up.issues);
  }

  if (input.latencySamples >= PING_MIN_SAMPLES) {
    passed.push(`${input.latencySamples} latency probes returned`);
  } else {
    reasons.push(
      `Only ${input.latencySamples} latency probes returned, fewer than the ${PING_MIN_SAMPLES} needed for a distribution`,
    );
  }

  if (input.loadedProbes >= MIN_LOADED_PROBES) {
    passed.push(`${input.loadedProbes} probes landed under load`);
  } else {
    reasons.push(`Too few probes landed under load to grade queueing`);
  }

  // Conditions that invalidate an otherwise clean run. These are not statistical
  // — they are facts about the environment the numbers were taken in, and any
  // one of them caps the grade regardless of how good the arithmetic looks.
  let capped = false;
  if (input.hiddenDuringRun) {
    reasons.push(
      "This tab was backgrounded during measurement, where the browser throttles timers and network",
    );
    capped = true;
  }
  if (input.wentOffline) {
    reasons.push("The device lost its connection during the run");
    capped = true;
  }
  if (input.endpointChanged) {
    reasons.push(
      "A phase failed over to a different measurement edge, so not every figure was taken against the same server",
    );
    capped = true;
  }
  if (typeof input.serverLoad === "number" && input.serverLoad > 0.85) {
    reasons.push(
      `The measurement server was under load (${input.serverLoad.toFixed(2)}), which can limit throughput before your connection does`,
    );
    capped = true;
  }

  /** @type {Verdict} */
  let verdict;
  /** @type {QualityLevel} */
  let level;

  if (!input.completed || !down.ok) {
    verdict = "incomplete";
    level = "low";
  } else if (reasons.length === 0) {
    verdict = "verified";
    level = "high";
  } else {
    verdict = "partial";
    // One soft shortfall on an otherwise complete run is still a usable
    // measurement; an environmental cap or several shortfalls is not.
    level = capped || reasons.length > 1 ? "low" : "medium";
  }

  return {
    level,
    verdict,
    reasons,
    passed,
    reconcile: { download: down.reconcileDelta, upload: up ? up.reconcileDelta : null },
  };
}

/**
 * Human-readable label for a verdict. Kept beside the logic so the words and the
 * thresholds cannot drift apart.
 *
 * @param {Verdict} verdict
 * @returns {{ label: string, detail: string }}
 */
export function verdictLabel(verdict) {
  if (verdict === "verified") {
    return {
      label: "Verified",
      detail:
        "Every figure reconciled against the bytes and probes behind it, and the run completed under conditions that allow the reading to stand.",
    };
  }
  if (verdict === "partial") {
    return {
      label: "Partial",
      detail:
        "The run completed and the figures shown are real, but at least one check did not pass — the details below say which.",
    };
  }
  return {
    label: "Incomplete",
    detail:
      "The run did not produce a measurement that can be relied on. Nothing here should be read as your connection speed.",
  };
}

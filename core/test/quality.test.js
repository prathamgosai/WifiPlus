/**
 * Validation and confidence.
 *
 * The point of these tests is not that the arithmetic is right — there is barely
 * any arithmetic. It is that the grade is HARD TO EARN. A speed test that says
 * "verified" on a run it cannot vouch for has spent the only thing it had, so
 * every path that should downgrade a result is pinned here individually.
 */
import { describe, expect, it } from "vitest";
import { RECONCILE_TOLERANCE, measurementQuality, validateThroughput, verdictLabel } from "../quality.js";
import { MIN_BUCKETS, MIN_LOADED_PROBES, PING_MIN_SAMPLES } from "../measure.js";

/** A clean throughput phase. */
const good = (over = {}) => ({
  mbps: 100,
  bytes: 75_000_000,
  elapsedMs: 6000,
  measuredBytes: 68_750_000,
  measuredMs: 5500,
  samples: Array.from({ length: MIN_BUCKETS + 10 }, () => 100),
  streams: 8,
  method: "trimmed-mean",
  reconciliationMbps: 100,
  warmupMs: 500,
  ...over,
});

const cleanRun = (over = {}) => ({
  download: good(),
  upload: good({ method: "confirmed-bytes" }),
  latencySamples: PING_MIN_SAMPLES + 4,
  loadedProbes: MIN_LOADED_PROBES + 5,
  completed: true,
  ...over,
});

describe("validateThroughput", () => {
  it("passes a phase whose figure reconciles with its own evidence", () => {
    const v = validateThroughput(good(), "download");
    expect(v.ok).toBe(true);
    expect(v.issues).toEqual([]);
    expect(v.reconcileDelta).toBeCloseTo(0, 5);
  });

  it("refuses a phase that did not run", () => {
    const v = validateThroughput(null, "upload");
    expect(v.ok).toBe(false);
    expect(v.issues[0]).toMatch(/did not complete/);
  });

  it("catches every way a division can collapse", () => {
    // Each of these has been produced at some point by a denominator going to
    // zero, which is exactly why they are asserted rather than assumed away.
    expect(validateThroughput(good({ mbps: Infinity }), "download").ok).toBe(false);
    expect(validateThroughput(good({ mbps: NaN }), "download").ok).toBe(false);
    expect(validateThroughput(good({ mbps: -5 }), "download").ok).toBe(false);
    expect(validateThroughput(good({ bytes: 0 }), "download").ok).toBe(false);
    expect(validateThroughput(good({ elapsedMs: 0 }), "download").ok).toBe(false);
    expect(validateThroughput(good({ measuredMs: 0 }), "download").ok).toBe(false);
  });

  it("catches evidence that contradicts itself", () => {
    // More bytes measured than counted, or a window longer than the phase that
    // contained it, means the bookkeeping is wrong somewhere upstream.
    expect(validateThroughput(good({ measuredBytes: 999_000_000 }), "download").ok).toBe(false);
    expect(validateThroughput(good({ measuredMs: 99_000 }), "download").ok).toBe(false);
  });

  it("flags a figure that disagrees with recomputing it a different way", () => {
    // The whole point of carrying a second, independently computed rate.
    const drifted = good({ mbps: 100, reconciliationMbps: 40 });
    const v = validateThroughput(drifted, "download");
    expect(v.ok).toBe(false);
    expect(v.issues.join(" ")).toMatch(/differ by/);
    expect(v.reconcileDelta).toBeGreaterThan(RECONCILE_TOLERANCE);
  });

  it("tolerates the gap the warm-up is supposed to create", () => {
    // The trimmed mean excludes the congestion-window ramp and the flat rate
    // does not, so they differ by construction. Flagging that would fire on
    // every healthy run and teach a reader to ignore the flag.
    const v = validateThroughput(good({ mbps: 100, reconciliationMbps: 85 }), "download");
    expect(v.ok).toBe(true);
  });

  it("will not call a handful of samples a sustained rate", () => {
    const thin = good({ samples: Array.from({ length: MIN_BUCKETS - 1 }, () => 100) });
    const v = validateThroughput(thin, "download");
    expect(v.ok).toBe(false);
    expect(v.issues.join(" ")).toMatch(/fewer than/);
  });
});

describe("measurementQuality", () => {
  it("grades a clean run verified and high", () => {
    const q = measurementQuality(cleanRun());
    expect(q.verdict).toBe("verified");
    expect(q.level).toBe("high");
    expect(q.reasons).toEqual([]);
    expect(q.passed.length).toBeGreaterThan(0);
  });

  it("never says verified when the run did not finish", () => {
    expect(measurementQuality(cleanRun({ completed: false })).verdict).toBe("incomplete");
  });

  it("never says verified when the download did not reconcile", () => {
    const q = measurementQuality(cleanRun({ download: good({ mbps: 100, reconciliationMbps: 20 }) }));
    expect(q.verdict).toBe("incomplete");
    expect(q.level).toBe("low");
  });

  it("reports partial rather than incomplete when only the upload is missing", () => {
    // One absent metric is not grounds to condemn the seven that are present.
    const q = measurementQuality(cleanRun({ upload: null }));
    expect(q.verdict).toBe("partial");
    expect(q.reasons.join(" ")).toMatch(/Upload could not be measured/);
  });

  it("caps the grade when the tab was backgrounded, however good the numbers look", () => {
    // A browser throttles timers and can throttle network in a hidden tab. The
    // arithmetic is untouched; what it describes is the throttling policy.
    const q = measurementQuality(cleanRun({ hiddenDuringRun: true }));
    expect(q.verdict).toBe("partial");
    expect(q.level).toBe("low");
    expect(q.reasons.join(" ")).toMatch(/backgrounded/);
  });

  it("caps the grade when the device dropped off the network", () => {
    const q = measurementQuality(cleanRun({ wentOffline: true }));
    expect(q.level).toBe("low");
  });

  it("caps the grade when phases ran against different servers", () => {
    // Download from one edge and upload from another is not one measurement of
    // one path, and the result should not be read as though it were.
    const q = measurementQuality(cleanRun({ endpointChanged: true }));
    expect(q.level).toBe("low");
    expect(q.reasons.join(" ")).toMatch(/different measurement edge/);
  });

  it("says so when the measurement server was itself under load", () => {
    // The failure this exists for: reporting a saturated server's capacity as
    // the user's connection speed.
    const q = measurementQuality(cleanRun({ serverLoad: 0.95 }));
    expect(q.level).toBe("low");
    expect(q.reasons.join(" ")).toMatch(/measurement server was under load/);
  });

  it("does not penalise a healthy server", () => {
    expect(measurementQuality(cleanRun({ serverLoad: 0.2 })).verdict).toBe("verified");
  });

  it("downgrades to medium for a single soft shortfall, not to low", () => {
    // Too few probes under load is worth saying and not worth condemning a run
    // over. A grade that collapses to "low" on any imperfection stops carrying
    // information.
    const q = measurementQuality(cleanRun({ loadedProbes: 2 }));
    expect(q.verdict).toBe("partial");
    expect(q.level).toBe("medium");
  });

  it("reports the reconciliation deltas it judged on", () => {
    const q = measurementQuality(cleanRun());
    expect(q.reconcile.download).toBeCloseTo(0, 5);
    expect(q.reconcile.upload).toBeCloseTo(0, 5);
  });

  it("is deterministic", () => {
    expect(measurementQuality(cleanRun())).toEqual(measurementQuality(cleanRun()));
  });
});

describe("verdictLabel", () => {
  it("gives every verdict a label and an explanation", () => {
    for (const v of /** @type {const} */ (["verified", "partial", "incomplete"])) {
      const { label, detail } = verdictLabel(v);
      expect(label).toBeTruthy();
      expect(detail.length).toBeGreaterThan(30);
    }
  });

  it("does not let 'incomplete' read like a result", () => {
    expect(verdictLabel("incomplete").detail).toMatch(
      /should be read as your connection speed|not be relied on/i,
    );
  });
});

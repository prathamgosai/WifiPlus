/**
 * The measurement math IS the product — a wrong percentile or a mis-ordered
 * jitter calculation is invisible in the UI but makes every reported number a
 * lie. These tests pin the statistics; network I/O is exercised separately.
 */
import { describe, expect, it } from "vitest";
import {
  MIN_SAMPLE_MS,
  bpsToMbps,
  bufferbloatFrom,
  gradeBufferbloat,
  MIN_LOADED_PROBES,
  percentile,
  stabilityFrom,
} from "../measure.js";

describe("percentile", () => {
  it("returns 0 for an empty sample set rather than NaN", () => {
    expect(percentile([], 95)).toBe(0);
  });

  it("interpolates between ranks, the way NumPy and Excel define a percentile", () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(sorted, 0)).toBe(1);
    // The median of 1..10 is 5.5. The old index-based version answered 6,
    // because it picked an element rather than interpolating between two.
    expect(percentile(sorted, 50)).toBe(5.5);
    expect(percentile(sorted, 100)).toBe(10);
  });

  it("does not simply return the maximum, which is a separate statistic", () => {
    // The old floor(p/100 * n) index landed on the last element for every
    // sample count this engine produces, so the p95 and Max columns of the
    // latency panel always showed the same number and one was pure noise.
    const sorted = Array.from({ length: 19 }, (_, i) => 10 + i * 5).concat([900]).sort((a, b) => a - b);
    const p95 = percentile(sorted, 95);
    expect(p95).toBeLessThan(sorted[sorted.length - 1] ?? 0);
    expect(p95).toBeGreaterThan(percentile(sorted, 50));
  });

  it("reports the tail a user feels, well above the median", () => {
    // A genuinely unstable link: mostly fast, with a real spread of slow probes
    // rather than one freak outlier. The median stays flattering; p95 does not.
    const samples = [...Array(15).fill(12), 180, 220, 260, 310, 380].sort((a, b) => a - b);
    const median = percentile(samples, 50);
    const p95 = percentile(samples, 95);

    expect(median).toBe(12);
    expect(p95).toBeGreaterThan(250);
    expect(p95).toBeLessThanOrEqual(380);
  });
});

describe("bpsToMbps", () => {
  it("converts bytes over a window into megabits per second", () => {
    // 12.5 MB in 1s = 100 Mbps.
    expect(bpsToMbps(12_500_000, 1000)).toBe(100);
  });
});

describe("gradeBufferbloat", () => {
  it("grades on the documented boundaries", () => {
    // Bands are on latency ADDED under load, set where behaviour changes: under
    // 30ms a call stays smooth, past 300ms it breaks.
    expect(gradeBufferbloat(0)).toBe("A");
    expect(gradeBufferbloat(29)).toBe("A");
    expect(gradeBufferbloat(30)).toBe("B");
    expect(gradeBufferbloat(74)).toBe("B");
    expect(gradeBufferbloat(75)).toBe("C");
    expect(gradeBufferbloat(149)).toBe("C");
    expect(gradeBufferbloat(150)).toBe("D");
    expect(gradeBufferbloat(299)).toBe("D");
    expect(gradeBufferbloat(300)).toBe("F");
    expect(gradeBufferbloat(5000)).toBe("F");
  });
});

describe("bufferbloatFrom", () => {
  /** A run's worth of loaded probes, so p95 is a percentile and not the max. */
  /** @param {number} ms @param {number} [count] @returns {number[]} */
  const steady = (ms, count = 20) => Array.from({ length: count }, () => ms);

  it("grades on the tail under load, which is what a call actually hits", () => {
    // Mostly fine, with a real spread of slow probes. The median flatters this
    // link; the p95 is the queue delay a packet meets when it matters.
    const probes = [...steady(22, 15), 180, 210, 240, 260, 300];
    const bloat = bufferbloatFrom(20, probes);
    expect(bloat?.loaded).toBeGreaterThan(200);
    expect(bloat?.increase).toBeGreaterThan(180);
    expect(bloat?.grade).toBe("D");
  });

  it("does not let one freak stall decide the grade", () => {
    // The reason MIN_LOADED_PROBES is ten: p95 of a handful of samples IS the
    // maximum, so a single outlier would set the grade outright.
    //
    // A real phase collects roughly sixty probes, where one stall sits beyond
    // the 95th rank and moves the grade not at all.
    const realistic = bufferbloatFrom(20, [...steady(22, 59), 800]);
    expect(realistic?.grade).toBe("A");

    // At the ten-probe floor a single stall still cannot dominate: p95
    // interpolates a small fraction of its excess rather than absorbing it
    // whole, so the grade shifts by a band instead of jumping to F.
    const sparse = bufferbloatFrom(20, [...steady(22, 19), 800]);
    expect(sparse?.grade).toBe("B");
    expect(sparse?.increase ?? 0).toBeLessThan(100);
  });

  it("never reports a negative increase when the loaded probes come back faster", () => {
    const bloat = bufferbloatFrom(50, steady(30));
    expect(bloat?.increase).toBe(0);
    expect(bloat?.grade).toBe("A");
  });

  it("grades a saturated link honestly", () => {
    const bloat = bufferbloatFrom(18, steady(250));
    expect(bloat?.increase).toBe(232);
    expect(bloat?.grade).toBe("D");
  });

  it("refuses to grade when too few probes landed", () => {
    // On HTTP/1.1 the download streams can starve the probe of a socket, so the
    // handful that return are measuring the browser's connection queue. Grading
    // that produced readings like "+35534 ms, grade F" — a fact about Chrome,
    // not about the user's router.
    expect(bufferbloatFrom(35, [])).toBeNull();
    expect(bufferbloatFrom(71, [35605])).toBeNull();
    expect(bufferbloatFrom(71, steady(300, MIN_LOADED_PROBES - 1))).toBeNull();
  });

  it("grades once the minimum number of probes is met", () => {
    expect(bufferbloatFrom(20, steady(25, MIN_LOADED_PROBES))).not.toBeNull();
  });
});

describe("throughput sampling guard", () => {
  it("MIN_SAMPLE_MS is wide enough that a chunk cannot fabricate a gigabit", () => {
    // The failure mode: right after the warm-up cutoff the byte counter is
    // rebased and only a few ms have passed, so one burst divided by that window
    // reported thousands of Mbps. Eight streams of 256 KB over 3ms:
    const bogus = bpsToMbps(8 * 256_000, 3);
    expect(bogus).toBeGreaterThan(5000); // what used to reach the screen

    // Over the enforced minimum window the same burst reads sanely.
    const honest = bpsToMbps(8 * 256_000, MIN_SAMPLE_MS);
    expect(honest).toBeLessThan(100);
  });
});

describe("stabilityFrom", () => {
  // stability = 100 − min(40, CV(mbps)×100) − min(30, (jitter/ping)×100)
  //                 − min(30, loss%×4),  clamped 0…100
  const steadyThroughput = [100, 100, 100, 100, 100, 100];

  it("scores a steady link 100", () => {
    expect(stabilityFrom([20, 20, 20, 20], 0, 0, steadyThroughput)).toBe(100);
  });

  it("penalises throughput that swings, which the old formula ignored entirely", () => {
    // Identical latency, identical jitter, identical loss — only the throughput
    // differs. The previous model read none of this and scored both 100, on a
    // tile sitting beside Download that users read as "is my speed steady".
    const steady = stabilityFrom([20, 20, 20, 20], 0, 0, [100, 100, 100, 100]);
    const swinging = stabilityFrom([20, 20, 20, 20], 0, 0, [10, 190, 20, 180]);
    expect(steady).toBe(100);
    expect(swinging ?? 100).toBeLessThan(70);
  });

  it("judges jitter against the ping it sits on, not in absolute ms", () => {
    // 20ms of jitter is unremarkable on a 200ms satellite link and terrible on
    // a 5ms fibre one, so the penalty is a ratio.
    const satellite = stabilityFrom([600, 600, 600], 20, 0, steadyThroughput);
    const fibre = stabilityFrom([5, 5, 5], 20, 0, steadyThroughput);
    expect(satellite ?? 0).toBeGreaterThan(fibre ?? 100);
  });

  it("keeps discriminating at the bad end instead of collapsing to zero", () => {
    // A jittery-but-working mobile link must not score the same as a dead one.
    const jittery = stabilityFrom([40, 120, 60, 300], 90, 0, [8, 12, 9, 11]);
    const dead = stabilityFrom([900, 900, 900], 400, 60, [0.2, 3, 0.1, 2.5]);
    expect(jittery ?? 0).toBeGreaterThan(10);
    expect(jittery ?? 0).toBeGreaterThan(dead ?? 100);
  });

  it("never leaves the 0-100 range", () => {
    const awful = stabilityFrom([900, 100, 2000], 900, 100, [0.1, 40, 0.2, 35]);
    expect(awful).toBeGreaterThanOrEqual(0);
    expect(awful).toBeLessThanOrEqual(100);
  });

  it("returns null when jitter is unknown, rather than scoring a guess", () => {
    // One probe cannot express variation between probes. Defaulting to zero
    // would announce a flawless connection on the strength of a single sample.
    expect(stabilityFrom([20], null, 0, steadyThroughput)).toBeNull();
    expect(stabilityFrom([], 5, 0, steadyThroughput)).toBeNull();
  });

  it("costs nothing when throughput samples are absent", () => {
    // An unmeasured dimension must not be penalised blindly.
    expect(stabilityFrom([20, 20, 20], 0, 0, [])).toBe(100);
  });
});


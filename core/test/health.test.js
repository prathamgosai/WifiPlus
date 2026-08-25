/**
 * Health bands, suitability and the bottleneck reading.
 *
 * These functions are the ones that turn numbers into WORDS on the result page —
 * "Excellent for gaming", "the router is queueing" — which makes them the place
 * a wrong answer does the most damage: a reader who does not check the figures
 * still reads the verdict. So the tests here are less about arithmetic and more
 * about the two promises the interface makes: an unmeasured input never produces
 * a confident verdict, and the same measurement always produces the same one.
 */
import { describe, expect, it } from "vitest";
import { HEALTH_BANDS, bottleneck, diagnosisConfidence, healthBand, suitability } from "../health.js";

/** A clean fibre link. */
const GOOD = { download: 480, upload: 92, ping: 12, jitter: 2.4, loss: 0, dns: 18, stability: 96 };
/** A congested one. */
const BAD = { download: 6, upload: 1.1, ping: 210, jitter: 90, loss: 7, dns: 180, stability: 30 };

describe("healthBand", () => {
  it("is total: every score from 0 to 100 lands in a band", () => {
    for (let score = 0; score <= 100; score += 1) {
      const band = healthBand(score);
      expect(band.grade).toBeTruthy();
      expect(band.verdict).toBeTruthy();
      expect(["excellent", "good", "fair", "poor"]).toContain(band.tone);
    }
  });

  it("never grades a run that produced no score", () => {
    // The card and the ring both read from this. Returning a band for null would
    // print "Poor" over an em dash.
    for (const value of [null, undefined, NaN, Infinity]) {
      expect(healthBand(/** @type {any} */ (value)).tone).toBe("unknown");
    }
  });

  it("is monotonic — a better score never gets a worse band", () => {
    /** @type {Record<string, number>} */
    const rank = { poor: 0, fair: 1, good: 2, excellent: 3, unknown: -1 };
    let previous = -1;
    for (let score = 0; score <= 100; score += 1) {
      const tone = rank[healthBand(score).tone] ?? -1;
      expect(tone).toBeGreaterThanOrEqual(previous);
      previous = tone;
    }
  });

  it("declares its bands in descending order, so the first match is the right one", () => {
    for (let i = 1; i < HEALTH_BANDS.length; i += 1) {
      expect(HEALTH_BANDS[i]?.min).toBeLessThan(Number(HEALTH_BANDS[i - 1]?.min));
    }
    expect(HEALTH_BANDS.at(-1)?.min).toBe(0);
  });
});

describe("suitability", () => {
  it("grades all four use cases from one measurement", () => {
    const verdicts = suitability(GOOD, { idle: 12, loaded: 20, increase: 8, grade: "A", basis: /** @type {const} */ ("p95"), probes: 30 });
    expect(verdicts.map((v) => v.key)).toEqual(["gaming", "streaming", "calls", "work"]);
    for (const verdict of verdicts) {
      expect(verdict.level).toBe("excellent");
      expect(verdict.note).toBeTruthy();
    }
  });

  it("separates a good connection from a bad one on every dimension", () => {
    const good = suitability(GOOD, null);
    const bad = suitability(BAD, null);
    for (let i = 0; i < good.length; i += 1) {
      expect(good[i]?.level).toBe("excellent");
      expect(["fair", "poor"]).toContain(bad[i]?.level);
    }
  });

  it("says unknown rather than guessing when the deciding input is missing", () => {
    // A verdict on video calls that never saw an upload figure is a verdict on
    // latency wearing the wrong label.
    const noUpload = suitability({ ...GOOD, upload: null }, null);
    expect(noUpload.find((v) => v.key === "calls")?.level).toBe("unknown");
    expect(noUpload.find((v) => v.key === "work")?.level).toBe("unknown");
    // The dimensions that do not depend on upload are still answered.
    expect(noUpload.find((v) => v.key === "gaming")?.level).toBe("excellent");
    expect(noUpload.find((v) => v.key === "streaming")?.level).toBe("excellent");

    const nothing = suitability(
      { download: null, upload: null, ping: null, jitter: null, loss: null, dns: null, stability: null },
      null,
    );
    expect(nothing.every((v) => v.level === "unknown")).toBe(true);
  });

  it("lets severe queueing under load pull gaming off excellent", () => {
    // The link is fast and low-latency at rest and still unusable for a game the
    // moment anyone else on it downloads. A verdict that ignored load would call
    // this excellent.
    const bloated = suitability(GOOD, { idle: 12, loaded: 400, increase: 388, grade: "F", basis: /** @type {const} */ ("p95"), probes: 30 });
    expect(bloated.find((v) => v.key === "gaming")?.level).not.toBe("excellent");
  });

  it("is deterministic", () => {
    expect(suitability(GOOD, null)).toEqual(suitability(GOOD, null));
  });
});

describe("bottleneck", () => {
  it("returns one reading per hop, in path order", () => {
    const hops = bottleneck(GOOD, null, {});
    expect(hops.map((h) => h.hop)).toEqual(["device", "wifi", "router", "isp", "internet"]);
  });

  it("flags nothing on a clean link", () => {
    const hops = bottleneck(GOOD, { idle: 12, loaded: 20, increase: 8, grade: "A", basis: /** @type {const} */ ("p95"), probes: 30 }, {});
    expect(hops.some((h) => h.flag === "suspect")).toBe(false);
  });

  it("points at the router when the queue is the problem, not at the line", () => {
    // Full speed, low idle latency, and 400 ms of queueing under load. The fault
    // is the router; a reading that blamed the ISP would send someone to buy a
    // faster plan that changes nothing.
    const hops = bottleneck(GOOD, { idle: 12, loaded: 412, increase: 400, grade: "F", basis: /** @type {const} */ ("p95"), probes: 30 }, {});
    const by = Object.fromEntries(hops.map((h) => [h.hop, h.flag]));
    expect(by.router).toBe("suspect");
    expect(by.isp).toBe("ok");
    expect(by.wifi).toBe("ok");
  });

  it("points at the wireless hop when the latency is unstable rather than slow", () => {
    const hops = bottleneck({ ...GOOD, jitter: 48, loss: 3 }, null, {});
    expect(hops.find((h) => h.hop === "wifi")?.flag).toBe("suspect");
  });

  it("says unknown rather than ok when there is nothing to judge on", () => {
    const hops = bottleneck(
      { download: null, upload: null, ping: null, jitter: null, loss: null, dns: null, stability: null },
      null,
      {},
    );
    const by = Object.fromEntries(hops.map((h) => [h.hop, h.flag]));
    expect(by.wifi).toBe("unknown");
    expect(by.router).toBe("unknown");
    expect(by.isp).toBe("unknown");
  });

  it("blames the measurement, not the network, when the tab was starved", () => {
    const hops = bottleneck(GOOD, null, { degraded: true });
    expect(hops.find((h) => h.hop === "device")?.flag).toBe("suspect");
  });
});

describe("diagnosisConfidence", () => {
  it("is high only when the load-bearing metrics were all measured", () => {
    expect(diagnosisConfidence(GOOD, { idle: 12, loaded: 20, increase: 8, grade: "A", basis: /** @type {const} */ ("p95"), probes: 30 }).confidence).toBe(
      "High",
    );
    expect(diagnosisConfidence(GOOD, null).confidence).toBe("Medium");
    expect(
      diagnosisConfidence({ ...GOOD, upload: null }, { idle: 12, loaded: 20, increase: 8, grade: "A", basis: /** @type {const} */ ("p95"), probes: 30 })
        .confidence,
    ).toBe("Medium");
  });

  it("is low when most of the run produced nothing", () => {
    const empty = {
      download: null,
      upload: null,
      ping: null,
      jitter: null,
      loss: null,
      dns: null,
      stability: null,
    };
    expect(diagnosisConfidence(empty, null).confidence).toBe("Low");
  });
});

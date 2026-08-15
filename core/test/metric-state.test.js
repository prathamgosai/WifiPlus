/**
 * A card may only claim "measured" when a real number stands behind it.
 *
 * The static site used to ship every badge hardcoded to `measured` in the
 * markup, so when a run failed — and one always did, because the worker threw a
 * DataCloneError before the first byte moved — eight cards asserted a
 * measurement over eight em dashes. These tests pin the rule that replaced it:
 * the badge is derived from the value, and the derivation refuses anything that
 * is not a finite, non-negative number.
 */
import { describe, expect, it } from "vitest";
import {
  BADGE_TEXT,
  METRIC_KEYS,
  MetricState,
  createMetricStates,
  isMeasured,
  settle,
} from "../metric-state.js";

describe("isMeasured", () => {
  it("accepts real readings, including a genuine zero", () => {
    // Zero packet loss is a measurement, not a missing value — the commonest
    // way a gate like this goes wrong is treating it as falsy.
    expect(isMeasured(0)).toBe(true);
    expect(isMeasured(0.1)).toBe(true);
    expect(isMeasured(942.6)).toBe(true);
  });

  it("rejects every shape a broken throughput calculation produces", () => {
    // NaN from a zero-length window, Infinity from dividing by zero elapsed
    // time, negative from a clock that went backwards. Each of these rendered
    // straight into the DOM would read as a measurement.
    expect(isMeasured(Number.NaN)).toBe(false);
    expect(isMeasured(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isMeasured(-1)).toBe(false);
  });

  it("rejects absent and non-numeric values", () => {
    expect(isMeasured(null)).toBe(false);
    expect(isMeasured(undefined)).toBe(false);
    expect(isMeasured("57.6")).toBe(false);
  });
});

describe("settle", () => {
  it("only reaches MEASURED through a real value", () => {
    expect(settle(57.6)).toBe(MetricState.MEASURED);
    expect(settle(0)).toBe(MetricState.MEASURED);
  });

  it("treats a phase that produced nothing as unavailable, not measured", () => {
    expect(settle(null)).toBe(MetricState.UNAVAILABLE);
    expect(settle(Number.NaN)).toBe(MetricState.UNAVAILABLE);
  });

  it("distinguishes a failure from an absence when the caller knows which", () => {
    // "Unavailable" and "failed" are different facts, and the difference is what
    // tells a user whether re-running will help.
    expect(settle(null, MetricState.ERROR)).toBe(MetricState.ERROR);
    // A value present alongside an error hint is still a measurement.
    expect(settle(12, MetricState.ERROR)).toBe(MetricState.MEASURED);
  });
});

describe("createMetricStates", () => {
  it("starts every metric unstarted", () => {
    const states = createMetricStates();
    expect(Object.keys(states).sort()).toEqual([...METRIC_KEYS].sort());
    for (const key of METRIC_KEYS) expect(states[key]).toBe(MetricState.NOT_STARTED);
  });

  it("returns an independent map each time, so a re-test cannot inherit badges", () => {
    const first = createMetricStates();
    first.download = MetricState.MEASURED;
    expect(createMetricStates().download).toBe(MetricState.NOT_STARTED);
  });
});

describe("badge copy", () => {
  it("gives every state wording", () => {
    for (const state of Object.values(MetricState)) {
      expect(BADGE_TEXT[state]).toBeTruthy();
    }
  });

  it("uses the word 'measured' for exactly one state", () => {
    // The assertion the whole module exists to protect: no other badge may read
    // as a claim that a measurement happened.
    const claiming = Object.values(MetricState).filter((s) => BADGE_TEXT[s] === "measured");
    expect(claiming).toEqual([MetricState.MEASURED]);
  });
});

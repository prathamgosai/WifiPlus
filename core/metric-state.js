/**
 * Per-metric lifecycle state.
 * -----------------------------------------------------------------------------
 * A speed test shows eight numbers, and each of them can independently be
 * unstarted, in flight, measured, impossible on this platform, or failed. The
 * static site used to encode that in the markup — every card shipped with a
 * hardcoded `measured` badge — so a card claimed a measurement while its value
 * was still an em dash. The badge described the card's *intent*, not its state.
 *
 * This module makes the state explicit and derives the badge from it, so the
 * only way a card can say "measured" is for a finite number to exist behind it.
 * Presentation lives here rather than in the front end because the honesty rule
 * ("no value, no claim") is a property of the measurement, not of the layout.
 */

/**
 * The states themselves. Declared `const` (not annotated with a Record) so each
 * value keeps its literal type — that is what lets `BADGE_TEXT` be keyed by them
 * and checked exhaustively rather than degrading to a plain string map.
 */
export const MetricState = /** @type {const} */ ({
  NOT_STARTED: "not-started",
  TESTING: "testing",
  MEASURED: "measured",
  UNAVAILABLE: "unavailable",
  ERROR: "error",
});

/**
 * @typedef {(typeof MetricState)[keyof typeof MetricState]} MetricStateValue
 */

/**
 * Every metric the result grid shows. Ordered as the cards are, so a UI can
 * iterate this rather than repeating the list.
 */
export const METRIC_KEYS = /** @type {const} */ ([
  "download",
  "upload",
  "ping",
  "jitter",
  "loss",
  "dns",
  "stability",
  "bufferbloat",
]);

/**
 * Badge copy per state.
 *
 * "measured" is the only word that asserts a reading exists. The rest say what
 * is actually true, including `unavailable`, which is the honest answer for a
 * metric this platform cannot produce — a browser cannot see ICMP loss, and a
 * DNS lookup can be blocked outright by a filtering proxy.
 *
 * @type {Record<MetricStateValue, string>}
 */
export const BADGE_TEXT = {
  [MetricState.NOT_STARTED]: "not tested",
  [MetricState.TESTING]: "measuring",
  [MetricState.MEASURED]: "measured",
  [MetricState.UNAVAILABLE]: "unavailable",
  [MetricState.ERROR]: "failed",
};

/**
 * Fresh state map with every metric unstarted. Called on load and again at the
 * start of every run: a re-test must not inherit the previous run's badges, or
 * a metric that failed the second time keeps showing the first time's claim.
 *
 * @returns {Record<string, MetricStateValue>}
 */
export function createMetricStates() {
  /** @type {Record<string, MetricStateValue>} */
  const states = {};
  for (const key of METRIC_KEYS) states[key] = MetricState.NOT_STARTED;
  return states;
}

/**
 * Whether a value is publishable as a measurement.
 *
 * Guards the three ways a throughput calculation degenerates — NaN from a
 * zero-length window, Infinity from a divide by zero elapsed time, and a
 * negative from a clock that went backwards — plus null for "the phase ran and
 * produced nothing". Any of them reaching the DOM would render as "NaN Mbps".
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isMeasured(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * The state a metric lands in once its phase has finished.
 *
 * A phase that completed but produced nothing is UNAVAILABLE, not ERROR: those
 * are different facts. A DNS resolver that answers nothing is unavailable; a
 * download that threw is an error, and the difference is what tells the user
 * whether re-running will help.
 *
 * @param {unknown} value
 * @param {MetricStateValue} [whenMissing]
 * @returns {MetricStateValue}
 */
export function settle(value, whenMissing = MetricState.UNAVAILABLE) {
  return isMeasured(value) ? MetricState.MEASURED : whenMissing;
}

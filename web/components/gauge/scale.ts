/**
 * Gauge scale — re-exported from the shared engine in `core/gauge.js`.
 *
 * The static site's 270° dial and this app's 180° dial run the same maths with
 * different sweeps, so it lives in core alongside the measurement engine and is
 * unit-tested there. Keeping a second copy here is how the two dials would end
 * up disagreeing about where 250 Mbps sits.
 */
export { BASE_STOPS, fractionFor, labelFor, needleAngle, pointOnArc, scaleFor } from "@core/gauge.js";

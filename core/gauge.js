/**
 * Gauge scale mathematics — shared by both dials.
 * -----------------------------------------------------------------------------
 * The static site draws a 270° dial and the Next.js app draws a 180° one, but
 * the maths underneath is identical: map a speed onto a fraction of an arc, find
 * the point at that fraction, label the stops. Sweep and radius are parameters,
 * so one implementation serves both and neither can drift.
 *
 * A linear 0-1000 dial would be useless in practice: most connections live
 * between 20 and 300 Mbps, which on a linear scale occupies the first quarter of
 * the arc while three quarters sit empty. Equal arc distance per *stop* keeps
 * 40 Mbps and 90 Mbps visibly different.
 */

/** Marked stops, evenly spaced around the arc. */
export const BASE_STOPS = [0, 5, 10, 25, 50, 100, 250, 500, 750, 1000];

/**
 * Multi-gigabit links exist, so the dial grows rather than pinning at full.
 * @type {number[]}
 */
const CEILINGS = [1000, 2500, 5000, 10_000];

/**
 * Picks a scale that contains `peak`. Ceilings only ever grow within a run — a
 * dial that rescaled mid-test would make a rising number look like it was
 * falling.
 *
 * @param {number} peak highest value the dial must show
 * @param {readonly number[]} [previous] scale currently on screen, never shrunk
 * @returns {number[]}
 */
export function scaleFor(peak, previous = BASE_STOPS) {
  const needed = CEILINGS.find((ceiling) => peak <= ceiling) ?? CEILINGS[CEILINGS.length - 1] ?? 1000;
  const ceiling = Math.max(needed, previous[previous.length - 1] ?? 1000);

  if (ceiling <= 1000) return [...BASE_STOPS];

  // Above a gigabit the low end matters less, so headroom goes on top and the
  // dense 0-100 region is thinned to keep the label count readable.
  const head = [0, 10, 50, 100, 250, 500, 1000];
  const tail = CEILINGS.filter((step) => step > 1000 && step <= ceiling);
  return [...head, ...tail];
}

/**
 * Maps a value onto 0-1 of the arc by interpolating inside its bracket. Values
 * beyond the top stop clamp to 1 rather than spinning the needle off the dial.
 *
 * @param {number} value
 * @param {readonly number[]} stops
 * @returns {number}
 */
export function fractionFor(value, stops) {
  const last = stops.length - 1;
  if (last < 1) return 0;

  const bounded = Math.max(0, Math.min(value, stops[last] ?? 0));

  for (let i = 0; i < last; i += 1) {
    const lower = stops[i] ?? 0;
    const upper = stops[i + 1] ?? 0;
    if (bounded <= upper) {
      const span = upper - lower;
      const within = span === 0 ? 0 : (bounded - lower) / span;
      return (i + within) / last;
    }
  }
  return 1;
}

/**
 * Compact scale label — 2500 reads as "2.5G".
 *
 * @param {number} stop
 * @returns {string}
 */
export function labelFor(stop) {
  if (stop >= 1000) {
    const gigabits = stop / 1000;
    return `${Number.isInteger(gigabits) ? gigabits : gigabits.toFixed(1)}G`;
  }
  return String(stop);
}

/**
 * Cartesian point at a fraction along an arc.
 *
 * Angles follow the SVG convention throughout: degrees clockwise from east, with
 * y growing downward. That is the same frame `rotate()` and `A` path commands
 * use, so nothing here needs converting at the call site — and mixing it with
 * the mathematical (y-up) convention is precisely how a dial ends up mirrored.
 *
 *   180° dial: { start: 180, sweep: 180 } — left → top → right
 *   270° dial: { start: 135, sweep: 270 } — lower-left → top → lower-right
 *
 * @param {number} fraction 0-1 along the arc
 * @param {number} radius
 * @param {number} cx
 * @param {number} cy
 * @param {{ start?: number, sweep?: number }} [arc]
 * @returns {{ x: number, y: number }}
 */
export function pointOnArc(fraction, radius, cx, cy, { start = 180, sweep = 180 } = {}) {
  const radians = ((start + fraction * sweep) * Math.PI) / 180;
  return {
    x: round(cx + radius * Math.cos(radians)),
    y: round(cy + radius * Math.sin(radians)),
  };
}

/**
 * Rounds a coordinate to a precision every JavaScript engine agrees on.
 *
 * ECMAScript does not require Math.sin/cos to be correctly rounded, so two
 * engines may return results differing in the last bit. That is invisible until
 * the same component is rendered on a server and hydrated in a browser: React
 * compared x1="85.09333353215328" from Node against 85.0933335321533 from
 * Chrome, declared a hydration mismatch on every page load, and warned that it
 * "won't be patched up" — leaving the client showing server-computed geometry.
 *
 * Three decimals is a thousandth of an SVG user unit on a 400-wide viewBox:
 * orders of magnitude below one device pixel, and identical on every engine.
 *
 * @param {number} value
 * @returns {number}
 */
function round(value) {
  return Math.round(value * 1000) / 1000;
}

/**
 * Rotation in degrees for a needle drawn pointing straight up, normalised to
 * (-180, 180] so the value reads naturally in a transform.
 *
 * @param {number} fraction 0-1
 * @param {{ start?: number, sweep?: number }} [arc]
 * @returns {number}
 */
export function needleAngle(fraction, { start = 180, sweep = 180 } = {}) {
  // An up-pointing needle already sits at -90° in this frame, so the rotation is
  // the gap between that and where the fraction lands.
  const angle = start + fraction * sweep + 90;
  return angle > 180 ? angle - 360 : angle;
}

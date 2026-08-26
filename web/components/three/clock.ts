/**
 * One clock for the whole scene.
 * -----------------------------------------------------------------------------
 * Every animated thing in this scene used to keep its own time, and two
 * different kinds of time at that:
 *
 *   · PacketField, LinkTrails and SpriteField each accumulated a private
 *     `uTime` with its own `Math.min(delta, 0.05)` clamp.
 *   · The hop cores breathed on `performance.now()`, which is WALL CLOCK.
 *
 * That combination has a guaranteed visible failure. `NetworkScene` parks
 * `frameloop` at "never" whenever the hero scrolls away or the tab hides —
 * deliberately, and it is one of the better things about the scene. While
 * parked, the accumulators freeze because no frame runs, but `performance.now()`
 * keeps advancing. Scroll back after ten seconds and the five cores snap to a
 * completely different breath phase while everything else resumes exactly where
 * it stopped. A pop, on every scroll-away, by construction.
 *
 * The independently clamped accumulators had a slower version of the same
 * problem: any frame longer than 50 ms advances each of them by the clamp
 * rather than by the elapsed time, and nothing guarantees all three clamp on
 * the same frame. Over a session the packets and the link band that ride the
 * same bow drift out of phase with each other.
 *
 * One module-scoped mutable, advanced in exactly one place, fixes both. It is
 * read inside `useFrame` and never during render, so it deliberately lives
 * outside React state — the same reasoning as `drive` in the measurement store.
 */
export const clock = { t: 0 };

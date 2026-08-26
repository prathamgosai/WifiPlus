/**
 * The reversal beat.
 * -----------------------------------------------------------------------------
 * The download-to-upload handover is the one moment where the network visibly
 * turns around, and it was a boolean: `uDirection` flipped between frames while
 * the camera performed an exact mirror of the shot it had just finished. A
 * mirrored move landing on the same frame as an instant flip reads as an UNDO,
 * not as a turn.
 *
 * These three values give the moment anticipation, impact and follow-through:
 *
 *   drain   0 → 1 → 0   the field collapses into the nodes, then releases.
 *   kick    0 → 1 → 0   a short over-bright surge as the flow bites the other way.
 *   stream  0 ↔ 1       downstream/upstream hue, crossfaded rather than popped.
 *
 * `uDirection` itself cannot be eased — it selects a direction, and a value
 * between -1 and 1 is a stalled packet, not a slow one. So the flip is hidden
 * instead: it happens on the exact frame `drain` peaks, which is the darkest
 * frame of the beat, where an instantaneous change is invisible.
 *
 * HONESTY: this puts the visible reversal ~260 ms behind the engine's real
 * phase boundary. That is defensible only because the DOM announces the phase
 * independently and immediately — the stage ticker, the live region and the
 * gauge label all read from the store, never from here. Nothing in the DOM may
 * ever read its phase from this module, and the drain must not grow past 260 ms.
 */
export const beat = {
  /** Anticipation: packets collapse toward their destination node. */
  drain: 0,
  /** Impact: brief over-bright surge and acceleration. */
  kick: 0,
  /** 0 = downstream hue, 1 = upstream hue. Crossfaded through the flash. */
  stream: 0,
};

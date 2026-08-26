/**
 * The adaptive quality governor.
 * -----------------------------------------------------------------------------
 * Replaces drei's `AdaptiveDpr`, which did nothing at all. Verified: fiber
 * defines `performance.regress()` but never calls it — only drei's own
 * OrbitControls / CameraControls / ArcballControls / TrackballControls do, none
 * of which are used here. So `performance.current` sat pinned at 1.0 forever
 * and drei's `setDpr(current * initialDpr)` was a self-assignment on every
 * change: a safeguard in name only, which is worse than no safeguard because it
 * stops anyone looking for one.
 *
 * A static tier also cannot see a THROTTLED device. A phone saturating its link
 * mid-test heats up and can lose ~40% of its GPU clock — in precisely the
 * window where this scene is most animated. Only measurement catches that.
 *
 * THE RULE THAT MATTERS MOST: decisions are FROZEN while a throughput phase is
 * running. `core/measure.js` times every window with `performance.now()` on the
 * main thread this scene shares, and a governor that changes DPR mid-download
 * is AdaptiveDpr's thrash failure with extra steps, applied to the one window
 * where scheduling jitter becomes measurement error. Quality changes at phase
 * boundaries or not at all.
 */

import { drive } from "@/store/useTestStore";

/**
 * 1 = full quality, 0.75 = reduced, 0.5 = minimum.
 *
 * Module-scoped and mutated in place, like `drive` and `clock`: it is read
 * inside `useFrame` and must never cause a React render.
 */
export const quality = { level: 1 };

/**
 * Whether the scene is currently rendering into the HDR composite.
 *
 * This exists because the SAME emissive constants feed two different pipelines
 * and cannot be tuned once for both:
 *
 *   With the composite, additive blending accumulates in a half-float target
 *   and the whole image is tone-mapped ONCE at the end, so values well above
 *   1.0 are exactly what the bloom needs to find.
 *
 *   Without it (the light tier, or any device that failed the half-float check),
 *   every fragment is tone-mapped individually and THEN added in an 8-bit
 *   buffer. Push the same values there and each fragment resolves near 1.0
 *   before it is added, so the field turns into a white smear.
 *
 * Set by `Composite` once it is genuinely rendering, not merely mounted.
 */
export const render = { hdr: false };

/** Frames of history the median is taken over. */
const WINDOW = 30;

/** Consecutive bad frames before a downgrade. ~0.75s at 60Hz. */
const DOWN_AFTER = 45;

/** Consecutive good frames before an upgrade. Deliberately ~5x slower. */
const UP_AFTER = 240;

/**
 * Total direction changes allowed per session.
 *
 * Without this a device sitting exactly on the boundary oscillates forever,
 * which looks far worse than either quality level.
 */
const MAX_FLIPS = 3;

const LEVELS = [0.5, 0.75, 1] as const;

export interface Governor {
  /** Call once per frame with the frame delta in seconds. */
  sample(delta: number): void;
  /** True on the frame the level changed, so consumers can react once. */
  consumeChange(): boolean;
}

/**
 * Creates a governor. One per scene.
 *
 * @param onLevel notified when the level changes, at a phase boundary only.
 */
export function createGovernor(onLevel?: (level: number) => void): Governor {
  const history = new Float64Array(WINDOW);
  let filled = 0;
  let cursor = 0;

  let bad = 0;
  let good = 0;
  let flips = 0;
  let changed = false;

  /** Fastest frame seen, used to infer the display period. */
  let fastest = Infinity;

  const scratch = new Float64Array(WINDOW);

  return {
    sample(delta: number) {
      // Ignore absurd deltas: a parked frameloop resuming, or a tab restored.
      if (!Number.isFinite(delta) || delta <= 0 || delta > 0.5) return;

      history[cursor] = delta;
      cursor = (cursor + 1) % WINDOW;
      if (filled < WINDOW) filled += 1;
      if (delta < fastest) fastest = delta;

      if (filled < WINDOW) return;

      /*
       * FREEZE during a throughput phase. See the header — this is the whole
       * reason the governor is safe to run in a measurement tool.
       */
      if (drive.direction !== 0) {
        bad = 0;
        good = 0;
        return;
      }

      // Median, not mean: one 200ms GC pause must not trigger a downgrade.
      scratch.set(history);
      scratch.sort();
      const median = scratch[WINDOW >> 1] ?? 0;

      /*
       * Budget derived from the OBSERVED display period, not a hardcoded 16.7.
       * `frameloop: "always"` runs at display rate, so a 120Hz panel has an
       * 8.3ms budget and judging it against 16.7 would never downgrade.
       */
      const period = Number.isFinite(fastest) ? fastest : 1 / 60;

      if (median > period * 1.25) {
        bad += 1;
        good = 0;
      } else if (median < period * 0.75) {
        good += 1;
        bad = 0;
      } else {
        bad = 0;
        good = 0;
      }

      const index = LEVELS.indexOf(quality.level as (typeof LEVELS)[number]);

      if (bad >= DOWN_AFTER && index > 0 && flips < MAX_FLIPS) {
        quality.level = LEVELS[index - 1] ?? 0.5;
        flips += 1;
        bad = 0;
        changed = true;
        onLevel?.(quality.level);
      } else if (good >= UP_AFTER && index < LEVELS.length - 1 && flips < MAX_FLIPS) {
        quality.level = LEVELS[index + 1] ?? 1;
        flips += 1;
        good = 0;
        changed = true;
        onLevel?.(quality.level);
      }
    },

    consumeChange() {
      const value = changed;
      changed = false;
      return value;
    },
  };
}

/** Resets module state. Only for a fresh scene mount. */
export function resetQuality() {
  quality.level = 1;
}

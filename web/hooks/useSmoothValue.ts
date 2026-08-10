"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Follows a target value on its own requestAnimationFrame loop.
 *
 * The measurement engine reports throughput dozens of times a second and in
 * uneven steps — a fast link jumps 0 → 300 → 480 → 465. Rendering those numbers
 * directly makes the needle snap and the readout flicker. This eases toward the
 * target every frame instead, so the dial moves continuously no matter how
 * irregularly the data arrives.
 *
 * Exponential smoothing rather than a spring: it is frame-rate independent (the
 * factor is derived from elapsed time, so a 144 Hz display and a throttled
 * background tab converge identically), it never overshoots into a speed the
 * connection did not reach, and it costs one multiply per frame.
 *
 * The loop parks itself when the value has settled, so an idle gauge burns no
 * frames at all.
 *
 * @param target where to converge
 * @param options.responsiveness seconds to close ~63% of the remaining gap
 * @param options.epsilon below this the value snaps and the loop stops
 */
export function useSmoothValue(
  target: number,
  { responsiveness = 0.25, epsilon = 0.01 }: { responsiveness?: number; epsilon?: number } = {},
): number {
  const [value, setValue] = useState(target);

  const current = useRef(target);
  const goal = useRef(target);
  const frame = useRef<number | null>(null);
  const last = useRef(0);

  goal.current = target;

  useEffect(() => {
    // Someone who has asked for reduced motion gets the number, not the journey.
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      current.current = target;
      setValue(target);
      return;
    }

    if (Math.abs(current.current - target) < epsilon) return;

    const tick = (now: number) => {
      const elapsed = last.current ? Math.min((now - last.current) / 1000, 0.1) : 1 / 60;
      last.current = now;

      const gap = goal.current - current.current;
      if (Math.abs(gap) < epsilon) {
        current.current = goal.current;
        setValue(goal.current);
        frame.current = null;
        last.current = 0;
        return;
      }

      // 1 - e^(-dt/τ): the same easing whatever the frame rate.
      current.current += gap * (1 - Math.exp(-elapsed / responsiveness));
      setValue(current.current);
      frame.current = requestAnimationFrame(tick);
    };

    if (frame.current === null) {
      last.current = 0;
      frame.current = requestAnimationFrame(tick);
    }

    return () => {
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
    };
  }, [target, responsiveness, epsilon]);

  return value;
}

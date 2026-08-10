"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface CounterProps {
  to: number;
  from?: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/**
 * Counts up once the element scrolls into view.
 *
 * Driven by requestAnimationFrame writing to `textContent` rather than React
 * state — a 1.4s count at 60fps would otherwise fire ~84 re-renders per counter.
 * Reduced-motion users get the final value immediately.
 */
export function Counter({
  to,
  from = 0,
  duration = 1.6,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
}: CounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduced = useReducedMotion();
  const [done, setDone] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || !inView || done) return;

    if (reduced) {
      node.textContent = `${prefix}${to.toFixed(decimals)}${suffix}`;
      setDone(true);
      return;
    }

    let frame = 0;
    const start = performance.now();
    const total = duration * 1000;

    const tick = (now: number) => {
      const progress = Math.min((now - start) / total, 1);
      // easeOutExpo — fast arrival, long settle. Reads as "landing" on a number.
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      node.textContent = `${prefix}${(from + (to - from) * eased).toFixed(decimals)}${suffix}`;
      if (progress < 1) frame = requestAnimationFrame(tick);
      else setDone(true);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, reduced, from, to, duration, decimals, prefix, suffix, done]);

  return (
    <span ref={ref} className={cn("tabular", className)}>
      {`${prefix}${from.toFixed(decimals)}${suffix}`}
    </span>
  );
}

"use client";

import { useEffect, useState } from "react";
import { m, useMotionValue, useReducedMotion, useSpring } from "framer-motion";

/**
 * A soft brand-coloured light that trails the pointer across the whole page.
 *
 * Mounted only for fine pointers (a touch device has no cursor to follow) and
 * skipped entirely under `prefers-reduced-motion`. The springs are deliberately
 * loose so it lags slightly behind the cursor — a 1:1 follow reads as a bug.
 */
export function CursorGlow() {
  const reduced = useReducedMotion();
  const [enabled, setEnabled] = useState(false);

  const x = useMotionValue(-500);
  const y = useMotionValue(-500);
  const sx = useSpring(x, { stiffness: 120, damping: 22, mass: 0.6 });
  const sy = useSpring(y, { stiffness: 120, damping: 22, mass: 0.6 });

  useEffect(() => {
    if (reduced) return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!fine.matches) return;
    setEnabled(true);

    const onMove = (event: PointerEvent) => {
      x.set(event.clientX);
      y.set(event.clientY);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduced, x, y]);

  if (!enabled) return null;

  return (
    <m.div
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 -z-[9] h-[34rem] w-[34rem] rounded-full mix-blend-screen"
      style={{
        x: sx,
        y: sy,
        translateX: "-50%",
        translateY: "-50%",
        background:
          "radial-gradient(circle, color-mix(in oklab, var(--color-brand) 20%, transparent) 0%, color-mix(in oklab, var(--color-accent) 9%, transparent) 38%, transparent 68%)",
        filter: "blur(28px)",
      }}
    />
  );
}

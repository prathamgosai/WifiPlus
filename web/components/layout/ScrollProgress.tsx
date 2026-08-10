"use client";

import { m, useScroll, useSpring } from "framer-motion";

/**
 * Gradient read-progress bar pinned to the very top of the viewport.
 * `useScroll` writes to a motion value, so scrolling never triggers a re-render.
 */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 180, damping: 32, restDelta: 0.001 });

  return (
    <m.div
      aria-hidden
      className="fixed inset-x-0 top-0 z-[60] h-[2px] origin-left"
      style={{
        scaleX,
        background: "linear-gradient(90deg, #8b5cf6, #5b5ff0 45%, #22d3ee)",
        boxShadow: "0 0 12px 1px rgba(34,211,238,0.6)",
      }}
    />
  );
}

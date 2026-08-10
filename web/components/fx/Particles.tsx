"use client";

import { useMemo } from "react";
import { m, useReducedMotion } from "framer-motion";

/**
 * Slow-floating dust motes. Purely decorative depth cue behind glass panels.
 *
 * Positions are derived from the index rather than Math.random() so the server
 * and client markup match — random values here would cause a hydration mismatch.
 */
export function Particles({ count = 18, className = "" }: { count?: number; className?: string }) {
  const reduced = useReducedMotion();

  const motes = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        // Golden-ratio spacing scatters them evenly without clustering.
        const left = ((i * 61.803) % 100).toFixed(3);
        const top = ((i * 37.51) % 100).toFixed(3);
        return {
          left: `${left}%`,
          top: `${top}%`,
          size: i % 5 === 0 ? 3 : 1.8,
          duration: 9 + (i % 7) * 1.6,
          delay: -((i * 1.37) % 9),
          opacity: 0.18 + (i % 4) * 0.11,
        };
      }),
    [count],
  );

  if (reduced) return null;

  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {motes.map((mote, i) => (
        <m.span
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            left: mote.left,
            top: mote.top,
            width: mote.size,
            height: mote.size,
            opacity: mote.opacity,
            boxShadow: "0 0 8px rgba(255,255,255,0.6)",
          }}
          animate={{ y: [0, -26, 0], opacity: [mote.opacity, mote.opacity * 1.8, mote.opacity] }}
          transition={{
            duration: mote.duration,
            delay: mote.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

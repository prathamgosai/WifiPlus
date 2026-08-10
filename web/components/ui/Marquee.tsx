"use client";

import { cn } from "@/lib/utils";

interface MarqueeProps {
  children: React.ReactNode;
  /** Seconds for one full pass. Longer = calmer. */
  duration?: number;
  reverse?: boolean;
  className?: string;
}

/**
 * Infinite horizontal scroller.
 *
 * The track holds the content twice and translates by exactly -50%, so the
 * second copy lands where the first started and the seam is invisible. Pure CSS
 * transform — no JS runs per frame. Pauses on hover so cards stay readable.
 */
export function Marquee({ children, duration = 46, reverse = false, className }: MarqueeProps) {
  return (
    <div
      className={cn("pause-on-hover group relative overflow-hidden", className)}
      style={
        {
          // Feathered edges so rows fade out instead of being cut off.
          maskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
          WebkitMaskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
        } as React.CSSProperties
      }
    >
      {/*
        Both halves must be byte-for-byte the same width for -50% to be seamless.
        The gap therefore lives INSIDE each group (`gap-5 pe-5`, so the trailing
        edge carries a gap too) and the track itself has none — otherwise the
        first half is one gap wider than the second and the loop visibly jumps.
      */}
      <div
        className="animate-marquee flex w-max"
        style={
          {
            "--marquee-duration": `${duration}s`,
            animationDirection: reverse ? "reverse" : "normal",
          } as React.CSSProperties
        }
      >
        <div className="flex gap-5 pe-5">{children}</div>
        {/* Duplicate is decorative; screen readers already read the first copy. */}
        <div aria-hidden className="flex gap-5 pe-5">
          {children}
        </div>
      </div>
    </div>
  );
}

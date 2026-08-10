"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Tone, toneGlow } from "./tone";

interface IconOrbProps {
  icon: LucideIcon;
  tone?: Tone;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: { box: "h-10 w-10 rounded-xl", icon: 17 },
  md: { box: "h-12 w-12 rounded-2xl", icon: 20 },
  lg: { box: "h-14 w-14 rounded-[1.15rem]", icon: 24 },
} as const;

/**
 * Lucide glyph inside a glass circle with a tone-matched inner glow.
 *
 * The icon lifts and brightens on card hover via `group-hover`, which is what
 * makes an otherwise static grid feel responsive.
 */
export function IconOrb({ icon: Icon, tone = "brand", size = "md", className }: IconOrbProps) {
  const dims = SIZES[size];

  return (
    <span
      className={cn(
        "glass relative inline-grid place-items-center overflow-hidden",
        dims.box,
        "transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-0.5 group-hover:scale-105",
        className,
      )}
    >
      {/* Tone wash — sits behind the glyph, brightens on hover. */}
      <span
        aria-hidden
        className="absolute inset-0 opacity-45 transition-opacity duration-500 group-hover:opacity-90"
        style={{ background: `radial-gradient(120% 120% at 30% 0%, ${toneGlow[tone]}, transparent 70%)` }}
      />
      <Icon
        size={dims.icon}
        strokeWidth={1.75}
        className="relative z-10 text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.45)]"
        aria-hidden
      />
    </span>
  );
}

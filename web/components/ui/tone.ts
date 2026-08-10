/**
 * Per-card accent tones. A grid of eight identically-coloured glass cards reads
 * as a spreadsheet; rotating four tones gives it rhythm without breaking the
 * palette, since all four are drawn from the brand ramp.
 */
export type Tone = "brand" | "accent" | "violet" | "mint";

export const toneRing: Record<Tone, string> = {
  brand: "from-brand-400/70 to-brand/40",
  accent: "from-accent-400/70 to-accent/40",
  violet: "from-violet/70 to-brand-500/40",
  mint: "from-emerald-400/60 to-accent-400/40",
};

export const toneText: Record<Tone, string> = {
  brand: "text-brand-300",
  accent: "text-accent-300",
  violet: "text-violet-300",
  mint: "text-emerald-300",
};

/** Inline styles, used where a CSS gradient needs the raw token value. */
export const toneGlow: Record<Tone, string> = {
  brand: "color-mix(in oklab, var(--color-brand) 55%, transparent)",
  accent: "color-mix(in oklab, var(--color-accent) 55%, transparent)",
  violet: "color-mix(in oklab, var(--color-violet) 55%, transparent)",
  mint: "color-mix(in oklab, #34d399 55%, transparent)",
};

export const toneFill: Record<Tone, string> = {
  brand: "linear-gradient(135deg, #6366f1, #4338ca)",
  accent: "linear-gradient(135deg, #22d3ee, #0891b2)",
  violet: "linear-gradient(135deg, #a78bfa, #6d28d9)",
  mint: "linear-gradient(135deg, #34d399, #0d9488)",
};

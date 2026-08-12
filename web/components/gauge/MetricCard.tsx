"use client";

import { m, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { useMemo } from "react";
import { useSmoothValue } from "@/hooks/useSmoothValue";
import { cn } from "@/lib/utils";

/** A sparkline needs at least a line's worth of points to mean anything. */
const MIN_POINTS = 3;

interface SparklineProps {
  points: number[];
  stroke: string;
  live?: boolean;
}

/**
 * Mini live graph.
 *
 * Plots real recorded samples only. Cards whose metric is a single reading —
 * packet loss, DNS, stability — get no sparkline at all rather than a decorative
 * squiggle: this product's whole claim is that nothing on screen is simulated,
 * and a fake trend line would quietly break that.
 */
function Sparkline({ points, stroke, live }: SparklineProps) {
  const path = useMemo(() => {
    if (points.length < MIN_POINTS) return null;

    // Only the shape matters, so normalise into the viewBox and drop precision.
    const peak = Math.max(...points, 0.0001);
    const step = 100 / (points.length - 1);
    const line = points
      .map((point, index) => `${(index * step).toFixed(1)},${(28 - (point / peak) * 26).toFixed(1)}`)
      .join(" L ");

    return { line: `M ${line}`, area: `M ${line} L 100,28 L 0,28 Z` };
  }, [points]);

  if (!path) return null;

  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="mt-2.5 h-7 w-full" aria-hidden>
      <defs>
        <linearGradient id={`fill-${stroke.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={path.area} fill={`url(#fill-${stroke.replace(/[^a-z0-9]/gi, "")})`} />
      <path
        d={path.line}
        fill="none"
        stroke={stroke}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className={cn(live && "motion-safe:animate-pulse")}
      />
    </svg>
  );
}

export interface MetricCardProps {
  label: string;
  value: number | null;
  unit: string;
  digits?: number;
  icon: LucideIcon;
  /** Tailwind text colour class for the icon and accent. */
  tone: string;
  /** Raw hex for the sparkline stroke — SVG cannot read a Tailwind class. */
  sparkColor: string;
  /** Real recorded samples. Omit where the engine records only one reading. */
  series?: number[];
  hint?: string;
  live?: boolean;
  /** Overrides the numeric readout — used for the bufferbloat letter grade. */
  display?: string;
  index?: number;
}

/**
 * One measurement, as a glass card.
 *
 * The number is eased on its own rAF loop so a value landing mid-test counts up
 * rather than snapping — the same treatment the gauge gets, for the same reason.
 */
export function MetricCard({
  label,
  value,
  unit,
  digits = 1,
  icon: Icon,
  tone,
  sparkColor,
  series,
  hint,
  live = false,
  display,
  index = 0,
}: MetricCardProps) {
  const reduced = useReducedMotion();
  const smooth = useSmoothValue(value ?? 0, { responsiveness: 0.3 });
  const hasValue = value !== null;

  return (
    <m.article
      initial={reduced ? false : { opacity: 0, y: 14 }}
      animate={reduced ? undefined : { opacity: 1, y: 0 }}
      transition={{ delay: 0.08 * index, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      whileHover={reduced ? undefined : { y: -3 }}
      title={hint}
      className={cn(
        "glass-subtle group relative overflow-hidden rounded-2xl p-4",
        "transition-colors duration-300 hover:bg-white/[0.09]",
        // Gradient border, drawn as a masked ring so it does not affect layout.
        "before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl",
        "before:p-px before:opacity-0 before:transition-opacity before:duration-300",
        "before:[background:linear-gradient(140deg,rgba(255,255,255,0.35),transparent_45%,rgba(34,211,238,0.35))]",
        "before:[mask:linear-gradient(#000_0_0)_content-box,linear-gradient(#000_0_0)] before:[mask-composite:exclude]",
        "hover:before:opacity-100",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/[0.08] transition-transform duration-300",
            !reduced && "group-hover:scale-110",
            tone,
          )}
        >
          <Icon size={14} strokeWidth={2.2} aria-hidden />
        </span>
        <span className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-[color:var(--page-fg-muted)]">
          {label}
        </span>
        {live && (
          <span className="ms-auto h-1.5 w-1.5 rounded-full bg-accent-400 motion-safe:animate-pulse" />
        )}
      </div>

      <p className="tabular mt-2.5 font-display text-[1.45rem] font-extrabold leading-none tracking-tight flex items-baseline gap-1.5 flex-wrap min-w-0 max-w-full">
        <span className={hasValue ? "truncate" : "text-[color:var(--page-fg-muted)]/45"}>
          {display ?? (hasValue ? smooth.toFixed(digits) : "—")}
        </span>
        <span className="font-sans text-[0.6875rem] font-bold text-[color:var(--page-fg-muted)] shrink-0 whitespace-nowrap">
          {unit}
        </span>
      </p>

      {series && series.length >= MIN_POINTS && (
        <Sparkline points={series} stroke={sparkColor} live={live} />
      )}
    </m.article>
  );
}

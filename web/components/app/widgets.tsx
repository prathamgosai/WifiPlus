"use client";

import { useId } from "react";
import { m } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/* ==========================================================================
   Small app-surface widgets. These are the dashboard/settings equivalents of
   the marketing GlassCard family — same tokens, tuned for a denser UI.
   ========================================================================== */

type Trend = "up" | "down" | "flat";

interface StatTileProps {
  label: string;
  value: string;
  unit?: string;
  trend?: Trend;
  trendLabel?: string;
  /** When true, an up-trend is good (green). Ping wants the opposite. */
  upIsGood?: boolean;
  live?: boolean;
}

/** A single KPI. State is encoded in colour AND icon, never colour alone. */
export function StatTile({
  label,
  value,
  unit,
  trend = "flat",
  trendLabel,
  upIsGood = true,
  live = false,
}: StatTileProps) {
  const good = trend === "flat" ? null : (trend === "up") === upIsGood;
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const tone =
    good === null ? "text-[color:var(--page-fg-muted)]" : good ? "text-emerald-300" : "text-rose-300";

  return (
    <div className="glass-subtle relative overflow-hidden rounded-2xl p-4">
      {live && (
        <span
          aria-hidden
          className="absolute right-3.5 top-3.5 h-1.5 w-1.5 animate-pulse rounded-full bg-accent-400 shadow-[0_0_8px_1px_rgba(34,211,238,0.7)]"
        />
      )}
      <p className="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--page-fg-muted)]">
        {label}
      </p>
      <p className="tabular mt-2 font-display text-[1.75rem] font-extrabold leading-none tracking-tight">
        {value}
        {unit && <span className="ms-1 text-sm font-semibold text-[color:var(--page-fg-muted)]">{unit}</span>}
      </p>
      {trendLabel && (
        <p className={cn("mt-2 inline-flex items-center gap-1 text-[0.6875rem] font-medium", tone)}>
          <TrendIcon size={12} aria-hidden />
          {trendLabel}
        </p>
      )}
    </div>
  );
}

interface SparklineProps {
  points: number[];
  className?: string;
  stroke?: string;
  fill?: string;
  height?: number;
}

/**
 * Area sparkline. Normalises the series into a 100×H viewBox and stretches to
 * fill its container, so it stays crisp at any width without JS on resize.
 */
export function Sparkline({
  points,
  className,
  stroke = "var(--color-accent)",
  fill = "var(--color-brand)",
  height = 64,
}: SparklineProps) {
  const gid = useId().replace(/:/g, "");
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const stepX = 100 / (points.length - 1);

  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = height - 6 - ((p - min) / span) * (height - 12);
    return [x, y] as const;
  });

  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const last = coords[coords.length - 1]!;
  const area = `${line} L100,${height} L0,${height} Z`;

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className={cn("w-full", className)}
      style={{ height }}
      aria-hidden
    >
      <defs>
        <linearGradient id={`spk-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill} stopOpacity="0.42" />
          <stop offset="100%" stopColor={fill} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spk-${gid})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill={stroke} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  destructive?: boolean;
}

/** Accessible switch — real button with role=switch, keyboard-operable. */
export function Toggle({ checked, onChange, label, description, destructive }: ToggleProps) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div className="min-w-0">
        <label htmlFor={id} className={cn("block text-sm font-semibold", destructive && "text-rose-300")}>
          {label}
        </label>
        {description && (
          <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-[color:var(--page-fg-muted)]">
            {description}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-[26px] w-[46px] shrink-0 rounded-full border transition-colors duration-300",
          checked ? "border-transparent" : "border-[color:var(--glass-border)] bg-white/10",
        )}
        style={checked ? { background: "linear-gradient(120deg,#5b5ff0,#22d3ee)" } : undefined}
      >
        <m.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 34 }}
          className={cn(
            "absolute top-[2px] h-[20px] w-[20px] rounded-full shadow-sm",
            checked ? "right-[2px] bg-white" : "left-[2px] bg-[color:var(--page-fg-muted)]",
          )}
        />
      </button>
    </div>
  );
}

/** Titled container for a settings group. */
export function SettingsGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass glass-sheen rounded-[var(--radius-glass)] p-5 sm:p-6">
      <div className="mb-1.5">
        <h2 className="font-display text-lg font-extrabold tracking-tight">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-[color:var(--page-fg-muted)]">{description}</p>
        )}
      </div>
      <div className="mt-3 divide-y divide-[color:var(--glass-border)]">{children}</div>
    </section>
  );
}

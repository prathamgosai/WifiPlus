"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useSmoothValue } from "@/hooks/useSmoothValue";
import { BASE_STOPS, fractionFor, labelFor, pointOnArc, scaleFor } from "@core/gauge.js";
import type { StageId } from "@/lib/stages";
import { cn } from "@/lib/utils";

/**
 * The instrument.
 * -----------------------------------------------------------------------------
 * A 180-degree dial drawn in SVG. Vector rather than canvas for three reasons
 * that all still hold: it stays sharp at any size without redrawing, it is a
 * real ARIA `meter` instead of an opaque bitmap, and the only things that
 * change per frame are a `stroke-dashoffset` and two `transform`s.
 *
 * The arc maths comes from `core/gauge.js`, which the static site's 270-degree
 * dial also uses and which is unit-tested there. Re-deriving it here is how two
 * dials end up disagreeing about where 250 Mbps sits.
 *
 * HONESTY: `value` is nullable and that is load-bearing. A stage that has
 * produced no reading has produced no reading, and a dial that renders that as
 * 0.00 is asserting a measurement it does not have. The needle rests at the
 * floor and the readout shows an em dash.
 */

/* Fixed SVG coordinate space; the viewBox scales it. All units are SVG units. */
const CX = 220;
const CY = 236;
const RADIUS = 188;
const THICKNESS = 15;
const ARC_LENGTH = Math.PI * RADIUS;
const ARC = (r: number) => `M ${CX - r} ${CY} A ${r} ${r} 0 0 1 ${CX + r} ${CY}`;

/**
 * A separate scale for the latency stage.
 *
 * The dial shows round-trip time in ms while the latency phase runs, and the
 * Mbps stops are the wrong ruler for it: on a 0-1000 scale every realistic ping
 * between 5 ms and 80 ms sits in the first two percent of the arc, so the
 * needle does not visibly move during the one phase it is reporting. These
 * stops put a typical 25 ms round trip near the middle, where a change in it
 * can actually be seen.
 *
 * Kept local rather than pushed into `core/gauge.js`: that module is shared
 * with the static site's throughput dial and is unit-tested as such, and this
 * is a presentation choice that only this dial makes.
 */
const LATENCY_STOPS = [0, 5, 10, 20, 40, 80, 150, 300];

/** Per-stage accent, so the dial reads as a different instrument in each phase. */
const STAGE_TONE: Record<StageId, { from: string; via: string; to: string; label: string }> = {
  idle: { from: "#5b5ff0", via: "#22d3ee", to: "#67e8f9", label: "text-[color:var(--page-fg-muted)]" },
  discovering: { from: "#818cf8", via: "#a78bfa", to: "#c4b5fd", label: "text-brand-300" },
  latency: { from: "#8b5cf6", via: "#6366f1", to: "#22d3ee", label: "text-violet" },
  download: { from: "#3b82f6", via: "#22d3ee", to: "#67e8f9", label: "text-accent-300" },
  upload: { from: "#a78bfa", via: "#8b5cf6", to: "#c4b5fd", label: "text-brand-300" },
  complete: { from: "#22d3ee", via: "#34d399", to: "#a7f3d0", label: "text-emerald-300" },
  error: { from: "#fb7185", via: "#f43f5e", to: "#fda4af", label: "text-rose-300" },
};

export interface SpeedGaugeProps {
  /** The reading, or null when there is not one yet. */
  value: number | null;
  /** Which ruler to draw. Latency gets its own — see LATENCY_STOPS. */
  mode?: "throughput" | "latency";
  unit?: string;
  stage: StageId;
  /** Stage caption above the readout. */
  label: string;
  /** 0-100 across the whole run, for the outer progress ring. */
  progress?: number;
  active?: boolean;
  className?: string;
}

export function SpeedGauge({
  value,
  mode = "throughput",
  unit = "Mbps",
  stage,
  label,
  progress = 0,
  active = false,
  className,
}: SpeedGaugeProps) {
  // Unique per instance: two dials on one page must not share gradient ids.
  const uid = useId().replace(/:/g, "");
  const tone = STAGE_TONE[stage] ?? STAGE_TONE.idle;

  /* The throughput scale only ever grows, so a rising number never appears to
     fall because the dial rescaled underneath it. */
  const [stops, setStops] = useState<number[]>([...BASE_STOPS]);
  useEffect(() => {
    if (mode !== "throughput") return;
    setStops((previous) => {
      const next = scaleFor(value ?? 0, previous);
      const sameLength = next.length === previous.length;
      const sameTop = next[next.length - 1] === previous[previous.length - 1];
      return sameLength && sameTop ? previous : next;
    });
  }, [value, mode]);

  const scale = mode === "latency" ? LATENCY_STOPS : stops;

  const measured = typeof value === "number" && Number.isFinite(value);
  // The needle still eases to the floor when a value goes away rather than
  // snapping — but the READOUT does not print the number it eased through.
  const smooth = useSmoothValue(measured ? value : 0, { responsiveness: 0.26 });
  const fraction = fractionFor(smooth, scale);

  /* Rate of change, used to intensify the head as the reading climbs. This is
     the "velocity" cue: a dial that surges when throughput ramps reads as an
     instrument responding, not a bar filling on a timer. */
  const velocity = useRef(0);
  const previous = useRef(smooth);
  const lastAt = useRef(0);
  useEffect(() => {
    const now = performance.now();
    const dt = lastAt.current ? Math.max(now - lastAt.current, 16) / 1000 : 0.016;
    lastAt.current = now;
    const delta = Math.abs(smooth - previous.current);
    previous.current = smooth;
    // Normalised against the dial's own span so it behaves the same on a 10
    // Mbps link and a 2 Gbps one.
    const span = scale[scale.length - 1] || 1;
    const raw = Math.min(delta / dt / span, 1);
    velocity.current = velocity.current * 0.72 + raw * 0.28;
  }, [smooth, scale]);

  const ticks = useMemo(
    () =>
      scale.map((stop, index) => {
        const at = index / (scale.length - 1);
        return {
          stop,
          at,
          label: pointOnArc(at, RADIUS - 42, CX, CY),
          inner: pointOnArc(at, RADIUS - THICKNESS / 2 - 4, CX, CY),
          outer: pointOnArc(at, RADIUS + THICKNESS / 2 + 4, CX, CY),
        };
      }),
    [scale],
  );

  /* Fine graduations between the labelled stops. Purely a depth cue — they are
     evenly spaced around the arc and do not claim to mark values. */
  const minorTicks = useMemo(() => {
    const out: Array<{ inner: { x: number; y: number }; outer: { x: number; y: number }; at: number }> = [];
    const count = 60;
    for (let i = 0; i <= count; i += 1) {
      if (i % (count / (scale.length - 1)) === 0) continue;
      const at = i / count;
      out.push({
        at,
        inner: pointOnArc(at, RADIUS - THICKNESS / 2 - 2, CX, CY),
        outer: pointOnArc(at, RADIUS - THICKNESS / 2 - 8, CX, CY),
      });
    }
    return out;
  }, [scale.length]);

  const head = pointOnArc(fraction, RADIUS, CX, CY);
  const progressFraction = Math.max(0, Math.min(1, progress / 100));

  return (
    <div className={cn("relative w-full", className)}>
      <svg
        viewBox="0 0 440 300"
        className="w-full overflow-visible"
        role="meter"
        {...(measured ? { "aria-valuenow": Math.round(smooth) } : {})}
        aria-valuemin={0}
        aria-valuemax={scale[scale.length - 1]}
        aria-valuetext={
          measured ? `${smooth.toFixed(2)} ${unit}. ${label}` : `Not measured. ${label}`
        }
        aria-label="Connection measurement"
      >
        <defs>
          <linearGradient id={`${uid}-arc`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={tone.from} />
            <stop offset="52%" stopColor={tone.via} />
            <stop offset="100%" stopColor={tone.to} />
          </linearGradient>

          <radialGradient id={`${uid}-head`} cx="50%" cy="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="42%" stopColor={tone.to} stopOpacity="0.95" />
            <stop offset="100%" stopColor={tone.via} stopOpacity="0" />
          </radialGradient>

          {/* Bloom. Applied to a COPY of the arc underneath, never to the sharp
              stroke itself — filtering the visible stroke softens the edge the
              whole dial is read from. */}
          <filter id={`${uid}-bloom`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="10" />
          </filter>

          <filter id={`${uid}-soft`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {/* ---- Bezel: two hairlines that give the instrument physical depth. */}
        <path d={ARC(RADIUS + THICKNESS / 2 + 12)} fill="none" stroke="rgba(148,163,184,0.14)" strokeWidth={1} />
        <path d={ARC(RADIUS - THICKNESS / 2 - 14)} fill="none" stroke="rgba(148,163,184,0.09)" strokeWidth={1} />

        {/* ---- Outer run progress ring. Distinct from the reading: this is how
             far through the RUN we are, which is a different fact from the
             number on the dial and gets its own, thinner track. */}
        <path
          d={ARC(RADIUS + THICKNESS / 2 + 12)}
          fill="none"
          stroke={tone.via}
          strokeWidth={2}
          strokeLinecap="round"
          opacity={progressFraction > 0 ? 0.75 : 0}
          style={{
            strokeDasharray: Math.PI * (RADIUS + THICKNESS / 2 + 12),
            strokeDashoffset: Math.PI * (RADIUS + THICKNESS / 2 + 12) * (1 - progressFraction),
            transition: "stroke-dashoffset 240ms linear, opacity 400ms ease",
          }}
        />

        {/* ---- Inactive track. */}
        <path
          d={ARC(RADIUS)}
          fill="none"
          stroke="rgba(148,163,184,0.15)"
          strokeWidth={THICKNESS}
          strokeLinecap="round"
        />

        {/* ---- Minor graduations. */}
        <g>
          {minorTicks.map((tick, index) => (
            <line
              key={index}
              x1={tick.inner.x}
              y1={tick.inner.y}
              x2={tick.outer.x}
              y2={tick.outer.y}
              stroke="rgba(226,232,240,0.34)"
              strokeWidth={1}
              strokeLinecap="round"
              opacity={tick.at <= fraction ? 0.85 : 0.3}
            />
          ))}
        </g>

        {/* ---- Progress arc: a blurred copy for the bloom, the sharp stroke on
             top. One shared dash offset keeps them locked together. */}
        <g
          style={{
            strokeDasharray: ARC_LENGTH,
            strokeDashoffset: ARC_LENGTH * (1 - fraction),
          }}
        >
          <path
            d={ARC(RADIUS)}
            fill="none"
            stroke={`url(#${uid}-arc)`}
            strokeWidth={THICKNESS + 4}
            strokeLinecap="round"
            filter={`url(#${uid}-bloom)`}
            opacity={active ? 0.9 : 0.5}
          />
          <path
            d={ARC(RADIUS)}
            fill="none"
            stroke={`url(#${uid}-arc)`}
            strokeWidth={THICKNESS}
            strokeLinecap="round"
          />
        </g>

        {/* ---- Micro-particles.
             A dashed arc whose offset is animated in CSS, which renders as a
             stream of specks running the length of the dial. One path, one
             animated property — far cheaper than N circles on motion paths, and
             the reduced-motion rule in globals.css stops it like anything else. */}
        {active && (
          <path
            d={ARC(RADIUS - THICKNESS / 2 - 11)}
            fill="none"
            stroke={tone.to}
            strokeWidth={2.5}
            strokeLinecap="round"
            className="gauge-spark motion-reduce:hidden"
            opacity={0.75}
            filter={`url(#${uid}-soft)`}
          />
        )}

        {/* ---- Indicator head. Two circles: a wide soft bloom and a solid core.
             Positioned rather than rotated so it sits exactly on the arc. */}
        <g
          style={{
            transform: `translate(${head.x}px, ${head.y}px)`,
            transition: "none",
          }}
        >
          <circle
            r={20 + velocity.current * 14}
            fill={`url(#${uid}-head)`}
            opacity={measured ? 0.85 : 0.25}
          />
          <circle r={6} fill="#ffffff" opacity={measured ? 1 : 0.35} />
          <circle r={9.5} fill="none" stroke="#ffffff" strokeWidth={1.25} opacity={measured ? 0.55 : 0.2} />
        </g>

        {/* ---- Scale numerals. */}
        <g>
          {ticks.map((tick) => (
            <g key={tick.stop}>
              <line
                x1={tick.inner.x}
                y1={tick.inner.y}
                x2={tick.outer.x}
                y2={tick.outer.y}
                stroke="rgba(226,232,240,0.5)"
                strokeWidth={2}
                strokeLinecap="round"
              />
              <text
                x={tick.label.x}
                y={tick.label.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-[color:var(--page-fg)] font-sans text-[14px] font-bold"
                opacity={tick.at <= fraction ? 0.95 : 0.45}
              >
                {mode === "latency" ? tick.stop : labelFor(tick.stop)}
              </text>
            </g>
          ))}
        </g>
      </svg>

      {/* ---- Readout.
           HTML rather than <text> so it inherits the type scale and can use
           tabular numerals — SVG text jitters as digit widths change. It sits
           below the pivot: at zero the head rests on the baseline, so anything
           level with the centre would be overlapped by it. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center">
        <p
          className={cn(
            "flex items-center gap-2 text-[0.6875rem] font-bold uppercase tracking-[0.2em]",
            tone.label,
          )}
        >
          {active && (
            <span className="h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-pulse" />
          )}
          {label}
        </p>

        <p className="tabular mt-1.5 font-display text-[clamp(2.75rem,9.5vw,4.5rem)] font-extrabold leading-none tracking-tight">
          {measured ? smooth.toFixed(mode === "latency" ? 0 : 2) : "—"}
        </p>

        <p className="mt-1 text-sm font-semibold text-[color:var(--page-fg-muted)]">
          {measured ? unit : "not measured yet"}
        </p>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useSmoothValue } from "@/hooks/useSmoothValue";
import { BASE_STOPS, fractionFor, labelFor, needleAngle, pointOnArc, scaleFor } from "./scale";
import { cn } from "@/lib/utils";

/* The dial is drawn in a fixed coordinate space and scaled by the viewBox, so
   every constant below is in SVG units, not pixels. */
const CX = 200;
const CY = 208;
const RADIUS = 162;
const THICKNESS = 18;
/** Half the circumference: the drawable length of a 180° arc. */
const ARC_LENGTH = Math.PI * RADIUS;
const ARC_PATH = `M ${CX - RADIUS} ${CY} A ${RADIUS} ${RADIUS} 0 0 1 ${CX + RADIUS} ${CY}`;

interface SpeedGaugeProps {
  /** Current reading in Mbps. */
  /**
   * The measurement, or null when there is not one yet.
   *
   * Nullable on purpose: a phase that has produced nothing has produced
   * nothing, and a dial that renders that as 0.00 is asserting a reading it
   * does not have. The needle rests at the floor and the readout shows an em
   * dash instead.
   */
  value: number | null;
  /** Stage caption under the readout — "Testing download…", "Complete". */
  stage: string;
  /** Drives the pulse on the hub and the arc glow. */
  active?: boolean;
  unit?: string;
  className?: string;
}

/**
 * The 180° speedometer.
 *
 * Built as SVG rather than canvas: the arc, ticks and labels are all vector, so
 * the dial stays sharp on any display and at any size without redrawing, and
 * screen readers get a real ARIA meter instead of an opaque bitmap.
 *
 * Every frame-by-frame change is a `transform` or a `stroke-dashoffset` — both
 * composited on the GPU — and the value is eased in a rAF loop
 * (`useSmoothValue`) rather than through per-frame React state on the whole
 * tree. React only re-renders this one component.
 */
export function SpeedGauge({
  value,
  stage,
  active = false,
  unit = "Mbps",
  className,
}: SpeedGaugeProps) {
  // Unique per instance: two gauges on one page must not share gradient ids.
  const uid = useId().replace(/:/g, "");

  // The scale only ever grows, so a rising number never appears to fall because
  // the dial rescaled underneath it.
  const [stops, setStops] = useState<number[]>([...BASE_STOPS]);
  useEffect(() => {
    setStops((previous) => {
      const next = scaleFor(value ?? 0, previous);
      return next.length === previous.length && next[next.length - 1] === previous[previous.length - 1]
        ? previous
        : next;
    });
  }, [value]);

  const measured = typeof value === "number" && Number.isFinite(value);
  // The needle still eases to the floor when a value goes away, rather than
  // snapping — but the READOUT does not print the number it eased through.
  const smooth = useSmoothValue(measured ? value : 0, { responsiveness: 0.28 });
  const fraction = fractionFor(smooth, stops);

  const ticks = useMemo(
    () =>
      stops.map((stop, index) => {
        const at = index / (stops.length - 1);
        return {
          stop,
          at,
          label: pointOnArc(at, RADIUS - 40, CX, CY),
          inner: pointOnArc(at, RADIUS - THICKNESS / 2 - 3, CX, CY),
          outer: pointOnArc(at, RADIUS + THICKNESS / 2 + 3, CX, CY),
        };
      }),
    [stops],
  );

  return (
    <div className={cn("relative w-full", className)}>
      <svg
        viewBox="0 0 400 322"
        className="w-full"
        role="meter"
        {...(measured ? { "aria-valuenow": Math.round(smooth) } : {})}
        aria-valuemin={0}
        aria-valuemax={stops[stops.length - 1]}
        aria-valuetext={measured ? `${smooth.toFixed(2)} ${unit}. ${stage}` : `Not measured. ${stage}`}
        aria-label="Connection speed"
      >
        <defs>
          <linearGradient id={`${uid}-arc`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="34%" stopColor="#22d3ee" />
            <stop offset="68%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>

          {/* Metallic needle: bright along one edge, shadowed along the other. */}
          <linearGradient id={`${uid}-needle`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#e6ecf5" />
            <stop offset="100%" stopColor="#7d879a" />
          </linearGradient>

          <radialGradient id={`${uid}-hub`} cx="35%" cy="30%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.9)" />
            <stop offset="45%" stopColor="rgba(190,205,225,0.45)" />
            <stop offset="100%" stopColor="rgba(12,16,28,0.95)" />
          </radialGradient>

          <filter id={`${uid}-glow`} x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="9" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id={`${uid}-needle-shadow`} x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#03060f" floodOpacity="0.55" />
          </filter>
        </defs>

        {/* Inactive track. */}
        <path
          d={ARC_PATH}
          fill="none"
          stroke="rgba(148,163,184,0.16)"
          strokeWidth={THICKNESS}
          strokeLinecap="round"
        />

        {/* Progress arc. A blurred copy underneath supplies the bloom without
            filtering the sharp stroke itself. */}
        <g
          style={{
            strokeDasharray: ARC_LENGTH,
            strokeDashoffset: ARC_LENGTH * (1 - fraction),
          }}
        >
          <path
            d={ARC_PATH}
            fill="none"
            stroke={`url(#${uid}-arc)`}
            strokeWidth={THICKNESS}
            strokeLinecap="round"
            filter={`url(#${uid}-glow)`}
            opacity={active ? 0.85 : 0.55}
          />
          <path
            d={ARC_PATH}
            fill="none"
            stroke={`url(#${uid}-arc)`}
            strokeWidth={THICKNESS}
            strokeLinecap="round"
          />
        </g>

        {/* Scale: a tick and a numeral per stop. */}
        <g>
          {ticks.map((tick) => (
            <g key={tick.stop}>
              <line
                x1={tick.inner.x}
                y1={tick.inner.y}
                x2={tick.outer.x}
                y2={tick.outer.y}
                stroke="rgba(226,232,240,0.4)"
                strokeWidth={2}
                strokeLinecap="round"
              />
              <text
                x={tick.label.x}
                y={tick.label.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-[color:var(--page-fg)] font-sans text-[15px] font-bold"
                opacity={tick.at <= fraction ? 0.95 : 0.5}
              >
                {labelFor(tick.stop)}
              </text>
            </g>
          ))}
        </g>

        {/* Needle. Rotating a group about the hub keeps this a single composited
            transform — the geometry is never recomputed. */}
        <g
          style={{
            transform: `rotate(${needleAngle(fraction).toFixed(3)}deg)`,
            transformOrigin: `${CX}px ${CY}px`,
            willChange: "transform",
          }}
          filter={`url(#${uid}-needle-shadow)`}
        >
          <polygon
            points={`${CX - 7},${CY} ${CX},${CY - RADIUS + 26} ${CX + 7},${CY}`}
            fill={`url(#${uid}-needle)`}
          />
        </g>

        {/* Glass hub, drawn after the needle so it caps the pivot. */}
        <circle cx={CX} cy={CY} r={19} fill={`url(#${uid}-hub)`} />
        <circle cx={CX} cy={CY} r={19} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
        {active && (
          <circle
            cx={CX}
            cy={CY}
            r={19}
            fill="none"
            stroke="rgba(34,211,238,0.7)"
            strokeWidth={1.5}
            className="animate-pulse-ring motion-reduce:animate-none"
          />
        )}
      </svg>

      {/* Readout. HTML rather than <text> so it inherits the type scale and can
          use tabular numerals — SVG text would jitter as digits change width.
          It sits in the space below the hub: at zero the needle lies flat along
          the baseline, so anything level with the pivot would be struck through
          by it. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center pb-1">
        <p className="tabular font-display text-[clamp(2.5rem,9vw,4rem)] font-extrabold leading-none tracking-tight">
          {measured ? smooth.toFixed(2) : "—"}
        </p>
        <p className="mt-1 text-sm font-semibold text-[color:var(--page-fg-muted)]">{unit}</p>
        <p
          className={cn(
            "mt-2 flex items-center gap-2 text-[0.8125rem] font-bold uppercase tracking-[0.14em]",
            active ? "text-accent-300" : "text-[color:var(--page-fg-muted)]",
          )}
        >
          {active && (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-400 motion-reduce:animate-none" />
          )}
          {stage}
        </p>
      </div>
    </div>
  );
}

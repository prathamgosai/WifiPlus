"use client";

import { m, useReducedMotion } from "framer-motion";
import { useId } from "react";
import { useSmoothValue } from "@/hooks/useSmoothValue";
import { healthBand } from "@core/health.js";
import { ProvenanceBadge } from "./Provenance";
import type { QualityScores } from "@/types";
import { cn } from "@/lib/utils";

/**
 * The headline verdict: one score, its band, and the four sub-scores under it.
 * -----------------------------------------------------------------------------
 * The arithmetic is `qualityScores()` in `core/scoring.js` and the wording is
 * `healthBand()` in `core/health.js` — both shared with the static site, both
 * unit-tested there. Nothing is computed in this file; a second scoring model
 * living in a component is how two surfaces of the same product end up
 * disagreeing about the same run.
 *
 * A sub-score can be null, and null is rendered as "Not measured" rather than
 * as a zero or a dash. `video` is null when upload could not be measured and
 * `work` when either upload or DNS could not be — in both cases the largest
 * input to the score is missing, and scoring the remainder would rate the
 * connection on latency alone while labelling it a verdict on video calls.
 */

const RING_SIZE = 168;
const RING_RADIUS = 74;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const TONE: Record<string, string> = {
  excellent: "#34d399",
  good: "#22d3ee",
  fair: "#fbbf24",
  poor: "#fb7185",
  unknown: "#94a3b8",
};

export interface ConnectionScoreProps {
  scores: QualityScores | null;
  className?: string;
}

export function ConnectionScore({ scores, className }: ConnectionScoreProps) {
  const uid = useId().replace(/:/g, "");
  const reduced = useReducedMotion();

  const health = scores?.health ?? null;
  const band = healthBand(health);
  const accent = TONE[band.tone] ?? TONE.unknown;

  // Eased so the ring sweeps to its value instead of appearing at it.
  const smooth = useSmoothValue(health ?? 0, { responsiveness: 0.5 });
  const fraction = Math.max(0, Math.min(1, smooth / 100));

  const parts: Array<{ label: string; value: number | null; why: string }> = [
    { label: "Gaming", value: scores?.gaming ?? null, why: "Latency, jitter and probe loss." },
    { label: "Streaming", value: scores?.streaming ?? null, why: "Download against the ~25 Mbps a 4K stream needs." },
    {
      label: "Calls",
      value: scores?.video ?? null,
      why: "Upload, jitter and loss. Null when upload could not be measured.",
    },
    {
      label: "Work",
      value: scores?.work ?? null,
      why: "Both directions plus DNS. Null when either could not be measured.",
    },
  ];

  return (
    <div
      className={cn(
        "glass-strong glass-sheen gradient-ring-always relative overflow-hidden rounded-[var(--radius-glass-lg)] p-6 sm:p-8",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-7 sm:flex-row sm:items-center sm:gap-9">
        {/* ---- Ring ------------------------------------------------------- */}
        <div className="relative shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
          <svg viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} className="h-full w-full -rotate-90">
            <defs>
              <linearGradient id={`${uid}-ring`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity="0.55" />
                <stop offset="100%" stopColor={accent} />
              </linearGradient>
            </defs>

            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke="rgba(148,163,184,0.16)"
              strokeWidth={11}
            />
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke={`url(#${uid}-ring)`}
              strokeWidth={11}
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - fraction)}
              style={{ filter: `drop-shadow(0 0 10px ${accent}66)` }}
            />
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="tabular font-display text-[2.75rem] font-extrabold leading-none tracking-tight">
              {health === null ? "—" : Math.round(smooth)}
            </p>
            <p className="mt-0.5 text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-[color:var(--page-fg-muted)]">
              out of 100
            </p>
          </div>
        </div>

        {/* ---- Verdict + sub-scores ---------------------------------------- */}
        <div className="min-w-0 flex-1 text-center sm:text-start">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <h3
              className="font-display text-[clamp(1.5rem,3.4vw,2.125rem)] font-extrabold leading-tight"
              style={{ color: accent }}
            >
              {band.grade}
            </h3>
            <ProvenanceBadge
              kind="inferred"
              hint="A weighted mean of the sub-scores below, each computed from this run's measurements by the published formula in core/scoring.js."
            />
          </div>

          <p className="mt-2 text-[0.9375rem] leading-relaxed text-[color:var(--page-fg-muted)]">
            {band.verdict}
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {parts.map((part, index) => (
              <m.div
                key={part.label}
                initial={reduced ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 * index + 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                title={part.why}
                className="glass-subtle rounded-xl px-3 py-2.5 text-center sm:text-start"
              >
                <dt className="text-[0.625rem] font-bold uppercase tracking-[0.12em] text-[color:var(--page-fg-muted)]">
                  {part.label}
                </dt>
                <dd
                  className={cn(
                    "tabular mt-1 font-display text-xl font-extrabold leading-none",
                    part.value === null && "text-[color:var(--page-fg-muted)]/45",
                  )}
                >
                  {part.value === null ? (
                    <span className="text-[0.6875rem] font-semibold uppercase tracking-wide">
                      Not measured
                    </span>
                  ) : (
                    part.value
                  )}
                </dd>
              </m.div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}

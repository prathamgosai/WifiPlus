"use client";

import { m, useReducedMotion } from "framer-motion";
import { AlertTriangle, CheckCircle2, HelpCircle, Stethoscope } from "lucide-react";
import { diagnose, HOP_LABEL, type FindingTone } from "@/lib/doctor";
import { ProvenanceBadge } from "./Provenance";
import type { BufferbloatResult } from "@/lib/speedtest";
import type { SpeedResult } from "@/types";
import { cn } from "@/lib/utils";

/**
 * The Network Doctor.
 * -----------------------------------------------------------------------------
 * A finding, what it means, and what to do about it — with every claim carrying
 * the label for what kind of claim it is. The hop strip mirrors the 3D topology
 * in the hero, so "the router is the problem" is pointed at the same object the
 * user watched packets flow through.
 *
 * The analysis is `core/health.js` via `lib/doctor.ts`. Nothing here decides
 * anything about the connection.
 */

const TONE_STYLE: Record<FindingTone, { ring: string; text: string; Icon: typeof CheckCircle2 }> = {
  ok: { ring: "border-emerald-400/35 bg-emerald-400/10", text: "text-emerald-300", Icon: CheckCircle2 },
  suspect: { ring: "border-amber-400/35 bg-amber-400/10", text: "text-amber-300", Icon: AlertTriangle },
  unknown: { ring: "border-white/12 bg-white/[0.04]", text: "text-[color:var(--page-fg-muted)]", Icon: HelpCircle },
};

const CONFIDENCE_STYLE: Record<string, string> = {
  High: "text-emerald-300",
  Medium: "text-accent-300",
  Low: "text-amber-300",
};

export interface NetworkDoctorProps {
  result: SpeedResult;
  bufferbloat: BufferbloatResult | null;
  degraded?: boolean;
  edgeLabel?: string | null;
  className?: string;
}

export function NetworkDoctor({
  result,
  bufferbloat,
  degraded = false,
  edgeLabel = null,
  className,
}: NetworkDoctorProps) {
  const reduced = useReducedMotion();
  const diagnosis = diagnose(result, bufferbloat, { degraded, edgeLabel });

  /* Empty state, not a placeholder verdict. A diagnosis needs a download and a
     latency figure; without them there is nothing to diagnose. */
  if (!diagnosis) {
    return (
      <div
        className={cn(
          "glass-subtle rounded-[var(--radius-glass)] p-6 text-center sm:p-8",
          className,
        )}
      >
        <Stethoscope size={22} className="mx-auto text-[color:var(--page-fg-muted)]" aria-hidden />
        <p className="mt-3 font-display text-lg font-bold">Waiting for a measurement</p>
        <p className="mx-auto mt-1.5 max-w-sm text-[0.875rem] text-[color:var(--page-fg-muted)]">
          The diagnosis reads the run you just took. Start a test and it will fill in here.
        </p>
      </div>
    );
  }

  const tone = TONE_STYLE[diagnosis.tone];
  const { Icon } = tone;

  return (
    <div
      className={cn(
        "glass glass-sheen relative overflow-hidden rounded-[var(--radius-glass-lg)] p-6 sm:p-8",
        className,
      )}
    >
      {/* ---- Finding ------------------------------------------------------ */}
      <div className="flex items-start gap-3.5">
        <span className={cn("mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border", tone.ring, tone.text)}>
          <Icon size={17} strokeWidth={2.2} aria-hidden />
        </span>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-[1.0625rem] font-extrabold tracking-tight">
              Your Network Doctor
            </h3>
            <ProvenanceBadge
              kind="inferred"
              hint="Derived from this run's measurements by the published rules in core/health.js. A browser cannot inspect a router, a WiFi radio or a route."
            />
          </div>
          <p className="mt-2 text-[1.0625rem] font-semibold leading-snug">{diagnosis.headline}</p>
        </div>
      </div>

      {/* ---- Issue + confidence ------------------------------------------- */}
      <dl className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="glass-subtle rounded-xl px-4 py-3">
          <dt className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[color:var(--page-fg-muted)]">
            Likely issue
          </dt>
          <dd className={cn("mt-1 font-display text-base font-extrabold", tone.text)}>
            {diagnosis.issue ?? "Nothing flagged"}
          </dd>
        </div>

        <div className="glass-subtle rounded-xl px-4 py-3">
          <dt className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[color:var(--page-fg-muted)]">
            Confidence
          </dt>
          {/* Three bands, not a percentage. `diagnosisConfidence` grades on how
              many deciding inputs were measured; there is no calculation here
              that would justify a two-digit number, and printing one beside
              genuine measurements would make those look invented too. */}
          <dd
            className={cn(
              "mt-1 font-display text-base font-extrabold",
              CONFIDENCE_STYLE[diagnosis.confidence] ?? "",
            )}
          >
            {diagnosis.confidence}
          </dd>
          <dd className="mt-1 text-[0.75rem] leading-relaxed text-[color:var(--page-fg-muted)]">
            {diagnosis.confidenceReason}
          </dd>
        </div>
      </dl>

      {/* ---- Hop strip — mirrors the topology in the hero scene ------------ */}
      <div className="mt-6">
        <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[color:var(--page-fg-muted)]">
          Along the path
        </p>
        <ol className="mt-2.5 flex flex-wrap items-stretch gap-2">
          {diagnosis.hops.map((hop, index) => {
            const style = TONE_STYLE[hop.flag] ?? TONE_STYLE.unknown;
            return (
              <m.li
                key={hop.hop}
                initial={reduced ? false : { opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.06, duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                className={cn("min-w-[8.5rem] flex-1 rounded-xl border px-3 py-2.5", style.ring)}
              >
                <p className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-[color:var(--page-fg-muted)]">
                  {HOP_LABEL[hop.hop] ?? hop.hop}
                </p>
                <p className={cn("mt-1 text-[0.8125rem] font-semibold leading-tight", style.text)}>
                  {hop.note}
                </p>
              </m.li>
            );
          })}
        </ol>
        <p className="mt-2.5 text-[0.75rem] leading-relaxed text-[color:var(--page-fg-muted)]">
          These are readings about the path, not observations of the equipment on it. The browser has
          no ICMP, no traceroute and no view of your router or WiFi radio — each hop is judged by the
          shape of what arrived, and says so.
        </p>
      </div>

      {/* ---- Why it matters ----------------------------------------------- */}
      <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.04] p-4">
        <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[color:var(--page-fg-muted)]">
          Why this matters
        </p>
        <p className="mt-1.5 text-[0.875rem] leading-relaxed">{diagnosis.matters}</p>
      </div>

      {/* ---- What to do next ---------------------------------------------- */}
      <div className="mt-5">
        <div className="flex items-center gap-2">
          <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[color:var(--page-fg-muted)]">
            What to do next
          </p>
          <ProvenanceBadge
            kind="inferred"
            label="Recommended"
            hint="Advice that follows from the finding above. Not a measurement."
          />
        </div>

        <ol className="mt-3 space-y-2.5">
          {diagnosis.fixes.map((fix, index) => (
            <li key={fix.step} className="flex gap-3">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-accent text-[0.625rem] font-extrabold text-white">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[0.875rem] font-semibold leading-snug">{fix.step}</p>
                <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-[color:var(--page-fg-muted)]">
                  {fix.because}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

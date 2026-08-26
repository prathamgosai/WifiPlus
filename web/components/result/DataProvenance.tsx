"use client";

import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { verdictLabel } from "@core/quality.js";
import type { QualityReport } from "@core/quality.js";
import type { Evidence } from "@/store/useTestStore";
import { cn } from "@/lib/utils";

/**
 * How much this run can be trusted, and why.
 * -----------------------------------------------------------------------------
 * `core/quality.js` grades every run against its own evidence — reconciling the
 * headline throughput against a second, independently computed rate, checking
 * sample counts, and capping confidence when the run happened under conditions
 * that undermine it (a backgrounded tab, an endpoint failover, a loaded server).
 *
 * That grade has always been computed and, until now, thrown away before it
 * reached the screen. Surfacing it is the point of this component: a speed test
 * that cannot say how much to trust its own number has not finished reporting.
 *
 * Note what is NOT here: no percentage confidence, no invented sample size, no
 * "verified by" badge that means nothing. Every line is a check the engine
 * actually ran, in the words it used.
 */

/* Keyed by the verdict union rather than `string`: under
   `noUncheckedIndexedAccess` a string-indexed record yields `| undefined` on
   every lookup, which would force a non-null assertion at each use site. */
const VERDICT_STYLE: Record<
  QualityReport["verdict"],
  { className: string; Icon: typeof ShieldCheck }
> = {
  verified: { className: "border-emerald-400/35 bg-emerald-400/10 text-emerald-300", Icon: ShieldCheck },
  partial: { className: "border-amber-400/35 bg-amber-400/10 text-amber-300", Icon: TriangleAlert },
  incomplete: { className: "border-rose-400/35 bg-rose-400/10 text-rose-300", Icon: X },
};

/** Bytes into something readable. Binary units, because that is what was counted. */
function bytes(value: number): string {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GiB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MiB`;
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KiB`;
  return `${value} B`;
}

export interface DataProvenanceProps {
  quality: QualityReport | null;
  evidence: Evidence | null;
  className?: string;
}

export function DataProvenance({ quality, evidence, className }: DataProvenanceProps) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();

  if (!quality) return null;

  const label = verdictLabel(quality.verdict);
  const style = VERDICT_STYLE[quality.verdict];
  const { Icon } = style;

  const rows: Array<[string, string]> = [];
  if (evidence) {
    const down = evidence.download;
    rows.push(["Download bytes counted", bytes(down.bytes)]);
    rows.push([
      "Measured window",
      `${(down.measuredMs / 1000).toFixed(1)}s of ${(down.elapsedMs / 1000).toFixed(1)}s (${down.warmupMs}ms warm-up excluded)`,
    ]);
    rows.push(["Aggregation", down.method]);
    rows.push([
      "Cross-check",
      // The reconciliation figure is the whole basis of the "verified" claim, so
      // it is stated as a number rather than summarised as a tick.
      `${down.reconciliationMbps.toFixed(1)} Mbps over the whole phase` +
        (typeof quality.reconcile.download === "number"
          ? ` (${Math.round(quality.reconcile.download * 100)}% from the headline)`
          : ""),
    ]);
    rows.push(["Parallel streams", String(down.streams)]);
    if (evidence.upload) {
      rows.push(["Upload bytes acknowledged", bytes(evidence.upload.bytes)]);
    }
    rows.push([
      "Latency probes",
      `${evidence.idleProbes} idle, ${evidence.downloadLoadedProbes} under download, ${evidence.uploadLoadedProbes} under upload`,
    ]);
    if (evidence.protocol) rows.push(["Protocol", evidence.protocol]);
  }

  return (
    <div className={cn("glass-subtle overflow-hidden rounded-[var(--radius-glass)]", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-start transition-colors hover:bg-white/[0.05]"
      >
        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg border", style.className)}>
          <Icon size={15} strokeWidth={2.3} aria-hidden />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[0.9375rem] font-extrabold tracking-tight">
              Measurement {label.label.toLowerCase()}
            </span>
            <span className="rounded-full border border-white/12 bg-white/[0.05] px-2 py-0.5 text-[0.5625rem] font-bold uppercase tracking-[0.12em] text-[color:var(--page-fg-muted)]">
              {quality.level} confidence
            </span>
          </span>
          <span className="mt-0.5 block text-[0.8125rem] leading-relaxed text-[color:var(--page-fg-muted)]">
            {label.detail}
          </span>
        </span>

        <ChevronDown
          size={16}
          aria-hidden
          className={cn(
            "shrink-0 text-[color:var(--page-fg-muted)] transition-transform duration-300",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <m.div
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduced ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-5 border-t border-white/8 px-5 pb-5 pt-4">
              {quality.passed.length > 0 && (
                <div>
                  <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[color:var(--page-fg-muted)]">
                    Checks passed
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {quality.passed.map((item) => (
                      <li key={item} className="flex gap-2 text-[0.8125rem] leading-relaxed">
                        <Check size={13} className="mt-0.5 shrink-0 text-emerald-300" aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {quality.reasons.length > 0 && (
                <div>
                  <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[color:var(--page-fg-muted)]">
                    Checks that did not pass
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {quality.reasons.map((item) => (
                      <li
                        key={item}
                        className="flex gap-2 text-[0.8125rem] leading-relaxed text-[color:var(--page-fg-muted)]"
                      >
                        <TriangleAlert size={13} className="mt-0.5 shrink-0 text-amber-300" aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {rows.length > 0 && (
                <div>
                  <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[color:var(--page-fg-muted)]">
                    Evidence behind the headline
                  </p>
                  <dl className="mt-2 divide-y divide-white/6">
                    {rows.map(([key, value]) => (
                      <div key={key} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 py-1.5">
                        <dt className="text-[0.8125rem] text-[color:var(--page-fg-muted)]">{key}</dt>
                        <dd className="tabular text-[0.8125rem] font-semibold">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

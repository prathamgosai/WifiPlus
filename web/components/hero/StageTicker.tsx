"use client";

import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { isRunning, STAGE_ORDER, STAGES, type StageId } from "@/lib/stages";
import { cn } from "@/lib/utils";

/**
 * The activity layer: what is being measured, right now.
 * -----------------------------------------------------------------------------
 * Every row here corresponds to a phase `core/run.js` genuinely emits, and the
 * sub-items under the active row are the measurements it genuinely runs
 * CONCURRENTLY with that phase — DNS alongside the latency probes, and
 * latency-under-load alongside each throughput phase. Those were always
 * happening; the previous interface simply never said so.
 *
 * There is no "analysing" or "generating report" row. Stability and the health
 * scores are pure functions over samples already collected and return in well
 * under a millisecond, so a row for them would be a progress indicator for work
 * that is already done. See the header comment in `lib/stages.ts`.
 */

export interface StageTickerProps {
  stage: StageId;
  /** Announced to screen readers as it changes. */
  status: string;
  className?: string;
}

export function StageTicker({ stage, status, className }: StageTickerProps) {
  const reduced = useReducedMotion();
  const activeIndex = STAGE_ORDER.indexOf(stage);

  return (
    <div className={cn("relative", className)}>
      {/* The single source of truth for assistive tech. The visual list below
          is decorative duplication of it, so it is aria-hidden. */}
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>

      <ol aria-hidden className="space-y-0.5">
        {STAGE_ORDER.map((id, index) => {
          const meta = STAGES[id];
          const isActive = id === stage;
          // -1 when idle, so nothing is marked done before a run starts.
          const isPast = activeIndex > -1 && index < activeIndex;

          return (
            <li key={id}>
              <div
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors duration-300",
                  isActive && "bg-white/[0.06]",
                )}
              >
                <span
                  className={cn(
                    "grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors duration-300",
                    isPast
                      ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-300"
                      : isActive
                        ? "border-accent-400/70 bg-accent-400/15 text-accent-300"
                        : "border-white/15 text-transparent",
                  )}
                >
                  {isPast ? (
                    <Check size={9} strokeWidth={3.5} aria-hidden />
                  ) : isActive && isRunning(id) && !reduced ? (
                    <Loader2 size={9} className="animate-spin" aria-hidden />
                  ) : (
                    <span className="h-1 w-1 rounded-full bg-current" />
                  )}
                </span>

                <span
                  className={cn(
                    "text-[0.8125rem] font-medium transition-colors duration-300",
                    isActive
                      ? "text-[color:var(--page-fg)]"
                      : isPast
                        ? "text-[color:var(--page-fg-muted)]"
                        : "text-[color:var(--page-fg-muted)]/50",
                  )}
                >
                  {meta.label}
                </span>
              </div>

              {/* Concurrent work, revealed only while its parent phase runs. */}
              <AnimatePresence initial={false}>
                {isActive && meta.concurrent.length > 0 && (
                  <m.ul
                    initial={reduced ? false : { height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={reduced ? undefined : { height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden ps-8"
                  >
                    {meta.concurrent.map((item) => (
                      <li
                        key={item}
                        className="flex items-center gap-2 py-1 text-[0.75rem] text-[color:var(--page-fg-muted)]"
                      >
                        <span className="h-1 w-1 rounded-full bg-accent-400/70 motion-safe:animate-pulse" />
                        {item}
                      </li>
                    ))}
                  </m.ul>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

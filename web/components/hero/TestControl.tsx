"use client";

import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { ArrowRight, FileText, RotateCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { isRunning, STAGES, type StageId } from "@/lib/stages";
import { cn } from "@/lib/utils";

/**
 * The primary control, which is a different control in each state.
 * -----------------------------------------------------------------------------
 * One element that morphs rather than three that swap, because the button is
 * the only thing on the page the user is asked to press and it should not move
 * out from under them. `layout` on the shared container does the reshaping;
 * `AnimatePresence` handles only the contents.
 *
 * The progress bar inside the running state is the engine's own `progress`
 * (0-100 from `core/run.js`), not a timer. If a phase stalls, the bar stalls —
 * which is the honest thing for it to do.
 */

export interface TestControlProps {
  stage: StageId;
  progress: number;
  /** Percentage complete is announced, but the label names the real phase. */
  onStart: () => void;
  onCancel: () => void;
  /** Scrolls to the report. Only offered once there is a report to see. */
  onViewReport: () => void;
  className?: string;
}

export function TestControl({
  stage,
  progress,
  onStart,
  onCancel,
  onViewReport,
  className,
}: TestControlProps) {
  const reduced = useReducedMotion();
  const running = isRunning(stage);
  const done = stage === "complete";

  return (
    <m.div
      layout={!reduced}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      className={cn("flex flex-wrap items-center gap-3", className)}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {running ? (
          <m.div
            key="running"
            layout={!reduced}
            initial={reduced ? false : { opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduced ? undefined : { opacity: 0, scale: 0.94 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="glass glass-sheen flex min-w-[19rem] items-center gap-3 rounded-full py-2 pe-2 ps-5"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[0.8125rem] font-bold tracking-tight">
                {STAGES[stage]?.label ?? "Measuring"}
              </p>
              {/* Track + fill. `scaleX` on a fixed-width bar so the animation
                  stays on the compositor rather than animating `width`. */}
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full origin-left rounded-full bg-gradient-to-r from-brand to-accent transition-transform duration-200 ease-linear"
                  style={{ transform: `scaleX(${Math.max(0.02, progress / 100)})` }}
                />
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="shrink-0 rounded-full px-3"
              aria-label="Stop the test"
            >
              <Square size={13} aria-hidden />
              Stop
            </Button>
          </m.div>
        ) : done ? (
          <m.div
            key="done"
            layout={!reduced}
            initial={reduced ? false : { opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduced ? undefined : { opacity: 0, scale: 0.94 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-wrap items-center gap-3"
          >
            <Button variant="primary" size="lg" magnetic onClick={onViewReport}>
              <FileText size={16} aria-hidden />
              View your network report
              <ArrowRight size={16} aria-hidden />
            </Button>
            <Button variant="glass" size="lg" onClick={onStart}>
              <RotateCcw size={15} aria-hidden />
              Test again
            </Button>
          </m.div>
        ) : (
          <m.div
            key="idle"
            layout={!reduced}
            initial={reduced ? false : { opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduced ? undefined : { opacity: 0, scale: 0.94 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-wrap items-center gap-3"
          >
            <Button variant="primary" size="lg" magnetic onClick={onStart}>
              {stage === "error" ? "Retry test" : "Start speed test"}
              <ArrowRight size={16} aria-hidden />
            </Button>
            <Button variant="glass" size="lg" onClick={onViewReport}>
              How we measure
            </Button>
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  );
}

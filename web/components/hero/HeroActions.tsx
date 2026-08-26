"use client";

import { useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { useTestStore } from "@/store/useTestStore";
import { TestControl } from "./TestControl";

/**
 * The CTA, isolated from the rest of the hero.
 * -----------------------------------------------------------------------------
 * This subscribes to exactly two fields. During a run the store is written on
 * every metric callback — dozens of times a second — and a component that read
 * the whole state here would re-render the hero's copy, its chips and its 3D
 * stage element at that rate to move one progress bar.
 *
 * Splitting the subscription is the cheap fix, and it is why `Hero` itself does
 * not touch the store at all.
 */
export function HeroActions({ className }: { className?: string }) {
  const { stage, progress, run, cancel } = useTestStore(
    useShallow((state) => ({
      stage: state.stage,
      progress: state.progress,
      run: state.run,
      cancel: state.cancel,
    })),
  );

  const viewReport = useCallback(() => {
    const target = document.getElementById("report");
    if (!target) return;
    // `scroll-padding-top` in globals.css already clears the sticky navbar, so
    // the browser's own smooth scroll lands correctly without an offset here.
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <TestControl
      stage={stage}
      progress={progress}
      onStart={run}
      onCancel={cancel}
      onViewReport={viewReport}
      className={className}
    />
  );
}

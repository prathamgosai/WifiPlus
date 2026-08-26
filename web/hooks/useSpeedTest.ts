"use client";

import { useShallow } from "zustand/react/shallow";
import { drive, graphRef, selectRunning, useTestStore } from "@/store/useTestStore";

/**
 * React view onto the measurement run.
 *
 * The sequencing, the callbacks and the engine call itself moved to
 * `store/useTestStore.ts`; what is left here is the selector. The public shape
 * is unchanged and additive, so `DashboardScreen`, `Doctor` and `LiveGraph`
 * continue to work against it untouched — the four fields the engine has always
 * returned and the old hook silently dropped (`quality`, `evidence`,
 * `downloadBloat`, `uploadBloat`) are simply now among them.
 *
 * `useShallow` matters: without it this hook returns a fresh object every store
 * write, and a run writes on every metric callback. Every consumer would
 * re-render dozens of times a second whether or not the field it reads changed.
 */

export type { LiveGraphData, ThroughputPoint, Evidence } from "@/store/useTestStore";

export function useSpeedTest() {
  const state = useTestStore(
    useShallow((s) => ({
      result: s.result,
      scores: s.scores,
      latency: s.latency,
      bufferbloat: s.bufferbloat,
      downloadBloat: s.downloadBloat,
      uploadBloat: s.uploadBloat,
      quality: s.quality,
      evidence: s.evidence,
      uploadNote: s.uploadNote,
      error: s.error,
      phase: s.phase,
      stage: s.stage,
      progress: s.progress,
      status: s.status,
      endpointLabel: s.endpointLabel,
      run: s.run,
      cancel: s.cancel,
    })),
  );

  return {
    ...state,
    running: selectRunning(state),
    /**
     * Ref-shaped so `LiveGraph` keeps its `RefObject<LiveGraphData>` prop. The
     * buffer is module state rather than a React ref because the 3D scene reads
     * it from outside the tree.
     */
    graph: graphRef,
    /** The frame-rate channel. Read inside rAF/useFrame, never in render. */
    drive,
  };
}

export type SpeedTestApi = ReturnType<typeof useSpeedTest>;

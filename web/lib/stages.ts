/**
 * The run, as the interface tells it.
 * -----------------------------------------------------------------------------
 * One place that names what the engine is doing, so the gauge, the activity
 * ticker, the 3D scene and the screen reader announcement can never disagree
 * about which stage is on screen.
 *
 * These stages map ONE-TO-ONE onto phases `core/run.js` actually emits. That
 * constraint is doing real work. The obvious design — the eight-step ladder a
 * speed test "should" have, DISCOVERING → LATENCY → DOWNLOAD → UPLOAD →
 * STABILITY → ANALYZING → COMPLETE — cannot be built honestly here, because
 * stability and analysis are not phases: `stabilityFrom()` and
 * `qualityScores()` are pure functions over samples already collected, and they
 * return in well under a millisecond. Rendering them as stages would mean
 * holding the interface still on a timer while nothing was measured, which is
 * the definition of the theatre this product refuses elsewhere (see the note in
 * `SpeedDashboard` about there being no invented "finding server" step).
 *
 * What IS true, and is more interesting than the fake ladder, is that each
 * phase runs concurrent measurements the old UI never showed. `run.js` probes
 * DNS alongside the latency phase, and probes latency-under-load alongside BOTH
 * throughput phases. Those are the `concurrent` entries below: real work,
 * genuinely happening at that moment, that had simply never been surfaced.
 */

import type { TestPhase } from "@/types";

export type StageId = "idle" | "discovering" | "latency" | "download" | "upload" | "complete" | "error";

export interface Stage {
  id: StageId;
  /** Short label for the gauge face. */
  label: string;
  /** Sentence for the activity ticker and the live region. */
  detail: string;
  /**
   * Other measurements genuinely running during this stage. Named because they
   * are happening, not to fill the panel.
   */
  concurrent: string[];
  /** Which way data is moving, for the 3D scene. 0 when nothing is streaming. */
  direction: -1 | 0 | 1;
  /** Progress at which this stage begins, matching `PROGRESS` in core/run.js. */
  from: number;
  to: number;
}

/**
 * Boundaries mirror `PROGRESS` in `core/run.js` (latency 22, download 62,
 * upload 100). They are weighted by wall-clock cost, not by phase count.
 */
export const STAGES: Record<StageId, Stage> = {
  idle: {
    id: "idle",
    label: "Ready",
    detail: "Every figure on this page is measured live. Nothing is simulated.",
    concurrent: [],
    direction: 0,
    from: 0,
    to: 0,
  },
  discovering: {
    id: "discovering",
    label: "Selecting edge",
    detail: "Choosing the measurement edge by round-trip time.",
    // Deliberately empty and deliberately brief. With no self-hosted edge
    // registered this resolves without a single request, so the stage can be
    // gone in a frame — that is the truth about this step, and padding it out
    // would be inventing work.
    concurrent: [],
    direction: 0,
    from: 0,
    to: 0,
  },
  latency: {
    id: "latency",
    label: "Latency",
    detail: "Probing round-trip time, jitter and probe loss.",
    concurrent: ["DNS resolution timing"],
    direction: 0,
    from: 0,
    to: 22,
  },
  download: {
    id: "download",
    label: "Download",
    detail: "Measuring downstream throughput over parallel streams.",
    concurrent: ["Latency under downstream load"],
    direction: 1,
    from: 22,
    to: 62,
  },
  upload: {
    id: "upload",
    label: "Upload",
    detail: "Measuring upstream throughput.",
    concurrent: ["Latency under upstream load"],
    direction: -1,
    from: 62,
    to: 100,
  },
  complete: {
    id: "complete",
    label: "Complete",
    detail: "Stability and health scores derived from the samples above.",
    concurrent: [],
    direction: 0,
    from: 100,
    to: 100,
  },
  error: {
    id: "error",
    label: "Failed",
    detail: "The run did not produce a measurement that can be relied on.",
    concurrent: [],
    direction: 0,
    from: 0,
    to: 0,
  },
};

/** Display order for the activity ticker. `error` is a state, not a step. */
export const STAGE_ORDER: StageId[] = ["discovering", "latency", "download", "upload", "complete"];

/**
 * Bridges the engine's phase vocabulary to this one.
 *
 * `run.js` emits "select"; `useSpeedTest` widens that to the app's `TestPhase`.
 * The two extra members of `TestPhase` — "dns" and "bufferbloat" — are never
 * emitted as phases by the engine because both are measured concurrently inside
 * another phase. They are mapped to the phase they actually run inside rather
 * than being given stages of their own.
 */
export function stageFor(phase: TestPhase | "select"): Stage {
  switch (phase) {
    case "select":
      return STAGES.discovering;
    case "latency":
    case "dns":
      return STAGES.latency;
    case "download":
    case "bufferbloat":
      return STAGES.download;
    case "upload":
      return STAGES.upload;
    case "done":
      return STAGES.complete;
    case "error":
      return STAGES.error;
    default:
      return STAGES.idle;
  }
}

/** Whether a stage represents work in flight, for spinners and live regions. */
export function isRunning(id: StageId): boolean {
  return id === "discovering" || id === "latency" || id === "download" || id === "upload";
}

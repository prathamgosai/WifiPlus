"use client";

import { create } from "zustand";
import { runMeasurement } from "@core/run.js";
import { saveHistoryEntry } from "@core/history.js";
import { qualityScores } from "@/lib/scoring";
import { diagnose, hopFlags, type HopFlag } from "@/lib/doctor";
import { TestAborted, type BufferbloatResult, type LatencyResult } from "@/lib/speedtest";
import { type StageId, STAGES, stageFor } from "@/lib/stages";
import type { QualityScores, SpeedResult, TestPhase } from "@/types";
import type { QualityReport } from "@core/quality.js";
import type { ThroughputResult } from "@core/measure.js";

/**
 * The measurement run, as application state.
 * -----------------------------------------------------------------------------
 * This replaces the local `useState` cluster that used to live inside
 * `useSpeedTest`. The move is not stylistic — it buys two specific things that
 * were not available before:
 *
 * 1. ONE source of truth. `useSpeedTest()` was called in two places (the
 *    marketing provider and the dashboard screen), each getting its own private
 *    copy of the run. A store makes those the same run.
 *
 * 2. A frame-rate channel that does not touch React. The engine reports
 *    throughput dozens of times a second. Pushing that through React state to
 *    drive a 3D scene would re-render the tree at 25 Hz to move some particles,
 *    which is how a 60fps budget is spent. `drive` below is a plain mutable
 *    object read inside `useFrame` — see the note on it.
 *
 * What has NOT changed is where the numbers come from. `runMeasurement` in
 * `core/run.js` is called with the same callbacks it was called with before,
 * and every figure here is one it reported. Nothing in this file computes,
 * smooths or invents a measurement.
 */

/** One throughput reading on the run-relative timeline (ms then Mbps). */
export interface ThroughputPoint {
  t: number;
  v: number;
}

/** Live sample buffer for the real-time graph. */
export interface LiveGraphData {
  down: ThroughputPoint[];
  up: ThroughputPoint[];
  startAt: number;
}

/**
 * The bytes, spans and probe counts each headline figure was derived from.
 *
 * `core/run.js` carries this out of the engine deliberately - "without it
 * nothing downstream can check the headline, which is the whole reason a result
 * can claim to be verified at all" - and the previous hook dropped it on the
 * floor. Typed here so the provenance UI can read it.
 */
export interface Evidence {
  download: ThroughputResult;
  upload: ThroughputResult | null;
  idleProbes: number;
  downloadLoadedProbes: number;
  uploadLoadedProbes: number;
  protocol: string | null;
}

const EMPTY_RESULT: SpeedResult = {
  download: null,
  upload: null,
  ping: null,
  jitter: null,
  loss: null,
  dns: null,
  stability: null,
};

/* ---------------------------------------------------------------------------
   The frame-rate channel
   ------------------------------------------------------------------------ */

/**
 * Values the 3D scene reads every frame, held OUTSIDE the store on purpose.
 *
 * This object is mutated in place and never replaced, so nothing subscribes to
 * it and nothing re-renders when it changes. `NetworkScene` reads it inside
 * `useFrame`, which is already running at display rate - it needs the latest
 * value at the moment it draws, not a notification that the value changed.
 *
 * Every field is derived from a real reading. `flow` in particular is the live
 * throughput normalised against its own running ceiling, so the particles move
 * at a speed that means something rather than at a speed that looks busy.
 */
export interface Drive {
  /** 1 downstream, -1 upstream, 0 when nothing is streaming. */
  direction: -1 | 0 | 1;
  /** Live throughput, normalised 0-1 against the running ceiling. */
  flow: number;
  /** Overall activity, 0 idle to 1 saturated. Drives glow and particle speed. */
  intensity: number;
  /** Increments once per returned latency probe, so the scene pulses on real RTTs. */
  pulse: number;
  /**
   * Final health score 0-1, once a run completes. The scene reads this to tint
   * the hop cores at the end of a run, so the settled colour encodes the
   * measured verdict rather than being a fixed "finished" green.
   */
  health: number;

  /**
   * Per-hop verdicts, so the scene can point at the ONE hop the diagnosis
   * actually implicates instead of tinting all five with the same overall
   * health — which is the literal opposite of a bottleneck finding, the scene
   * answering "everywhere, equally".
   *
   * Indexed as `topology.ts` NODES; 0 = no verdict, 1 = ok, 2 = suspect,
   * 3 = measured but unjudgeable. Written once per run, never per frame.
   */
  hopFlags: HopFlag[];

  /**
   * The same, per LINK. Not redundant: `bottleneck()` flags a `wifi` hop more
   * often than any other, and the wireless leg is the device→router SEGMENT
   * rather than a node — so the commonest diagnosis this engine makes has no
   * node to live on. See `hopFlags()` in lib/doctor.ts.
   */
  linkFlags: HopFlag[];
}

/* `progress` is deliberately NOT here. It is already React state, it changes a
   few times a second rather than per frame, and nothing in the scene consumes
   it — a field on this channel that no `useFrame` reads is just a write on the
   hot path plus a comment promising something that does not happen. */

export const drive: Drive = {
  direction: 0,
  flow: 0,
  intensity: 0,
  pulse: 0,
  health: 0,
  hopFlags: [0, 0, 0, 0, 0],
  linkFlags: [0, 0, 0, 0],
};

/**
 * Sample buffer for the live graph, exposed with a ref-shaped wrapper so the
 * existing `LiveGraph` component keeps its `RefObject<LiveGraphData>` prop and
 * needs no change. It reads `graph.current` on its own rAF loop, exactly as
 * before.
 */
export const graphRef: { current: LiveGraphData } = {
  current: { down: [], up: [], startAt: 0 },
};

/** Ceiling used to normalise `flow`. Grows with the reading, never shrinks. */
let flowCeiling = 100;

/* ---------------------------------------------------------------------------
   Store
   ------------------------------------------------------------------------ */

export interface TestState {
  phase: TestPhase;
  stage: StageId;
  progress: number;
  status: string;
  endpointLabel: string;

  result: SpeedResult;
  scores: QualityScores | null;
  latency: LatencyResult | null;

  /** The worse of the two directions - what actually describes the connection. */
  bufferbloat: BufferbloatResult | null;
  /** Latency added while the link is saturated downstream. */
  downloadBloat: BufferbloatResult | null;
  /** Latency added while the link is saturated upstream. Often the worse one. */
  uploadBloat: BufferbloatResult | null;

  /** The grade the run gives itself. Previously computed by the engine and discarded. */
  quality: QualityReport | null;
  /** What every headline figure was derived from. Also previously discarded. */
  evidence: Evidence | null;

  /** Why upload is null, when it is. */
  uploadNote: string | null;
  error: string | null;

  run: () => Promise<void>;
  cancel: () => void;
}

/** Guards against a stale run writing over a newer one after cancellation. */
let token = 0;
let controller: AbortController | null = null;

export const useTestStore = create<TestState>((set) => ({
  phase: "idle",
  stage: "idle",
  progress: 0,
  status: STAGES.idle.detail,
  endpointLabel: "Nearest edge",

  result: EMPTY_RESULT,
  scores: null,
  latency: null,
  bufferbloat: null,
  downloadBloat: null,
  uploadBloat: null,
  quality: null,
  evidence: null,
  uploadNote: null,
  error: null,

  cancel() {
    token += 1;
    controller?.abort();
    controller = null;
    drive.direction = 0;
    drive.flow = 0;
    drive.intensity = 0;
    set({ phase: "idle", stage: "idle", progress: 0, status: STAGES.idle.detail, error: null });
  },

  async run() {
    controller?.abort();
    const mine = (token += 1);
    controller = new AbortController();
    const { signal } = controller;
    /** A write from a run the user has already replaced must not land. */
    const current = () => token === mine;

    /* Conditions the engine cannot observe from inside itself, which
       `measurementQuality` uses to cap confidence. The previous hook never
       passed these, so a run taken in a backgrounded tab - where the browser
       throttles timers and network - was graded as though it had not been. */
    let hiddenDuringRun = document.visibilityState === "hidden";
    let wentOffline = typeof navigator.onLine === "boolean" ? !navigator.onLine : false;
    const onHide = () => {
      if (document.visibilityState === "hidden") hiddenDuringRun = true;
    };
    const onOffline = () => {
      wentOffline = true;
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("offline", onOffline);

    set({
      result: EMPTY_RESULT,
      scores: null,
      latency: null,
      bufferbloat: null,
      downloadBloat: null,
      uploadBloat: null,
      quality: null,
      evidence: null,
      uploadNote: null,
      error: null,
      progress: 0,
      phase: "latency",
      stage: "discovering",
      status: STAGES.discovering.detail,
      endpointLabel: "Selecting best edge...",
    });

    graphRef.current = { down: [], up: [], startAt: performance.now() };
    flowCeiling = 100;
    drive.health = 0;
    drive.pulse = 0;
    drive.intensity = 0.35;
    // Last run's verdicts must not survive into this one.
    drive.hopFlags = [0, 0, 0, 0, 0];
    drive.linkFlags = [0, 0, 0, 0];

    let lastDown = 0;
    let lastUp = 0;

    /** Keeps the graph buffer to ~25 Hz however fast the link reports. */
    const sample = (into: ThroughputPoint[], last: number, mbps: number): number => {
      const now = performance.now();
      if (now - last <= 40) return last;
      into.push({ t: now - graphRef.current.startAt, v: mbps });
      return now;
    };

    /** Normalises a live reading onto 0-1 for the scene. Ceiling only grows. */
    const toFlow = (mbps: number): number => {
      if (mbps > flowCeiling) flowCeiling = mbps * 1.15;
      return Math.max(0, Math.min(1, mbps / flowCeiling));
    };

    try {
      const outcome = await runMeasurement(
        {
          onPhase: (next) => {
            if (!current()) return;
            const stage = stageFor(next);
            drive.direction = stage.direction;
            // "select" is a real phase but not a member of `TestPhase`; the
            // stage carries it so the interface can show it for exactly as long
            // as it lasts, without inventing a `TestPhase` the engine never emits.
            if (next === "select") {
              set({ stage: stage.id, status: stage.detail });
              return;
            }
            set({ phase: next as TestPhase, stage: stage.id, status: stage.detail });
          },
          onEdge: (label) => {
            if (current()) set({ endpointLabel: label });
          },
          onFallback: (failed) => {
            // Announced, not swallowed. A number measured against a different
            // server than the one on screen is a number the user was misled about.
            if (current()) {
              set({ status: `${failed.name} did not respond - falling back to the next edge...` });
            }
          },
          onProgress: (percent) => {
            if (current()) set({ progress: percent });
          },
          onMetric: (patch) => {
            if (current()) set((state) => ({ result: { ...state.result, ...patch } }));
          },
          onLatencyProbe: () => {
            /*
             * One pulse per probe ATTEMPT — paced by real network activity
             * rather than by a timer, which is the honest claim.
             *
             * It is NOT "one pulse per probe that returned", as this comment
             * used to say. `core/measure.js` fires onSample at the end of every
             * iteration including failures, and passes the most recent
             * SUCCESSFUL round trip, so a lost probe is indistinguishable from
             * a returned one here. Distinguishing them would mean changing the
             * engine, which is out of bounds.
             */
            drive.pulse += 1;
          },
          onDownloadSample: (mbps) => {
            lastDown = sample(graphRef.current.down, lastDown, mbps);
            drive.flow = toFlow(mbps);
            drive.intensity = 0.45 + drive.flow * 0.55;
          },
          onUploadSample: (mbps) => {
            lastUp = sample(graphRef.current.up, lastUp, mbps);
            drive.flow = toFlow(mbps);
            drive.intensity = 0.45 + drive.flow * 0.55;
          },
          onLatencyDetail: (detail) => {
            if (current()) set({ latency: detail });
          },
          onBufferbloat: (bloat) => {
            if (current()) set({ downloadBloat: bloat });
          },
          onUploadBufferbloat: (bloat) => {
            if (current()) set({ uploadBloat: bloat });
          },
        },
        signal,
        { hiddenDuringRun, wentOffline },
      );

      if (!current()) return;

      const computed = qualityScores(outcome.result);
      drive.direction = 0;
      drive.flow = 0;
      drive.intensity = 0.3;
      drive.health = computed ? computed.health / 100 : 0;

      /*
       * Per-hop verdicts, from the SAME `diagnose()` the Network Doctor renders
       * — so the hop the scene highlights and the hop the report names can
       * never disagree.
       *
       * Order matters: this must land BEFORE the `set()` below flips the stage
       * to "complete", because the scene reacts to that stage change and would
       * otherwise colour the cores from the previous run's verdicts for a frame.
       */
      const diagnosis = diagnose(outcome.result, outcome.bufferbloat, {
        degraded: outcome.quality.level === "low",
        edgeLabel: outcome.edgeLabel,
      });
      if (diagnosis) {
        const flags = hopFlags(diagnosis.hops);
        drive.hopFlags = flags.nodes;
        drive.linkFlags = flags.links;
      }

      set({
        result: outcome.result,
        scores: computed,
        latency: outcome.latency,
        bufferbloat: outcome.bufferbloat,
        downloadBloat: outcome.downloadBloat,
        uploadBloat: outcome.uploadBloat,
        quality: outcome.quality,
        evidence: outcome.evidence as Evidence,
        uploadNote: outcome.uploadNote,
        phase: "done",
        stage: "complete",
        progress: 100,
        status: outcome.uploadNote
          ? `Finished, but upload could not be measured: ${outcome.uploadNote}. Every other figure is from this run.`
          : computed
            ? `Finished. Connection score ${computed.health}/100.`
            : STAGES.complete.detail,
      });

      saveHistoryEntry({
        at: Date.now(),
        download: outcome.result.download,
        upload: outcome.result.upload,
        ping: outcome.result.ping,
        // The edge that actually served the run, which after a fallback is not
        // the one selected at the start.
        edgeCity: outcome.edgeLabel,
      });
    } catch (error) {
      if (error instanceof TestAborted || !current()) return;
      drive.direction = 0;
      drive.flow = 0;
      drive.intensity = 0;
      const message = (error as Error).message;
      set({
        phase: "error",
        stage: "error",
        progress: 0,
        error: message,
        status: `Test failed: ${message}`,
      });
    } finally {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("offline", onOffline);
      if (current()) controller = null;
    }
  },
}));

/**
 * True while the engine is mid-run.
 *
 * Takes only the field it reads rather than the whole `TestState`, so callers
 * holding a narrowed selection can pass it without a cast.
 */
export const selectRunning = ({ phase }: { phase: TestPhase }): boolean =>
  phase !== "idle" && phase !== "done" && phase !== "error";

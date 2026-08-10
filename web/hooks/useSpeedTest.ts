"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type BufferbloatResult, type LatencyResult, TestAborted } from "@/lib/speedtest";
import { runMeasurement } from "@core/run.js";
import { qualityScores } from "@/lib/scoring";
import { saveHistoryEntry } from "@core/history.js";
import type { QualityScores, SpeedResult, TestPhase } from "@/types";

const EMPTY: SpeedResult = {
  download: null,
  upload: null,
  ping: null,
  jitter: null,
  loss: null,
  dns: null,
  stability: null,
};

/** One throughput reading on the run-relative timeline (ms → Mbps). */
export interface ThroughputPoint {
  t: number;
  v: number;
}

/**
 * Live sample buffer for the real-time graph. Held in a ref, not state, so the
 * ~25 Hz of samples never re-render React — the canvas reads it on its own rAF
 * loop. These are the exact values the throughput measurement reports as it
 * runs, so the graph plots real data, not an animation.
 */
export interface LiveGraphData {
  down: ThroughputPoint[];
  up: ThroughputPoint[];
  startAt: number;
}

const PHASE_COPY: Record<TestPhase, string> = {
  idle: "Ready when you are. Every value is measured live — nothing is simulated.",
  latency: "Measuring ping, jitter, percentiles, packet loss and DNS…",
  download: "Measuring download and latency under load…",
  upload: "Measuring upload throughput…",
  dns: "Checking DNS response and stability…",
  bufferbloat: "Measuring latency under load (bufferbloat)…",
  done: "Test complete.",
  error: "Test failed.",
};

/**
 * Drives the measurement engine and exposes it as React state.
 *
 * Progress is split across the run so the bar advances continuously:
 *   latency 0-25% · download 25-60% · upload 60-90% · dns 90-100%
 */
export function useSpeedTest() {
  const [result, setResult] = useState<SpeedResult>(EMPTY);
  const [scores, setScores] = useState<QualityScores | null>(null);
  const [latency, setLatency] = useState<LatencyResult | null>(null);
  const [bufferbloat, setBufferbloat] = useState<BufferbloatResult | null>(null);
  const [phase, setPhase] = useState<TestPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState(PHASE_COPY.idle);
  const [endpointLabel, setEndpointLabel] = useState("Nearest edge");

  const abortRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const graph = useRef<LiveGraphData>({ down: [], up: [], startAt: 0 });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Six in-flight download streams must not outlive the component.
      abortRef.current?.abort();
    };
  }, []);

  const running = phase !== "idle" && phase !== "done" && phase !== "error";

  const run = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    const patch = (next: Partial<SpeedResult>) => {
      if (mounted.current) setResult((prev) => ({ ...prev, ...next }));
    };

    setResult(EMPTY);
    setScores(null);
    setLatency(null);
    setBufferbloat(null);
    setProgress(0);
    setEndpointLabel("Selecting best edge...");
    setPhase("latency");
    setStatus(PHASE_COPY.latency);

    // Fresh sample buffer for the live graph. Throttled to ~25 Hz so a fast link
    // (hundreds of progress callbacks/sec) doesn't bloat the arrays.
    graph.current = { down: [], up: [], startAt: performance.now() };
    let lastDownSample = 0;
    let lastUpSample = 0;

    /** Keeps the graph to ~25 Hz whichever direction is reporting. */
    const sample = (into: ThroughputPoint[], last: number, mbps: number): number => {
      const now = performance.now();
      if (now - last <= 40) return last;
      into.push({ t: now - graph.current.startAt, v: mbps });
      return now;
    };

    try {
      // Sequencing, edge selection and failover live in core/run.js, which the
      // static site drives too. Everything here is React state and wording.
      const outcome = await runMeasurement(
        {
          onPhase: (next) => {
            if (!mounted.current) return;
            // "select" has no tile of its own; the edge label already says it.
            if (next === "select") return;
            setPhase(next as TestPhase);
            setStatus(PHASE_COPY[next as TestPhase] ?? PHASE_COPY.latency);
          },
          onEdge: (label) => {
            if (mounted.current) setEndpointLabel(label);
          },
          onFallback: (failed) => {
            // Announced, not swallowed. A number measured against a different
            // server than the one on screen is a number the user was misled about.
            if (mounted.current) {
              setStatus(`${failed.name} did not respond — falling back to the next edge…`);
            }
          },
          onProgress: (percent) => {
            if (mounted.current) setProgress(percent);
          },
          // Streamed as they are measured, so the tiles fill in during the run
          // instead of staying blank. Every value is a real reading.
          onMetric: patch,
          onDownloadSample: (mbps) => {
            lastDownSample = sample(graph.current.down, lastDownSample, mbps);
          },
          onUploadSample: (mbps) => {
            lastUpSample = sample(graph.current.up, lastUpSample, mbps);
          },
          onLatencyDetail: (detail) => {
            if (mounted.current) setLatency(detail);
          },
          onBufferbloat: (bloat) => {
            if (mounted.current) setBufferbloat(bloat);
          },
        },
        signal,
      );

      if (!mounted.current) return;
      setResult(outcome.result);
      const computed = qualityScores(outcome.result);
      setScores(computed);
      saveHistoryEntry({
        at: Date.now(),
        download: outcome.result.download,
        upload: outcome.result.upload,
        ping: outcome.result.ping,
        // The edge that actually served the run, which after a fallback is not
        // the one selected at the start. A history row labelled with an edge
        // that never answered would make past runs uncomparable with this one.
        edgeCity: outcome.edgeLabel,
      });
      setPhase("done");
      // A metric that could not be measured is stated, not left as a dash for
      // the user to read as zero.
      setStatus(
        outcome.uploadNote
          ? `Finished, but upload could not be measured: ${outcome.uploadNote}. Every other figure is from this run.`
          : computed
            ? `Finished. WiFi health score ${computed.health}/100 — result card and sharing are ready.`
            : PHASE_COPY.done,
      );
    } catch (error) {
      if (error instanceof TestAborted || !mounted.current) return;
      setProgress(0);
      setPhase("error");
      setStatus(`Test failed: ${(error as Error).message}. Check your connection and try again.`);
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setPhase("idle");
    setProgress(0);
    setStatus(PHASE_COPY.idle);
  }, []);

  return {
    result,
    scores,
    latency,
    bufferbloat,
    graph,
    phase,
    progress,
    status,
    endpointLabel,
    running,
    run,
    cancel,
  };
}

export type SpeedTestApi = ReturnType<typeof useSpeedTest>;

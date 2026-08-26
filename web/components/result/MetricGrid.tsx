"use client";

import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Globe2,
  Radio,
  ShieldAlert,
  Waves,
  Zap,
} from "lucide-react";
import { MetricCard } from "@/components/gauge/MetricCard";
import type { BufferbloatResult } from "@/lib/speedtest";
import type { SpeedResult, TestPhase } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Every measurement from the run, as cards.
 * -----------------------------------------------------------------------------
 * Composed from the existing `MetricCard`, which already gets the two things
 * that matter right: it eases the number on its own rAF loop so a value landing
 * mid-test counts up rather than snapping, and it draws a sparkline ONLY where
 * the engine recorded a series. Metrics the engine records once — loss, DNS,
 * stability, bufferbloat — get no trend line, because a decorative squiggle
 * would be simulated data on a page whose whole claim is that nothing is.
 *
 * The `hint` on each card is where the honesty lives, and several of them are
 * load-bearing corrections to what a reader would otherwise assume:
 *   · "Packet loss" is probe loss, not true packet loss — TCP hides that by
 *     resending, and a browser never sees it.
 *   · "DNS" is a DNS-over-HTTPS lookup through Cloudflare, not the system
 *     resolver the operating system would actually use.
 */

const BUFFERBLOAT_TONE: Record<string, string> = {
  "A+": "text-emerald-300",
  A: "text-emerald-300",
  B: "text-accent-300",
  C: "text-amber-300",
  D: "text-amber-300",
  F: "text-rose-300",
};

export interface MetricGridProps {
  result: SpeedResult;
  bufferbloat: BufferbloatResult | null;
  phase: TestPhase;
  /** Real recorded throughput samples from the engine's own buffer. */
  downSeries: number[];
  upSeries: number[];
  className?: string;
}

export function MetricGrid({
  result,
  bufferbloat,
  phase,
  downSeries,
  upSeries,
  className,
}: MetricGridProps) {
  return (
    <div className={cn("grid grid-cols-2 gap-2.5 sm:grid-cols-4", className)}>
      <MetricCard
        index={0}
        label="Download"
        value={result.download}
        unit="Mbps"
        icon={ArrowDownToLine}
        tone="text-accent-300"
        sparkColor="#22d3ee"
        series={downSeries}
        live={phase === "download"}
        hint="Measured. Sustained throughput from the nearest edge, over parallel streams, with the congestion-window ramp excluded."
      />
      <MetricCard
        index={1}
        label="Upload"
        value={result.upload}
        unit="Mbps"
        icon={ArrowUpFromLine}
        tone="text-brand-300"
        sparkColor="#8184f3"
        series={upSeries}
        live={phase === "upload"}
        hint="Measured. Bytes the edge acknowledged receiving. Null when the uplink was too slow to complete a chunk inside the window."
      />
      <MetricCard
        index={2}
        label="Latency"
        value={result.ping}
        unit="ms"
        digits={0}
        icon={Radio}
        tone="text-emerald-300"
        sparkColor="#6ee7b7"
        live={phase === "latency"}
        hint="Measured. Median round trip over HTTP — not ICMP ping, which a browser cannot send."
      />
      <MetricCard
        index={3}
        label="Jitter"
        value={result.jitter}
        unit="ms"
        icon={Waves}
        tone="text-fuchsia-300"
        sparkColor="#e879f9"
        hint="Measured. Mean absolute change between consecutive round trips — how steady the latency is, not how low."
      />
      <MetricCard
        index={4}
        label="Probe loss"
        value={result.loss}
        unit="%"
        icon={ShieldAlert}
        tone="text-rose-300"
        sparkColor="#fda4af"
        hint="Measured, but not what it sounds like: this is the share of latency probes that never returned. True packet loss is invisible to a browser because TCP resends silently."
      />
      <MetricCard
        index={5}
        label="DNS"
        value={result.dns}
        unit="ms"
        digits={0}
        icon={Globe2}
        tone="text-sky-300"
        sparkColor="#7dd3fc"
        hint="Measured against Cloudflare's DNS-over-HTTPS resolver. This is NOT your system resolver, which the page has no access to."
      />
      <MetricCard
        index={6}
        label="Stability"
        value={result.stability}
        unit="%"
        digits={0}
        icon={Activity}
        tone="text-teal-300"
        sparkColor="#5eead4"
        hint="Inferred. Derived from the observed latency spread, jitter, probe loss and throughput variance of this run."
      />
      <MetricCard
        index={7}
        label="Bufferbloat"
        value={bufferbloat ? bufferbloat.increase : null}
        display={bufferbloat?.grade}
        unit={bufferbloat ? `+${bufferbloat.increase} ms` : "grade"}
        icon={Zap}
        tone={bufferbloat ? (BUFFERBLOAT_TONE[bufferbloat.grade] ?? "text-white") : "text-white"}
        sparkColor="#fbbf24"
        hint="Measured. How far latency rose while the link was saturated, taken as the worse of the download and upload directions."
      />
    </div>
  );
}

"use client";

import { m, useReducedMotion } from "framer-motion";
import { Info, Server } from "lucide-react";
import { useSpeedTest } from "@/hooks/useSpeedTest";
import { useNetInfo } from "@/hooks/useNetInfo";
import { isRunning, STAGES } from "@/lib/stages";
import { SpeedGauge } from "./SpeedGauge";
import { StageTicker } from "./StageTicker";
import { cn } from "@/lib/utils";

/**
 * The instrument panel: the dial, what it is currently measuring, and against what.
 * -----------------------------------------------------------------------------
 * WHAT THE DIAL SHOWS depends on the phase, and it shows the real reading for
 * that phase rather than holding a stale one. During the latency probes there
 * is no throughput yet, so it reports round-trip time in ms on its own scale —
 * a dial pinned at zero through the first quarter of the run would be reporting
 * a speed of zero, which is a measurement nobody took.
 *
 * Values are null until measured, and null renders as an em dash. That rule is
 * enforced in `SpeedGauge` and is the reason nothing here substitutes a zero.
 */
export function GaugePanel({ className }: { className?: string }) {
  const { result, phase, stage, progress, endpointLabel, running } = useSpeedTest();
  const { info } = useNetInfo();
  const reduced = useReducedMotion();

  const meta = STAGES[stage] ?? STAGES.idle;

  /* Which measurement the dial is reporting. Upload and latency each own the
     dial while their phase runs; everything else shows download, which is the
     figure the result is headlined with. */
  const onLatency = phase === "latency";
  const onUpload = phase === "upload";

  const value = onLatency ? result.ping : onUpload ? result.upload : result.download;
  const mode = onLatency ? "latency" : "throughput";
  const unit = onLatency ? "ms" : "Mbps";

  return (
    <m.div
      // A long blur-in is exactly the motion someone disables it for, and it
      // delays the primary instrument of the page.
      initial={reduced ? false : { opacity: 0, y: 34, scale: 0.97, filter: "blur(14px)" }}
      animate={reduced ? undefined : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
      className={cn("relative", className)}
    >
      {/* Bloom behind the panel so it reads as lit from within. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-10 -z-10 rounded-[3.5rem] opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(58% 58% at 50% 34%, color-mix(in oklab, var(--color-brand) 48%, transparent), transparent 72%)",
        }}
      />

      <div className="glass-strong glass-sheen gradient-ring-always relative overflow-hidden rounded-[var(--radius-glass-lg)] p-5 sm:p-7">
        {/* ---- Header: what, and against which edge --------------------- */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                running ? "bg-accent-400 motion-safe:animate-pulse" : "bg-white/25",
              )}
            />
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-[color:var(--page-fg-muted)]">
              {running ? "Measuring live" : "Live measurement"}
            </p>
          </div>

          {/* Not a dropdown: with no self-hosted edges registered there is
              exactly one endpoint, and a picker offering choices that do not
              exist would be a lie. It becomes a real selector the moment edges
              are configured in lib/servers.ts. */}
          <span className="glass-subtle inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[0.6875rem] font-semibold">
            <Server size={12} className="text-accent-300" aria-hidden />
            <span className="text-[color:var(--page-fg-muted)]">Auto</span>
            <span className="max-w-[11rem] truncate">{endpointLabel}</span>
            {(info?.edgeCity || info?.colo) && (
              <span className="hidden text-[color:var(--page-fg-muted)] sm:inline">
                {info.edgeCity ?? info.colo}
              </span>
            )}
          </span>
        </div>

        {/* ---- Dial + activity ------------------------------------------ */}
        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_13rem] lg:gap-6">
          <SpeedGauge
            value={value}
            mode={mode}
            unit={unit}
            stage={stage}
            label={meta.label}
            progress={progress}
            active={isRunning(stage)}
            className="mx-auto w-full max-w-[560px]"
          />

          <div className="lg:border-s lg:border-white/8 lg:ps-5">
            <p className="text-[0.625rem] font-bold uppercase tracking-[0.16em] text-[color:var(--page-fg-muted)]">
              Activity
            </p>
            <StageTicker stage={stage} status={STAGES[stage]?.detail ?? ""} className="mt-2.5" />

            <p className="mt-4 flex gap-1.5 text-[0.75rem] leading-relaxed text-[color:var(--page-fg-muted)]">
              <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                Every figure is measured in this browser as the test runs. Nothing on this dial is
                simulated or replayed.
              </span>
            </p>
          </div>
        </div>
      </div>
    </m.div>
  );
}

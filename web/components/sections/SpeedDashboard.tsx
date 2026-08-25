"use client";

import { m, useReducedMotion } from "framer-motion";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Gauge as GaugeIcon,
  Globe2,
  ImageDown,
  Link2,
  Loader2,
  Radio,
  Server,
  Share2,
  ShieldAlert,
  StopCircle,
  Waves,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { MetricCard } from "@/components/gauge/MetricCard";
import { SpeedGauge } from "@/components/gauge/SpeedGauge";
import { ConnectionInline } from "./ConnectionStrip";
import { LiveGraph } from "./LiveGraph";
import { useNetInfo } from "@/hooks/useNetInfo";
import { useSpeedTestContext } from "@/components/providers/SpeedTestProvider";
import { downloadResultCard, shareResult } from "@/lib/result-card";
import { bufferbloatVerdict, healthVerdict } from "@/lib/scoring";
import { cn } from "@/lib/utils";
import type { TestPhase } from "@/types";

const BUFFERBLOAT_TONE: Record<string, string> = {
  "A+": "text-emerald-300",
  A: "text-emerald-300",
  B: "text-accent-300",
  C: "text-amber-300",
  D: "text-amber-300",
  F: "text-rose-300",
};

/**
 * Stage captions for the dial. These name the phase the engine is genuinely in —
 * there is no invented "finding server" step, because with no self-hosted
 * servers configured the endpoint resolves instantly and inventing a delay to
 * show a caption would be theatre at the user's expense.
 */
const STAGE: Record<TestPhase, string> = {
  idle: "Ready",
  latency: "Testing latency",
  download: "Testing download",
  upload: "Testing upload",
  dns: "Checking DNS",
  bufferbloat: "Latency under load",
  done: "Complete",
  error: "Test failed",
};

/**
 * The product's core surface: a 180° dial driven by the live measurement, with
 * every metric beside it.
 *
 * This is a UI layer only. It reads `useSpeedTestContext()` — the same engine
 * the previous layout used, unchanged — so throughput, latency percentiles,
 * bufferbloat grading and the result card all behave exactly as before.
 */
export function SpeedDashboard() {
  const {
    result,
    scores,
    latency,
    bufferbloat,
    graph,
    progress,
    status,
    endpointLabel,
    running,
    phase,
    run,
    cancel,
  } =
    useSpeedTestContext();
  const { info } = useNetInfo();
  const [toast, setToast] = useState<string | null>(null);
  const reduced = useReducedMotion();

  const hasResult = result.download !== null;

  /* What the dial shows depends on the phase. During the latency probes there is
     no throughput yet, so it reports the real round trip in ms rather than a
     placeholder zero. */
  const onUpload = phase === "upload";
  const onLatency = phase === "latency";
  const gaugeValue = onLatency
    ? (result.ping ?? null)
    : onUpload
      ? (result.upload ?? null)
      : (result.download ?? null);
  const gaugeUnit = onLatency ? "ms" : "Mbps";

  /* Sparklines come from the engine's own sample buffer — the exact values the
     measurement reported as it ran. Metrics the engine records once (loss, DNS,
     stability) get no sparkline: a decorative trend line would be simulated
     data, which is the one thing this product promises never to show. */
  const downSeries = graph.current.down.map((point) => point.v);
  const upSeries = graph.current.up.map((point) => point.v);

  const onShare = async () => {
    const message = await shareResult(result);
    if (message) {
      setToast(message);
      window.setTimeout(() => setToast(null), 2600);
    }
  };

  const onCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href.split("#")[0] ?? "");
      setToast("Link copied.");
    } catch {
      // Clipboard is unavailable on insecure origins; say so rather than failing
      // silently on a button the user just pressed.
      setToast("Clipboard blocked by the browser.");
    }
    window.setTimeout(() => setToast(null), 2400);
  };

  return (
    <m.div
      // A one-second blur-in is exactly the kind of motion someone disables it
      // for, and it delays the primary control of the page.
      initial={reduced ? false : { opacity: 0, y: 40, scale: 0.96, filter: "blur(18px)" }}
      animate={reduced ? undefined : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.35 }}
      className="relative"
    >
      {/* Bloom behind the panel so it reads as lit from within. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-8 -z-10 rounded-[3rem] opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 30%, color-mix(in oklab, var(--color-brand) 45%, transparent), transparent 70%)",
        }}
      />

      <div className="glass-strong glass-sheen gradient-ring-always relative overflow-hidden rounded-[var(--radius-glass-lg)] p-5 sm:p-7">
        {/* ---- Header ----------------------------------------------------- */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand to-accent">
              <GaugeIcon size={17} className="text-white" aria-hidden />
              {running && !reduced && (
                <span className="animate-pulse-ring absolute inset-0 rounded-xl border border-accent-400/70" />
              )}
            </span>
            <div>
              <p className="font-display text-sm font-bold tracking-tight">Live measurement</p>
              <ConnectionInline />
            </div>
          </div>

          {/* Server indicator. Not a dropdown: with no self-hosted servers
              registered there is exactly one endpoint, and a picker offering
              choices that do not exist would be a lie. It becomes a real
              selector the moment servers are configured in lib/servers.ts. */}
          <span className="glass-subtle inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[0.6875rem] font-semibold">
            <Server size={12} className="text-accent-300" aria-hidden />
            <span className="text-[color:var(--page-fg-muted)]">Auto</span>
            <span>{endpointLabel}</span>
            {(info?.edgeCity || info?.colo) && (
              <span className="hidden text-[color:var(--page-fg-muted)] sm:inline">
                {info.edgeCity ?? info.colo}
              </span>
            )}
          </span>
        </div>

        {/* ---- Dial (65%) + metrics (35%) --------------------------------- */}
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)]">
          <section className="glass-subtle relative overflow-hidden rounded-2xl p-4 pb-2 sm:p-5 sm:pb-3">
            <SpeedGauge
              value={gaugeValue}
              unit={gaugeUnit}
              stage={STAGE[phase]}
              active={running}
              className="mx-auto max-w-[520px]"
            />

            {/* Progress across the whole run, under the dial. */}
            <div
              className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Speed test progress"
            >
              <m.span
                className="absolute inset-y-0 start-0 rounded-full"
                style={{ background: "linear-gradient(90deg, #3b82f6, #22d3ee 45%, #ec4899)" }}
                animate={{ width: `${progress}%` }}
                transition={{ ease: "easeOut", duration: 0.35 }}
              />
            </div>
          </section>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-2">
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
              hint="Sustained throughput from the nearest edge node."
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
              live={onUpload}
              hint="How fast data leaves your network."
            />
            <MetricCard
              index={2}
              label="Ping"
              value={result.ping}
              unit="ms"
              digits={0}
              icon={Radio}
              tone="text-emerald-300"
              sparkColor="#6ee7b7"
              live={onLatency}
              hint="Median round trip. Lower is better for games and calls."
            />
            <MetricCard
              index={3}
              label="Jitter"
              value={result.jitter}
              unit="ms"
              icon={Waves}
              tone="text-fuchsia-300"
              sparkColor="#e879f9"
              hint="How consistent that latency stays over time."
            />
            <MetricCard
              index={4}
              label="Packet loss"
              value={result.loss}
              unit="%"
              icon={ShieldAlert}
              tone="text-rose-300"
              sparkColor="#fda4af"
              hint="Share of latency probes that never came back. A browser cannot observe true packet loss, which TCP hides by resending."
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
              hint="Uncached lookup through Cloudflare's DNS-over-HTTPS resolver, not your system's."
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
              hint="Derived from jitter, loss and latency variance."
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
              hint="How far latency rises while the link is saturated."
            />
          </div>
        </div>

        {/* ---- Live throughput graph (real samples, 60 FPS) --------------- */}
        {(running || hasResult) && (
          <div className="glass-subtle mt-3 h-32 overflow-hidden rounded-2xl p-1.5 sm:h-40">
            <LiveGraph graph={graph} running={running} phase={phase} />
          </div>
        )}

        {/* ---- Latency distribution + bufferbloat detail ------------------ */}
        {(latency || bufferbloat) && (
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {latency && (
              <div className="glass-subtle rounded-2xl p-3.5">
                <p className="mb-2 text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--page-fg-muted)]">
                  Latency distribution · {latency.samples.length} probes
                </p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    ["Min", latency.min],
                    ["Median", latency.ping],
                    ["p95", latency.p95],
                    ["Max", latency.max],
                  ].map(([label, val]) => (
                    <div key={label as string}>
                      <p className="tabular font-display text-base font-extrabold leading-none">
                        {/* Every percentile is nullable: a latency phase that failed
                            has no figures, and rendering null here printed a bare
                            "ms" beside nothing. */}
                        {val ?? "—"}
                        <span className="ms-0.5 text-[0.5rem] font-semibold text-[color:var(--page-fg-muted)]">
                          ms
                        </span>
                      </p>
                      <p className="mt-1 text-[0.5625rem] uppercase tracking-wide text-[color:var(--page-fg-muted)]">
                        {label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {bufferbloat && (
              <div className="glass-subtle flex items-center gap-3.5 rounded-2xl p-3.5">
                <span
                  className={cn(
                    "grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/10 font-display text-xl font-extrabold",
                    BUFFERBLOAT_TONE[bufferbloat.grade] ?? "text-[color:var(--page-fg)]",
                  )}
                >
                  {bufferbloat.grade}
                </span>
                <div className="min-w-0">
                  <p className="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--page-fg-muted)]">
                    Bufferbloat · latency under load
                  </p>
                  <p className="tabular mt-0.5 text-sm font-bold">
                    +{bufferbloat.increase} ms{" "}
                    <span className="font-normal text-[color:var(--page-fg-muted)]">
                      ({bufferbloat.idle} → {bufferbloat.loaded} ms)
                    </span>
                  </p>
                  <p className="mt-0.5 text-[0.6875rem] leading-tight text-[color:var(--page-fg-muted)]">
                    How much your latency rises while the link is saturated.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---- Actionable result summary ---------------------------------- */}
        {scores && hasResult && (
          <div className="mt-3 grid gap-2.5 lg:grid-cols-3">
            {[
              {
                title: `Health ${scores.health}/100`,
                body: healthVerdict(scores.health).detail,
              },
              {
                title: bufferbloat ? `Bufferbloat ${bufferbloat.grade}` : "Bufferbloat unknown",
                body: bufferbloat
                  ? bufferbloatVerdict(bufferbloat.increase)
                  : "Too few loaded-latency probes landed to grade queueing honestly. Run again or use a self-hosted edge for cleaner probing.",
              },
              {
                title: result.loss && result.loss > 0 ? `${result.loss}% packet loss` : "No packet loss detected",
                body:
                  result.loss && result.loss > 0
                    ? "Loss causes lag spikes and call drops. Check WiFi signal, interference, cabling, and ISP congestion."
                    : "Latency and throughput are the main things to optimize from this result.",
              },
            ].map((item) => (
              <div key={item.title} className="glass-subtle rounded-2xl p-3.5">
                <p className="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--page-fg-muted)]">
                  {item.title}
                </p>
                <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[color:var(--page-fg-muted)]">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* ---- Controls --------------------------------------------------- */}
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <Button variant="primary" size="lg" magnetic onClick={run} disabled={running}>
            {running ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden />
                Measuring…
              </>
            ) : (
              <>
                <Zap size={16} aria-hidden />
                {hasResult ? "Test again" : "Start test"}
              </>
            )}
          </Button>

          {running && (
            <Button variant="glass" size="lg" onClick={cancel}>
              <StopCircle size={16} aria-hidden />
              Stop
            </Button>
          )}

          <Button
            variant="glass"
            size="lg"
            onClick={() => downloadResultCard(result, scores)}
            disabled={!hasResult}
          >
            <ImageDown size={16} aria-hidden />
            <span className="hidden sm:inline">Result card</span>
          </Button>

          <Button variant="glass" size="lg" onClick={onShare} disabled={!hasResult}>
            <Share2 size={16} aria-hidden />
            <span className="hidden sm:inline">Share</span>
          </Button>

          <Button variant="glass" size="lg" onClick={onCopyLink} disabled={!hasResult}>
            <Link2 size={16} aria-hidden />
            <span className="hidden sm:inline">Copy link</span>
          </Button>
        </div>

        <p
          role="status"
          aria-live="polite"
          className="mt-3.5 text-[0.8125rem] leading-relaxed text-[color:var(--page-fg-muted)]"
        >
          {toast ?? status}
        </p>
      </div>
    </m.div>
  );
}

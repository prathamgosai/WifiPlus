"use client";

import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { Activity, Gauge, ImageDown, Link2, Share2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConnectionScore } from "@/components/result/ConnectionScore";
import { DataProvenance } from "@/components/result/DataProvenance";
import { MetricGrid } from "@/components/result/MetricGrid";
import { NetworkDoctor } from "@/components/result/NetworkDoctor";
import { LiveGraph } from "./LiveGraph";
import { useSpeedTest } from "@/hooks/useSpeedTest";
import { downloadResultCard, shareResult } from "@/lib/result-card";
import { cn } from "@/lib/utils";

/**
 * The report.
 * -----------------------------------------------------------------------------
 * Everything the run produced, below the fold: the score, the metrics, the live
 * trace, the latency distribution, the diagnosis, and the engine's own grade of
 * how much the whole thing can be trusted.
 *
 * This is a presentation layer over `useSpeedTest()` and nothing else. Every
 * number originates in `core/run.js`; every verdict in `core/health.js` or
 * `core/scoring.js`. No arithmetic happens in this file.
 *
 * THE EMPTY STATE IS DESIGNED. Before a run there is no score, so the section
 * says what it will contain rather than rendering dashes, zeroes or a skeleton
 * pretending to load. A dash reads as "zero" and a skeleton reads as "loading";
 * neither is true of a test nobody has started.
 */
export function SpeedDashboard() {
  const {
    result,
    scores,
    latency,
    bufferbloat,
    quality,
    evidence,
    uploadNote,
    error,
    graph,
    phase,
    running,
    status,
    endpointLabel,
  } = useSpeedTest();

  const [toast, setToast] = useState<string | null>(null);
  const reduced = useReducedMotion();

  const hasResult = result.download !== null;

  /* Sparklines come from the engine's own sample buffer — the exact values the
     measurement reported as it ran. */
  const downSeries = graph.current.down.map((point) => point.v);
  const upSeries = graph.current.up.map((point) => point.v);

  /* The run happened in conditions that cap what it can claim. Surfaced to the
     Doctor so "your device" can be flagged as the suspect hop. */
  const degraded = quality ? quality.level === "low" : false;

  const flash = (message: string, ms = 2600) => {
    setToast(message);
    window.setTimeout(() => setToast(null), ms);
  };

  const onShare = async () => {
    const message = await shareResult(result);
    if (message) flash(message);
  };

  const onCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href.split("#")[0] ?? "");
      flash("Link copied.");
    } catch {
      // Clipboard is unavailable on insecure origins; say so rather than
      // failing silently on a button the user just pressed.
      flash("Clipboard blocked by the browser.", 2400);
    }
  };

  return (
    <section id="report" className="section-shell scroll-mt-28" aria-label="Your connection report">
      <div className="shell">
        {/* ---- Error state ------------------------------------------------ */}
        <AnimatePresence initial={false}>
          {phase === "error" && error && (
            <m.div
              initial={reduced ? false : { opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -10 }}
              className="mb-6 flex items-start gap-3 rounded-[var(--radius-glass)] border border-rose-400/30 bg-rose-400/[0.08] p-4"
            >
              <TriangleAlert size={17} className="mt-0.5 shrink-0 text-rose-300" aria-hidden />
              <div className="min-w-0">
                <p className="font-display text-sm font-extrabold">The test could not complete</p>
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-[color:var(--page-fg-muted)]">
                  {error}. Nothing here should be read as your connection speed. Check the
                  connection and start the test again.
                </p>
              </div>
            </m.div>
          )}
        </AnimatePresence>

        {/* ---- Empty state ------------------------------------------------ */}
        {!hasResult && !running ? (
          <div className="glass-subtle rounded-[var(--radius-glass-lg)] px-6 py-14 text-center sm:px-10">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand to-accent">
              <Gauge size={22} className="text-white" aria-hidden />
            </span>
            <h2 className="mt-4 font-display text-[clamp(1.375rem,3vw,1.875rem)] font-extrabold">
              Your report appears here
            </h2>
            <p className="mx-auto mt-2.5 max-w-lg text-[0.9375rem] leading-relaxed text-[color:var(--page-fg-muted)]">
              A connection score with four use-case grades, eight measurements, the live throughput
              trace, a latency distribution, a diagnosis of what is holding the line back, and the
              evidence behind every figure.
            </p>
            <p className="mx-auto mt-4 max-w-lg text-[0.8125rem] leading-relaxed text-[color:var(--page-fg-muted)]/75">
              Nothing is shown until it has been measured. There are no sample values on this page.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* ---- Score --------------------------------------------------- */}
            <ConnectionScore scores={scores} />

            {/* ---- A metric that could not be measured is stated, not left
                 as a dash for the reader to interpret as zero. -------------- */}
            {uploadNote && (
              <p className="glass-subtle rounded-[var(--radius-glass)] px-5 py-3.5 text-[0.8125rem] leading-relaxed text-[color:var(--page-fg-muted)]">
                <strong className="font-semibold text-[color:var(--page-fg)]">
                  Upload could not be measured:{" "}
                </strong>
                {uploadNote}. Every other figure below is from this run.
              </p>
            )}

            {/* ---- Metrics ------------------------------------------------- */}
            <MetricGrid
              result={result}
              bufferbloat={bufferbloat}
              phase={phase}
              downSeries={downSeries}
              upSeries={upSeries}
            />

            {/* ---- Live trace ---------------------------------------------- */}
            <div className="glass-subtle overflow-hidden rounded-[var(--radius-glass)] p-3">
              <div className="mb-1 flex items-center gap-2 px-1">
                <Activity size={13} className="text-accent-300" aria-hidden />
                <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[color:var(--page-fg-muted)]">
                  Throughput over the run
                </p>
              </div>
              <div className="h-32 sm:h-40">
                <LiveGraph graph={graph} running={running} phase={phase} />
              </div>
            </div>

            {/* ---- Latency distribution + bufferbloat detail --------------- */}
            {(latency || bufferbloat) && (
              <div className="grid gap-4 lg:grid-cols-2">
                {latency && <LatencyDistribution latency={latency} />}
                {bufferbloat && <BufferbloatDetail bufferbloat={bufferbloat} />}
              </div>
            )}

            {/* ---- Diagnosis ----------------------------------------------- */}
            <NetworkDoctor
              result={result}
              bufferbloat={bufferbloat}
              degraded={degraded}
              edgeLabel={endpointLabel}
            />

            {/* ---- The engine's grade of its own run ----------------------- */}
            <DataProvenance quality={quality} evidence={evidence} />

            {/* ---- Actions ------------------------------------------------- */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <Button
                variant="glass"
                size="md"
                onClick={() => downloadResultCard(result, scores)}
                disabled={!hasResult}
              >
                <ImageDown size={15} aria-hidden />
                Result card
              </Button>
              <Button variant="glass" size="md" onClick={onShare} disabled={!hasResult}>
                <Share2 size={15} aria-hidden />
                Share
              </Button>
              <Button variant="glass" size="md" onClick={onCopyLink} disabled={!hasResult}>
                <Link2 size={15} aria-hidden />
                Copy link
              </Button>
            </div>

            <p
              role="status"
              aria-live="polite"
              className="text-[0.8125rem] leading-relaxed text-[color:var(--page-fg-muted)]"
            >
              {toast ?? status}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Sub-panels
   ------------------------------------------------------------------------ */

const BUFFERBLOAT_TONE: Record<string, string> = {
  "A+": "text-emerald-300",
  A: "text-emerald-300",
  B: "text-accent-300",
  C: "text-amber-300",
  D: "text-amber-300",
  F: "text-rose-300",
};

/**
 * The shape of the latency, not just its middle.
 *
 * p95 is the number users actually feel — a 20 ms median with a 300 ms tail is
 * a connection that stutters, and a median alone cannot say so. Every field is
 * nullable because a latency phase that failed has no figures at all.
 */
function LatencyDistribution({
  latency,
}: {
  latency: NonNullable<ReturnType<typeof useSpeedTest>["latency"]>;
}) {
  const cells: Array<[string, number | null]> = [
    ["Min", latency.min],
    ["Median", latency.ping],
    ["p95", latency.p95],
    ["Max", latency.max],
  ];

  return (
    <div className="glass-subtle rounded-[var(--radius-glass)] p-4">
      <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[color:var(--page-fg-muted)]">
        Latency distribution · {latency.samples.length} probes returned
      </p>

      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        {cells.map(([label, value]) => (
          <div key={label}>
            <p className="tabular font-display text-lg font-extrabold leading-none">
              {value ?? "—"}
              <span className="ms-0.5 text-[0.5625rem] font-semibold text-[color:var(--page-fg-muted)]">
                ms
              </span>
            </p>
            <p className="mt-1 text-[0.5625rem] font-semibold uppercase tracking-wide text-[color:var(--page-fg-muted)]">
              {label}
            </p>
          </div>
        ))}
      </div>

      {/* A range bar makes the spread legible at a glance: a wide gap between
          median and p95 is the signal, and a row of four numbers hides it. */}
      {latency.min !== null && latency.max !== null && latency.ping !== null && latency.max > latency.min && (
        <div className="mt-3.5">
          <div className="relative h-1.5 overflow-hidden rounded-full bg-white/10">
            <span
              className="absolute inset-y-0 rounded-full bg-gradient-to-r from-emerald-400/70 via-accent-400/70 to-amber-400/70"
              style={{ left: "0%", right: "0%" }}
            />
            <span
              className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full bg-white"
              style={{
                left: `${((latency.ping - latency.min) / (latency.max - latency.min)) * 100}%`,
              }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[0.5625rem] text-[color:var(--page-fg-muted)]">
            <span>{latency.min} ms</span>
            <span>median</span>
            <span>{latency.max} ms</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Latency under load, with the idle baseline it is measured against. */
function BufferbloatDetail({
  bufferbloat,
}: {
  bufferbloat: NonNullable<ReturnType<typeof useSpeedTest>["bufferbloat"]>;
}) {
  return (
    <div className="glass-subtle flex items-center gap-4 rounded-[var(--radius-glass)] p-4">
      <span
        className={cn(
          "grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/[0.08] font-display text-2xl font-extrabold",
          BUFFERBLOAT_TONE[bufferbloat.grade] ?? "text-[color:var(--page-fg)]",
        )}
      >
        {bufferbloat.grade}
      </span>

      <div className="min-w-0">
        <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[color:var(--page-fg-muted)]">
          Bufferbloat · latency under load
        </p>
        <p className="tabular mt-1 text-[0.9375rem] font-bold">
          +{bufferbloat.increase} ms{" "}
          <span className="font-normal text-[color:var(--page-fg-muted)]">
            ({bufferbloat.idle} → {bufferbloat.loaded} ms)
          </span>
        </p>
        <p className="mt-1 text-[0.75rem] leading-relaxed text-[color:var(--page-fg-muted)]">
          Graded on the {bufferbloat.basis} of {bufferbloat.probes} probes that landed while the link
          was saturated — the worse of the download and upload directions.
        </p>
      </div>
    </div>
  );
}

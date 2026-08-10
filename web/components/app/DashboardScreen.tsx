"use client";

import { m } from "framer-motion";
import { Download, Loader2, Zap } from "lucide-react";
import { AppShell } from "./AppShell";
import { StatTile, Sparkline } from "./widgets";
import { ConnectionStrip } from "@/components/sections/ConnectionStrip";
import { LiveGraph } from "@/components/sections/LiveGraph";
import { Button } from "@/components/ui/Button";
import { useHistory, relativeTime } from "@/hooks/useHistory";
import { useSpeedTest } from "@/hooks/useSpeedTest";
import { downloadResultCard } from "@/lib/result-card";
import { formatSpeed } from "@/lib/utils";
import { fadeUp, stagger, viewportOnce } from "@/lib/motion";

/**
 * Product dashboard. Every number here is the user's own.
 *
 * The hero tiles come from the live measurement engine, and the history below
 * comes from the runs actually recorded on this device. It previously drew a
 * seven-day chart and a recent-tests table from hardcoded arrays — speeds like
 * 942 Mbps that nobody had ever measured. A small "demo data" caption does not
 * undo that: the number is what the eye reads, and on a speed test the number is
 * the entire claim.
 */
export function DashboardScreen() {
  const { result, scores, graph, running, run, phase, progress } = useSpeedTest();
  const has = result.download !== null;

  // Re-read once a run finishes so a fresh result appears without navigating.
  const { entries, loaded } = useHistory(phase === "done" ? result.download : null);

  // Oldest to newest, so the sparkline reads left to right like a timeline.
  const trend = [...entries]
    .reverse()
    .map((entry) => entry.download)
    .filter((value): value is number => typeof value === "number");
  const latest = entries[0];

  return (
    <AppShell title="Overview">
      {/* ---- header row ------------------------------------------------- */}
      <m.div
        variants={fadeUp}
        initial="hidden"
        animate="show"
        className="mb-5 flex flex-wrap items-center justify-between gap-4"
      >
        <div>
          <p className="text-sm text-[color:var(--page-fg-muted)]">Good to see you back.</p>
          <p className="font-display text-[1.375rem] font-extrabold tracking-tight">
            Your connection at a glance
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="glass" size="md" onClick={() => downloadResultCard(result, scores)} disabled={!has}>
            <Download size={15} aria-hidden />
            <span className="hidden sm:inline">Result card</span>
          </Button>
          <Button variant="primary" size="md" magnetic onClick={run} disabled={running}>
            {running ? (
              <>
                <Loader2 size={15} className="animate-spin" aria-hidden />
                Measuring…
              </>
            ) : (
              <>
                <Zap size={15} aria-hidden />
                Run test
              </>
            )}
          </Button>
        </div>
      </m.div>

      {/* progress rail while running */}
      {running && (
        <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label="Test progress">
          <m.span
            className="block h-full rounded-full"
            style={{ background: "linear-gradient(90deg,#8b5cf6,#5b5ff0 45%,#22d3ee)" }}
            animate={{ width: `${progress}%` }}
            transition={{ ease: "easeOut", duration: 0.35 }}
          />
        </div>
      )}

      {/* ---- detected connection (real, on mount) ----------------------- */}
      <m.div variants={fadeUp} initial="hidden" animate="show" className="mb-4">
        <ConnectionStrip />
      </m.div>

      {/* ---- live KPI row ----------------------------------------------- */}
      <m.div
        variants={stagger(0.06)}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <m.div variants={fadeUp}>
          <StatTile label="Download" value={formatSpeed(result.download)} unit="Mbps" trend="up" trendLabel={has ? "live result" : "run a test"} live={running} />
        </m.div>
        <m.div variants={fadeUp}>
          <StatTile label="Upload" value={formatSpeed(result.upload)} unit="Mbps" trend="up" trendLabel={has ? "live result" : "—"} live={running} />
        </m.div>
        <m.div variants={fadeUp}>
          <StatTile label="Ping" value={result.ping === null ? "—" : String(result.ping)} unit="ms" trend="down" upIsGood={false} trendLabel={has ? "lower is better" : "—"} live={running} />
        </m.div>
        <m.div variants={fadeUp}>
          <StatTile label="WiFi health" value={scores ? String(scores.health) : "—"} unit="/100" trend="up" trendLabel={scores ? verdict(scores.health) : "—"} live={running} />
        </m.div>
      </m.div>

      {/* ---- chart + scores --------------------------------------------- */}
      <div className="mt-5 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <m.section
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
          className="glass glass-sheen rounded-[var(--radius-glass)] p-5"
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-extrabold tracking-tight">
                {running || has ? "Live throughput" : "Your recent throughput"}
              </h2>
              <p className="text-xs text-[color:var(--page-fg-muted)]">
                {running || has
                  ? "Real samples · Mbps"
                  : trend.length
                    ? `Last ${trend.length} test${trend.length === 1 ? "" : "s"} on this device · Mbps`
                    : "No tests recorded yet"}
              </p>
            </div>
            {!running && !has && latest?.download != null && (
              <span className="tabular font-display text-2xl font-extrabold text-gradient-static">
                {latest.download.toFixed(0)}
              </span>
            )}
          </div>
          {running || has ? (
            <div className="h-[110px]">
              <LiveGraph graph={graph} running={running} phase={phase} />
            </div>
          ) : trend.length >= 2 ? (
            <>
              <Sparkline points={trend} height={110} />
              <div className="mt-2 flex justify-between text-[0.625rem] text-[color:var(--page-fg-muted)]">
                <span>{relativeTime(entries[entries.length - 1]?.at ?? Date.now())}</span>
                <span>{relativeTime(entries[0]?.at ?? Date.now())}</span>
              </div>
            </>
          ) : (
            // An empty state, not a filler chart. Nothing has been measured yet,
            // so there is nothing honest to draw.
            <div className="grid h-[110px] place-items-center text-center">
              <p className="text-xs text-[color:var(--page-fg-muted)]">
                {loaded
                  ? "Run a test and your history builds here — stored on this device only."
                  : "Loading your history…"}
              </p>
            </div>
          )}
        </m.section>

        <m.section
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
          className="glass glass-sheen rounded-[var(--radius-glass)] p-5"
        >
          <h2 className="mb-4 font-display text-base font-extrabold tracking-tight">Quality scores</h2>
          <div className="flex flex-col gap-3.5">
            {[
              ["Gaming", scores?.gaming],
              ["Streaming", scores?.streaming],
              ["Video calls", scores?.video],
              ["Work", scores?.work],
              ["DNS", scores?.dns],
            ].map(([label, val]) => (
              <div key={label as string}>
                <div className="mb-1 flex items-center justify-between text-[0.8125rem]">
                  <span className="text-[color:var(--page-fg-muted)]">{label}</span>
                  <span className="tabular font-bold">{val ?? "—"}</span>
                </div>
                <span className="block h-1.5 overflow-hidden rounded-full bg-white/10">
                  <m.span
                    className="block h-full rounded-full"
                    style={{ background: "linear-gradient(90deg,#5b5ff0,#22d3ee)" }}
                    initial={{ width: 0 }}
                    animate={{ width: val ? `${val}%` : "0%" }}
                    transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  />
                </span>
              </div>
            ))}
          </div>
          {!scores && (
            <p className="mt-4 text-xs text-[color:var(--page-fg-muted)]">
              Run a test to populate your scores.
            </p>
          )}
        </m.section>
      </div>

      {/* ---- recent tests table ----------------------------------------- */}
      <m.section
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={viewportOnce}
        className="glass glass-sheen mt-4 overflow-hidden rounded-[var(--radius-glass)]"
      >
        <div className="flex items-center justify-between p-5 pb-3">
          <h2 className="font-display text-base font-extrabold tracking-tight">Recent tests</h2>
          <span className="text-xs text-[color:var(--page-fg-muted)]">
            {entries.length ? "Stored on this device only" : "No tests yet"}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="text-[0.6875rem] uppercase tracking-[0.08em] text-[color:var(--page-fg-muted)]">
                <th className="px-5 py-2.5 text-start font-semibold">When</th>
                <th className="px-3 py-2.5 text-end font-semibold">Down</th>
                <th className="px-3 py-2.5 text-end font-semibold">Up</th>
                <th className="px-3 py-2.5 text-end font-semibold">Ping</th>
                <th className="px-5 py-2.5 text-end font-semibold">Edge</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.at}
                  className="border-t border-[color:var(--glass-border)] transition-colors hover:bg-white/[0.04]"
                >
                  <td className="px-5 py-3 font-medium">{relativeTime(entry.at)}</td>
                  <td className="tabular px-3 py-3 text-end">
                    {entry.download == null ? "—" : `${entry.download.toFixed(1)} Mbps`}
                  </td>
                  <td className="tabular px-3 py-3 text-end">
                    {entry.upload == null ? "—" : `${entry.upload.toFixed(1)} Mbps`}
                  </td>
                  <td className="tabular px-3 py-3 text-end">
                    {entry.ping == null ? "—" : `${entry.ping} ms`}
                  </td>
                  <td className="px-5 py-3 text-end text-[color:var(--page-fg-muted)]">
                    {entry.edgeCity ?? entry.isp ?? "—"}
                  </td>
                </tr>
              ))}
              {!entries.length && (
                <tr className="border-t border-[color:var(--glass-border)]">
                  <td colSpan={5} className="px-5 py-8 text-center text-sm text-[color:var(--page-fg-muted)]">
                    {loaded
                      ? "No tests recorded on this device yet. Run one above."
                      : "Loading…"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </m.section>

      {running && (
        <p className="mt-4 text-center text-xs text-[color:var(--page-fg-muted)]" role="status">
          {phase === "latency" ? "Measuring latency…" : phase === "download" ? "Measuring download…" : phase === "upload" ? "Measuring upload…" : "Finishing up…"}
        </p>
      )}
    </AppShell>
  );
}

function verdict(h: number): string {
  return h >= 85 ? "Excellent" : h >= 70 ? "Good" : "Needs work";
}

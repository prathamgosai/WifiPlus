"use client";

import { Download, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/Button";
import { useHistory, relativeTime } from "@/hooks/useHistory";

/**
 * Test history.
 *
 * This was a "coming soon" placeholder long after the history itself started
 * being recorded — every completed run has been written to the device since
 * `useSpeedTest` began saving them. The data was there; only the page showing it
 * was missing.
 *
 * Everything here is the visitor's own measurements, held on their device. There
 * is no account and nothing is uploaded, which is also why the export and delete
 * controls can be honest about what they touch.
 */
export default function HistoryPage() {
  const { entries, loaded, clear } = useHistory();

  const exportCsv = () => {
    const header = "timestamp,download_mbps,upload_mbps,ping_ms,isp,edge\n";
    const rows = entries
      .map((entry) =>
        [
          new Date(entry.at).toISOString(),
          entry.download ?? "",
          entry.upload ?? "",
          entry.ping ?? "",
          // Quote the free-text columns; an ISP name can contain a comma.
          `"${(entry.isp ?? "").replace(/"/g, '""')}"`,
          `"${(entry.edgeCity ?? "").replace(/"/g, '""')}"`,
        ].join(","),
      )
      .join("\n");

    const url = URL.createObjectURL(new Blob([header + rows], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "wifiplus-history.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell title="History">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-[1.375rem] font-extrabold tracking-tight">
            {entries.length ? `${entries.length} test${entries.length === 1 ? "" : "s"} on this device` : "No tests yet"}
          </p>
          <p className="text-sm text-[color:var(--page-fg-muted)]">
            Stored on this device only — never uploaded, and tied to no account.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="glass" size="md" onClick={exportCsv} disabled={!entries.length}>
            <Download size={15} aria-hidden />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
          <Button variant="glass" size="md" onClick={clear} disabled={!entries.length}>
            <Trash2 size={15} aria-hidden />
            <span className="hidden sm:inline">Clear</span>
          </Button>
        </div>
      </div>

      <section className="glass glass-sheen overflow-hidden rounded-[var(--radius-glass)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="text-[0.6875rem] uppercase tracking-[0.08em] text-[color:var(--page-fg-muted)]">
                <th className="px-5 py-3 text-start font-semibold">When</th>
                <th className="px-3 py-3 text-end font-semibold">Download</th>
                <th className="px-3 py-3 text-end font-semibold">Upload</th>
                <th className="px-3 py-3 text-end font-semibold">Ping</th>
                <th className="px-5 py-3 text-start font-semibold">Provider · edge</th>
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
                  <td className="px-5 py-3 text-[color:var(--page-fg-muted)]">
                    {[entry.isp, entry.edgeCity].filter(Boolean).join(" · ") || "—"}
                  </td>
                </tr>
              ))}
              {!entries.length && (
                <tr className="border-t border-[color:var(--glass-border)]">
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-[color:var(--page-fg-muted)]">
                    {loaded
                      ? "Nothing recorded yet. Run a test and it will appear here."
                      : "Loading…"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

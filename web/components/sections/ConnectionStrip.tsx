"use client";

import { m } from "framer-motion";
import { Building2, Cpu, Globe, MapPin, Server, Wifi } from "lucide-react";
import { useNetInfo } from "@/hooks/useNetInfo";
import { cn } from "@/lib/utils";

/**
 * A live strip of the visitor's real connection facts — ISP, serving Cloudflare
 * edge, IP + version, and HTTP protocol — detected on mount. This both answers
 * "detect user / nearest server" and, more usefully, proves the test is real by
 * showing the reader their own ISP and the actual edge node measuring them.
 */
export function ConnectionStrip({ compact = false }: { compact?: boolean }) {
  const { info, loading } = useNetInfo();

  const items = [
    {
      icon: Building2,
      label: "ISP",
      value: info?.isp,
      sub: info?.asn ? `AS${info.asn}` : undefined,
    },
    {
      icon: Server,
      label: "Edge server",
      value: info?.edgeCity ?? info?.colo,
      sub: info?.colo && info?.edgeCity ? info.colo : "Cloudflare",
    },
    {
      icon: Globe,
      label: info?.ipVersion ?? "IP",
      value: info?.ip,
      sub: info?.httpProtocol ?? undefined,
    },
    {
      icon: MapPin,
      label: "Location",
      value: info?.city ?? info?.country,
      sub: info?.city && info?.country ? info.country : undefined,
    },
  ];

  return (
    <div
      className={cn(
        "grid gap-2",
        compact ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 lg:grid-cols-4",
      )}
      aria-label="Detected connection"
    >
      {items.map((item, i) => (
        <m.div
          key={item.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 + i * 0.05, duration: 0.4 }}
          className="glass-subtle flex items-center gap-2.5 rounded-xl px-3 py-2.5"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand/80 to-accent/60">
            <item.icon size={14} className="text-white" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-[0.5625rem] font-semibold uppercase tracking-[0.1em] text-[color:var(--page-fg-muted)]">
              {item.label}
            </span>
            <span className="block truncate text-[0.8125rem] font-semibold">
              {loading ? (
                <span className="inline-block h-3 w-16 animate-pulse rounded bg-white/15 align-middle" />
              ) : (
                (item.value ?? "—")
              )}
            </span>
            {item.sub && !loading && (
              <span className="block truncate text-[0.625rem] text-[color:var(--page-fg-muted)]">
                {item.sub}
              </span>
            )}
          </span>
        </m.div>
      ))}
    </div>
  );
}

/** One-line variant for tight headers: "Jio · Mumbai edge · HTTP/3". */
export function ConnectionInline() {
  const { info, loading } = useNetInfo();
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[0.6875rem] text-[color:var(--page-fg-muted)]">
        <Wifi size={11} className="animate-pulse" aria-hidden /> detecting connection…
      </span>
    );
  }
  const parts = [
    info?.isp,
    info?.edgeCity ? `${info.edgeCity} edge` : info?.colo ? `${info.colo} edge` : null,
    info?.httpProtocol,
  ].filter(Boolean);

  return (
    <span className="inline-flex items-center gap-1.5 text-[0.6875rem] text-[color:var(--page-fg-muted)]">
      <Cpu size={11} className="text-accent-300" aria-hidden />
      {parts.length ? parts.join(" · ") : "Cloudflare global edge · real bytes"}
    </span>
  );
}

"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Trophy } from "lucide-react";
import { DataNotice, Section, SectionHeading } from "@/components/ui/Section";
import { GlassCard } from "@/components/ui/GlassCard";
import { Segmented } from "@/components/ui/Controls";
import { Reveal } from "@/components/ui/Reveal";
import { providers } from "@/lib/providers";
import type { RankingKey } from "@/types";

const TABS: { value: RankingKey; label: string }[] = [
  { value: "world", label: "Fastest in the world" },
  { value: "gaming", label: "Best for gaming" },
  { value: "streaming", label: "Best for streaming" },
  { value: "remote", label: "Best for remote work" },
  { value: "value", label: "Best value" },
];

const SCORE_LABEL: Record<RankingKey, string> = {
  world: "Mbps",
  gaming: "Score",
  streaming: "Score",
  remote: "Score",
  value: "Mbps/$",
};

export function Rankings() {
  const [tab, setTab] = useState<RankingKey>("world");

  const ranked = useMemo(() => {
    const sorted = [...providers].sort((a, b) => {
      if (tab === "gaming") return b.gaming - a.gaming || a.ping - b.ping;
      if (tab === "streaming") return b.streaming - a.streaming || b.download - a.download;
      if (tab === "remote") return b.remote - a.remote || b.upload - a.upload;
      if (tab === "value") return b.download / b.price - a.download / a.price;
      return b.download - a.download;
    });
    return sorted.slice(0, 10).map((provider) => ({
      provider,
      score:
        tab === "gaming"
          ? provider.gaming
          : tab === "streaming"
            ? provider.streaming
            : tab === "remote"
              ? provider.remote
              : tab === "value"
                ? Math.round(provider.download / provider.price)
                : provider.download,
    }));
  }, [tab]);

  return (
    <Section id="rankings" tinted>
      <SectionHeading
        eyebrow="Rankings"
        title={
          <>
            Worldwide <span className="text-gradient">ranking systems</span>
          </>
        }
        copy="Rank global providers across raw speed, reliability, gaming latency, streaming headroom, remote work upload and value per dollar."
      />
      <DataNotice>
        these rankings are computed from the illustrative prototype dataset and do not reflect real
        provider performance.
      </DataNotice>

      <Reveal className="mt-12 flex justify-center">
        <Segmented
          layoutId="rankings-tab"
          label="Ranking categories"
          options={TABS}
          value={tab}
          onChange={setTab}
        />
      </Reveal>

      <Reveal className="mt-8" delay={0.08}>
        <GlassCard spotlight={false} lift={false} padded={false} className="overflow-hidden">
          <ol>
            <AnimatePresence mode="popLayout" initial={false}>
              {ranked.map(({ provider, score }, index) => (
                <m.li
                  key={`${tab}-${provider.name}-${provider.city}`}
                  layout
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: index * 0.03, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/[0.07] px-4 py-4 transition-colors duration-300 first:border-t-0 hover:bg-white/[0.05] sm:px-6"
                >
                  {/* Podium positions get the gradient treatment. */}
                  <span
                    className={
                      index < 3
                        ? "tabular grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand to-accent font-display text-sm font-extrabold text-white"
                        : "tabular glass-subtle grid h-9 w-9 shrink-0 place-items-center rounded-xl font-display text-sm font-bold text-[color:var(--page-fg-muted)]"
                    }
                  >
                    {index + 1}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-display text-[0.9375rem] font-bold tracking-tight">
                      {provider.name}
                      {index === 0 && (
                        <Trophy size={13} className="text-amber-300" aria-label="Top ranked" />
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-[color:var(--page-fg-muted)]">
                      {provider.city}, {provider.country} · {provider.type}
                    </span>
                  </span>

                  <span className="tabular hidden w-24 text-end text-sm text-[color:var(--page-fg-muted)] sm:block">
                    {provider.download} Mbps
                  </span>
                  <span className="tabular hidden w-16 text-end text-sm text-[color:var(--page-fg-muted)] md:block">
                    {provider.ping} ms
                  </span>

                  <span className="tabular w-24 shrink-0 text-end">
                    <span className="font-display text-lg font-extrabold text-gradient-static">
                      {score}
                    </span>
                    <span className="ms-1 text-[0.625rem] font-semibold uppercase tracking-wider text-[color:var(--page-fg-muted)]">
                      {SCORE_LABEL[tab]}
                    </span>
                  </span>
                </m.li>
              ))}
            </AnimatePresence>
          </ol>
        </GlassCard>
      </Reveal>
    </Section>
  );
}

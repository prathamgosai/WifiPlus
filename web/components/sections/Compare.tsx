"use client";

import { useMemo } from "react";
import { m } from "framer-motion";
import { Globe2, MapPin } from "lucide-react";
import { DataNotice, Section, SectionHeading } from "@/components/ui/Section";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Meter, Select, Tag } from "@/components/ui/Controls";
import { Reveal } from "@/components/ui/Reveal";
import { useIsp } from "@/components/providers/IspProvider";
import { viewportOnce } from "@/lib/motion";
import type { SortKey } from "@/types";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "download", label: "Download" },
  { value: "upload", label: "Upload" },
  { value: "ping", label: "Ping" },
  { value: "reliability", label: "Reliability" },
  { value: "value", label: "Value" },
];

/**
 * Comparison table.
 *
 * Renders as a real `<table>` for semantics, but the row layout switches to a
 * stacked card below `md` — a six-column numeric table is unreadable on a phone,
 * and horizontal scrolling for primary content is worse than stacking.
 */
export function Compare() {
  const { scoped, sort, setSort, worldwide, toggleWorldwide, city } = useIsp();

  const rows = useMemo(() => {
    const sorted = [...scoped].sort((a, b) => {
      if (sort === "ping") return a.ping - b.ping;
      if (sort === "value") return b.download / b.price - a.download / a.price;
      return b[sort] - a[sort];
    });
    return sorted.slice(0, worldwide ? 12 : 8);
  }, [scoped, sort, worldwide]);

  const types = useMemo(
    () => Array.from(new Set(scoped.map((provider) => provider.type))).sort(),
    [scoped],
  );

  return (
    <Section id="compare">
      <SectionHeading
        eyebrow="Comparison"
        title={
          <>
            Global ISP <span className="text-gradient">Comparison Center</span>
          </>
        }
        copy="Compare providers by download, upload, ping, reliability, pricing, coverage and data caps — scoped to your city or across the world."
      />
      <DataNotice>
        these comparisons use the illustrative prototype dataset, not measured provider performance.
      </DataNotice>

      <div className="mt-14 grid gap-4 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)]">
        <Reveal>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <Select
                label="Sort by"
                value={sort}
                options={SORTS}
                onChange={(event) => setSort(event.target.value as SortKey)}
                className="w-44"
              />
              <Button variant="glass" size="md" onClick={toggleWorldwide}>
                {worldwide ? <MapPin size={15} aria-hidden /> : <Globe2 size={15} aria-hidden />}
                {worldwide ? "Show selected city" : "Show worldwide"}
              </Button>
            </div>

            <GlassCard spotlight={false} lift={false} padded={false} className="overflow-hidden">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">
                  {worldwide ? "Worldwide" : city} ISP comparison, sorted by {sort}
                </caption>
                <thead className="hidden md:table-header-group">
                  <tr className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-[color:var(--page-fg-muted)]">
                    <th scope="col" className="px-5 py-4 text-start">Provider</th>
                    <th scope="col" className="px-3 py-4 text-end">Down</th>
                    <th scope="col" className="px-3 py-4 text-end">Up</th>
                    <th scope="col" className="px-3 py-4 text-end">Ping</th>
                    <th scope="col" className="px-3 py-4 text-end">Price</th>
                    <th scope="col" className="px-5 py-4 text-start">Reliability</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((provider, index) => (
                    <m.tr
                      key={`${provider.name}-${provider.city}`}
                      initial={{ opacity: 0, y: 12 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={viewportOnce}
                      transition={{ delay: Math.min(index * 0.035, 0.35), duration: 0.45 }}
                      className="block border-t border-white/[0.07] transition-colors duration-300 hover:bg-white/[0.05] md:table-row"
                    >
                      <th
                        scope="row"
                        className="block px-5 pt-4 text-start font-normal md:table-cell md:py-4"
                      >
                        <span className="font-display text-[0.9375rem] font-bold tracking-tight">
                          {provider.name}
                        </span>
                        <span className="mt-0.5 block text-xs text-[color:var(--page-fg-muted)]">
                          {provider.city}, {provider.country}
                        </span>
                      </th>

                      {/* Stacked layout below md gets inline labels via ::before. */}
                      <Cell label="Download">{provider.download} Mbps</Cell>
                      <Cell label="Upload">{provider.upload} Mbps</Cell>
                      <Cell label="Ping">{provider.ping} ms</Cell>
                      <Cell label="Price">${provider.price}/mo</Cell>

                      <td className="block px-5 pb-4 pt-2 md:table-cell md:py-4">
                        <span className="mb-1.5 block text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--page-fg-muted)] md:hidden">
                          Reliability
                        </span>
                        <span className="flex items-center gap-2.5">
                          <Meter value={provider.reliability} label={`${provider.reliability} reliability`} />
                          <span className="tabular w-7 shrink-0 text-xs font-bold">
                            {provider.reliability}
                          </span>
                        </span>
                      </td>
                    </m.tr>
                  ))}
                </tbody>
              </table>
            </GlassCard>
          </div>
        </Reveal>

        {/* ---- Availability panel -------------------------------------------- */}
        <Reveal delay={0.1}>
          <GlassCard tilt className="group h-full">
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-[color:var(--page-fg-muted)]">
              Availability signals
            </p>
            <h3 className="mt-1.5 font-display text-xl font-extrabold tracking-tight">
              {worldwide ? "Worldwide coverage mix" : `${city} coverage mix`}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[color:var(--page-fg-muted)]">
              {worldwide
                ? "The global view spans fiber, cable, fixed wireless, mobile, satellite, government-owned and private providers."
                : `${city} has ${scoped.length} sampled ${scoped.length === 1 ? "provider" : "providers"} in this dataset. Production coverage maps would add address-level availability.`}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {types.map((type) => (
                <Tag key={type}>{type}</Tag>
              ))}
            </div>
          </GlassCard>
        </Reveal>
      </div>
    </Section>
  );
}

/** Numeric cell that grows its own label when the table collapses to cards. */
function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <td className="inline-block w-1/2 px-5 pt-3 text-start align-top sm:w-1/4 md:table-cell md:w-auto md:px-3 md:py-4 md:text-end">
      <span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--page-fg-muted)] md:hidden">
        {label}
      </span>
      <span className="tabular font-medium">{children}</span>
    </td>
  );
}

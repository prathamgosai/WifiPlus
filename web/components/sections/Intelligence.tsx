"use client";

import { m } from "framer-motion";
import { ChevronRight, Star } from "lucide-react";
import { DataNotice, Section, SectionHeading } from "@/components/ui/Section";
import { GlassCard } from "@/components/ui/GlassCard";
import { Select, Tag } from "@/components/ui/Controls";
import { Reveal, RevealGroup } from "@/components/ui/Reveal";
import { useIsp } from "@/components/providers/IspProvider";
import { countries, formatProvider, providers, regionLabels } from "@/lib/providers";
import { scoreProvider } from "@/lib/scoring";
import { fadeUp, slideInLeft, slideInRight, viewportOnce } from "@/lib/motion";

const COUNTRIES = countries();

/**
 * The ISP explorer: a country → city → provider drill-down feeding a live
 * profile card, plus a per-region summary computed from the seed dataset.
 */
export function Intelligence() {
  const { country, city, cities, scoped, providerIndex, selected, setCountry, setCity, setProviderIndex } =
    useIsp();

  const chain = [
    { label: "Country", value: selected.country },
    { label: "State", value: selected.state },
    { label: "City", value: selected.city },
    { label: "ISP", value: selected.name },
    { label: "Plan", value: selected.plan },
  ];

  const stats = [
    { value: selected.download, label: "Avg download Mbps" },
    { value: selected.upload, label: "Avg upload Mbps" },
    { value: selected.ping, label: "Median ping ms" },
    { value: `${selected.coverage}%`, label: "Coverage estimate" },
    { value: selected.reliability, label: "Reliability score" },
    { value: selected.rating.toFixed(1), label: "User rating" },
  ];

  return (
    <Section id="intelligence" tinted>
      <SectionHeading
        eyebrow="ISP intelligence"
        title={
          <>
            Global ISP <span className="text-gradient">Intelligence System</span>
          </>
        }
        copy="Browse an extensible seed dataset and see how the production system organizes provider intelligence for every region worldwide."
      />
      <DataNotice>
        the provider figures below — speeds, pricing, uptime and ratings — are illustrative examples
        covering 38 providers in 24 countries. They are not measured results and should not be used
        to choose an ISP. Your own speed test above measures your real connection.
      </DataNotice>

      <div className="mt-14 grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        {/* ---- Drill-down --------------------------------------------------- */}
        <Reveal variants={slideInLeft}>
          <GlassCard spotlight={false} className="h-full">
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-[color:var(--page-fg-muted)]">
              Location hierarchy
            </p>
            <h3 className="mt-1.5 font-display text-xl font-extrabold tracking-tight">
              Country to plan intelligence
            </h3>

            <div className="mt-6 flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Country"
                  value={country}
                  options={COUNTRIES}
                  onChange={(event) => setCountry(event.target.value)}
                />
                <Select
                  label="City"
                  value={city}
                  options={cities}
                  onChange={(event) => setCity(event.target.value)}
                />
              </div>
              <Select
                label="ISP profile"
                value={String(Math.min(providerIndex, scoped.length - 1))}
                options={scoped.map((provider, index) => ({
                  value: String(index),
                  label: formatProvider(provider),
                }))}
                onChange={(event) => setProviderIndex(Number(event.target.value))}
              />
            </div>

            {/* Breadcrumb of the resolved selection. */}
            <ul className="mt-7 flex flex-col gap-1.5">
              {chain.map((item, index) => (
                <m.li
                  key={item.label}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={viewportOnce}
                  transition={{ delay: index * 0.05, duration: 0.45 }}
                  className="glass-subtle flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5"
                >
                  <span className="flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--page-fg-muted)]">
                    <ChevronRight size={12} className="text-accent-300" aria-hidden />
                    {item.label}
                  </span>
                  <span className="truncate text-sm font-semibold">{item.value}</span>
                </m.li>
              ))}
            </ul>
          </GlassCard>
        </Reveal>

        {/* ---- Profile + regions -------------------------------------------- */}
        <div className="flex flex-col gap-4">
          <Reveal variants={slideInRight}>
            <GlassCard tilt className="group">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-[color:var(--page-fg-muted)]">
                    ISP profile
                  </p>
                  <h3 className="mt-1.5 font-display text-2xl font-extrabold tracking-tight">
                    {selected.name}
                  </h3>
                  <p className="mt-1.5 text-sm text-[color:var(--page-fg-muted)]">
                    {selected.ownership} {selected.type.toLowerCase()} provider serving {selected.city},{" "}
                    {selected.country}.
                  </p>
                </div>

                <div className="glass-subtle shrink-0 rounded-2xl px-4 py-3 text-center">
                  <span className="tabular font-display text-3xl font-extrabold leading-none text-gradient-static">
                    {scoreProvider(selected)}
                  </span>
                  <span className="mt-0.5 block text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--page-fg-muted)]">
                    fit score
                  </span>
                </div>
              </div>

              <dl className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {stats.map((stat) => (
                  <div key={stat.label} className="glass-subtle rounded-xl px-3.5 py-3">
                    <dd className="tabular font-display text-xl font-extrabold leading-none">
                      {stat.value}
                    </dd>
                    <dt className="mt-1 text-[0.6875rem] leading-tight text-[color:var(--page-fg-muted)]">
                      {stat.label}
                    </dt>
                  </div>
                ))}
              </dl>

              <div className="mt-5 flex flex-wrap gap-2">
                <Tag>{selected.type}</Tag>
                <Tag>{selected.ownership}</Tag>
                <Tag>{selected.dataCap}</Tag>
                <Tag>{selected.uptime}% uptime</Tag>
                <Tag>
                  {selected.currency} {selected.price}/mo
                </Tag>
                <Tag>
                  <Star size={11} className="me-1 fill-amber-300 text-amber-300" aria-hidden />
                  {selected.rating.toFixed(1)}
                </Tag>
              </div>
            </GlassCard>
          </Reveal>

          {/* ---- Region summary ---------------------------------------------- */}
          <RevealGroup className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" step={0.05}>
            {regionLabels.map((region) => {
              const inRegion = providers.filter((provider) => provider.region === region);
              const countryCount = new Set(inRegion.map((provider) => provider.country)).size;
              const avg = inRegion.length
                ? Math.round(inRegion.reduce((sum, p) => sum + p.download, 0) / inRegion.length)
                : 0;

              return (
                <GlassCard
                  key={region}
                  variants={fadeUp}
                  padded={false}
                  spotlight
                  className="p-4"
                >
                  <p className="font-display text-sm font-bold tracking-tight">{region}</p>
                  <p className="tabular mt-2 text-2xl font-extrabold leading-none text-gradient-static">
                    {avg || "—"}
                    <span className="ms-1 font-sans text-[0.625rem] font-semibold uppercase tracking-wider text-[color:var(--page-fg-muted)]">
                      Mbps avg
                    </span>
                  </p>
                  <p className="mt-2 text-[0.6875rem] text-[color:var(--page-fg-muted)]">
                    {countryCount} {countryCount === 1 ? "country" : "countries"} · {inRegion.length} seed
                    ISPs
                  </p>
                </GlassCard>
              );
            })}
          </RevealGroup>
        </div>
      </div>
    </Section>
  );
}

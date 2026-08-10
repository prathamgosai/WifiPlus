"use client";

import { ArrowUpRight, MapPin } from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/Section";
import { GlassCard } from "@/components/ui/GlassCard";
import { RevealGroup } from "@/components/ui/Reveal";
import { useIsp } from "@/components/providers/IspProvider";
import { providers, seoLocations } from "@/lib/providers";
import { fadeUp } from "@/lib/motion";

/**
 * Generated location landing pages. Clicking one scopes the comparison table
 * above to that city and scrolls the reader to it, which is what the page would
 * do for real once these are routed.
 */
export function SeoPages() {
  const { jumpTo } = useIsp();

  return (
    <Section id="seo" tinted>
      <SectionHeading
        eyebrow="Location SEO"
        title={
          <>
            Worldwide <span className="text-gradient">location-aware pages</span>
          </>
        }
        copy="Search-ready pages for every supported country, state, city, ISP, technology type and use case — each one backed by the same live comparison data."
      />

      <RevealGroup className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" step={0.04}>
        {seoLocations.map(([city, country]) => {
          const local = providers.filter((p) => p.city === city && p.country === country);
          const count = local.length || providers.filter((p) => p.country === country).length;

          return (
            <GlassCard key={`${city}-${country}`} variants={fadeUp} padded={false} className="group">
              <button
                type="button"
                onClick={() => jumpTo(city, country)}
                className="flex h-full w-full flex-col items-start gap-3 rounded-[var(--radius-glass)] p-5 text-start"
              >
                <span className="flex items-center gap-1.5 text-[0.625rem] font-bold uppercase tracking-[0.16em] text-[color:var(--page-fg-muted)]">
                  <MapPin size={11} className="text-accent-300" aria-hidden />
                  {country}
                </span>

                <span className="font-display text-[1.0625rem] font-bold leading-snug tracking-tight">
                  Best ISP in {city}
                </span>

                <span className="text-[0.8125rem] leading-relaxed text-[color:var(--page-fg-muted)]">
                  Rankings, reviews, coverage, fiber availability and speed test averages.
                </span>

                <span className="mt-auto flex w-full items-center justify-between pt-3 text-xs font-semibold text-accent-300">
                  {count} {count === 1 ? "provider" : "providers"} tracked
                  <ArrowUpRight
                    size={14}
                    aria-hidden
                    className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  />
                </span>
              </button>
            </GlassCard>
          );
        })}
      </RevealGroup>
    </Section>
  );
}

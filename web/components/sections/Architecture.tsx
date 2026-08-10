"use client";

import { m } from "framer-motion";
import { Section, SectionHeading } from "@/components/ui/Section";
import { FeatureGrid } from "./FeatureGrid";
import { architecture, pipeline } from "@/lib/content";
import { viewportOnce } from "@/lib/motion";

/**
 * Architecture cards plus the six-stage ISP data pipeline.
 *
 * The pipeline is a horizontal scroller on mobile with real overflow, rather
 * than a wrapping grid — the numbered order matters and wrapping breaks it.
 */
export function Architecture() {
  return (
    <Section id="architecture" tinted>
      <SectionHeading
        eyebrow="Architecture"
        title={
          <>
            Enterprise-grade <span className="text-gradient">architecture</span>
          </>
        }
        copy="Next.js and React on the edge, PostgreSQL and Redis behind normalized ISP contracts, and Cloudflare Workers wherever a secret must never reach the browser."
      />

      <FeatureGrid items={architecture} columns={3} />

      {/* ---- Data pipeline -------------------------------------------------- */}
      <div className="mt-16">
        <h3 className="text-center font-display text-sm font-bold uppercase tracking-[0.18em] text-[color:var(--page-fg-muted)]">
          Automatic ISP data pipeline
        </h3>

        <ol className="mt-8 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4 lg:grid lg:grid-cols-6 lg:overflow-visible lg:pb-0">
          {pipeline.map((stage, index) => (
            <m.li
              key={stage.n}
              initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
              whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={viewportOnce}
              transition={{ delay: index * 0.07, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="glass glass-sheen relative w-[15rem] shrink-0 snap-start rounded-2xl p-5 lg:w-auto"
            >
              {/* Connector arrow between stages on wide layouts. */}
              {index < pipeline.length - 1 && (
                <span
                  aria-hidden
                  className="absolute -end-3 top-1/2 hidden h-px w-3 -translate-y-1/2 bg-gradient-to-r from-accent-400/70 to-transparent lg:block"
                />
              )}

              <span className="tabular grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand to-accent font-display text-xs font-extrabold text-white">
                {stage.n}
              </span>
              <p className="mt-3.5 font-display text-sm font-bold tracking-tight">{stage.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-[color:var(--page-fg-muted)]">
                {stage.copy}
              </p>
            </m.li>
          ))}
        </ol>
      </div>
    </Section>
  );
}

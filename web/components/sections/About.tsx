"use client";

import { m } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/Section";
import { GlassCard } from "@/components/ui/GlassCard";
import { IconOrb } from "@/components/ui/IconOrb";
import { Counter } from "@/components/ui/Counter";
import { Reveal, RevealGroup } from "@/components/ui/Reveal";
import { NetworkCanvas } from "@/components/fx/NetworkCanvas";
import { achievements, milestones } from "@/lib/content";
import { countryCount, providerCount } from "@/lib/providers";
import { fadeUp, slideInLeft, slideInRight, viewportOnce } from "@/lib/motion";
import { site } from "@/lib/site";
import type { Tone } from "@/components/ui/tone";

const TONES: Tone[] = ["brand", "accent", "violet", "mint"];

const COUNTERS = [
  { to: providerCount, label: "seed providers", suffix: "" },
  { to: countryCount, label: "countries", suffix: "" },
  { to: 15, label: "languages", suffix: "" },
  { to: 7, label: "live metrics", suffix: "" },
];

/** Split layout: a glass visual panel on one side, the story on the other. */
export function About() {
  return (
    <Section id="about">
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
        {/* ---- Visual panel ------------------------------------------------ */}
        <Reveal variants={slideInLeft}>
          <div className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-6 -z-10 rounded-[3rem] opacity-60 blur-3xl"
              style={{
                background:
                  "radial-gradient(60% 60% at 40% 40%, color-mix(in oklab, var(--color-violet) 45%, transparent), transparent 72%)",
              }}
            />

            <div className="glass-strong glass-sheen gradient-ring-always relative overflow-hidden rounded-[var(--radius-glass-lg)]">
              <NetworkCanvas className="h-56 w-full opacity-70 sm:h-64" />

              <div className="relative border-t border-white/10 p-6 sm:p-7">
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {COUNTERS.map((counter) => (
                    <div key={counter.label}>
                      <dd className="font-display text-[1.75rem] font-extrabold leading-none text-gradient-static">
                        <Counter to={counter.to} suffix={counter.suffix} />
                      </dd>
                      <dt className="mt-1.5 text-[0.6875rem] leading-tight text-[color:var(--page-fg-muted)]">
                        {counter.label}
                      </dt>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            {/* Achievements ride below the panel. */}
            <RevealGroup className="mt-4 grid gap-3 sm:grid-cols-2" step={0.06}>
              {achievements.map((item, index) => (
                <GlassCard
                  key={item.label}
                  variants={fadeUp}
                  padded={false}
                  className="group flex items-start gap-3.5 p-4"
                >
                  <IconOrb icon={item.icon} tone={TONES[index % TONES.length]} size="sm" />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold tracking-tight">{item.label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-[color:var(--page-fg-muted)]">
                      {item.copy}
                    </span>
                  </span>
                </GlassCard>
              ))}
            </RevealGroup>
          </div>
        </Reveal>

        {/* ---- Story + timeline ---------------------------------------------- */}
        <Reveal variants={slideInRight}>
          <SectionHeading
            align="start"
            eyebrow="About"
            title={
              <>
                A speed test that tells you{" "}
                <span className="text-gradient">what to do next</span>
              </>
            }
            copy="Most speed tests hand you a download number and stop. The number that ruins a video call is usually jitter, and the fix is usually the router — so this measures all of it and then explains it."
          />

          <ol className="relative mt-9 flex flex-col gap-6 ps-8">
            {/* Timeline rail */}
            <span
              aria-hidden
              className="absolute inset-y-2 start-[0.4375rem] w-px bg-gradient-to-b from-brand via-accent to-transparent"
            />
            {milestones.map((milestone, index) => (
              <m.li
                key={milestone.year}
                initial={{ opacity: 0, x: 20, filter: "blur(8px)" }}
                whileInView={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                viewport={viewportOnce}
                transition={{ delay: index * 0.09, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="relative"
              >
                <span
                  aria-hidden
                  className="absolute -start-8 top-1.5 grid h-[0.9375rem] w-[0.9375rem] place-items-center rounded-full bg-[color:var(--page-bg)] ring-1 ring-white/20"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-br from-brand-400 to-accent-400" />
                </span>
                <p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-accent-300">
                  {milestone.year}
                </p>
                <h3 className="mt-1 font-display text-[1.0625rem] font-bold tracking-tight">
                  {milestone.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[color:var(--page-fg-muted)]">
                  {milestone.copy}
                </p>
              </m.li>
            ))}
          </ol>

          <a
            href={site.author.url}
            rel="me noopener"
            className="glass-subtle group mt-9 inline-flex items-center gap-2.5 rounded-full py-2.5 pe-4 ps-5 text-sm font-semibold transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/[0.11]"
          >
            Built by {site.author.name}
            <ArrowUpRight
              size={15}
              aria-hidden
              className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </a>
        </Reveal>
      </div>
    </Section>
  );
}

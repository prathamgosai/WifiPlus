"use client";

import { useRef } from "react";
import { m, useScroll, useSpring, useTransform } from "framer-motion";
import { Check } from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/Section";
import { GlassCard } from "@/components/ui/GlassCard";
import { IconOrb } from "@/components/ui/IconOrb";
import { steps } from "@/lib/content";
import { fadeUp, viewportOnce } from "@/lib/motion";
import type { Tone } from "@/components/ui/tone";

const TONES: Tone[] = ["brand", "accent", "violet", "mint"];

/**
 * Vertical timeline with a connector that draws itself as the section scrolls.
 *
 * The rail is a 1px track with a gradient overlay whose `scaleY` is bound to
 * scroll progress, so the line appears to grow downward with the reader.
 */
export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 72%", "end 55%"],
  });
  const railScale = useSpring(useTransform(scrollYProgress, [0, 1], [0, 1]), {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <Section id="how-it-works">
      <SectionHeading
        eyebrow="How it works"
        title={
          <>
            Four steps from <span className="text-gradient">unknown</span> to fixed
          </>
        }
        copy="No account, no download, no waiting. Everything below happens in the tab you already have open."
      />

      <div ref={ref} className="relative mt-16">
        {/* Connector rail — hidden on small screens where cards stack full width. */}
        <div
          aria-hidden
          className="absolute inset-y-0 start-[1.6875rem] hidden w-px bg-white/10 md:block lg:start-1/2 lg:-translate-x-1/2"
        >
          <m.div
            className="h-full w-full origin-top"
            style={{
              scaleY: railScale,
              background: "linear-gradient(180deg, #8b5cf6, #5b5ff0 45%, #22d3ee)",
              boxShadow: "0 0 14px 1px rgba(34,211,238,0.55)",
            }}
          />
        </div>

        <ol className="flex flex-col gap-6 md:gap-10">
          {steps.map((step, index) => {
            const tone = TONES[index % TONES.length] ?? "brand";
            const flipped = index % 2 === 1;

            return (
              <li key={step.title} className="relative md:ps-20 lg:ps-0">
                {/* Step node sits on the rail. */}
                <m.span
                  initial={{ scale: 0, opacity: 0 }}
                  whileInView={{ scale: 1, opacity: 1 }}
                  viewport={viewportOnce}
                  transition={{ type: "spring", stiffness: 320, damping: 22, delay: 0.1 }}
                  aria-hidden
                  className="absolute start-0 top-6 z-10 hidden h-14 w-14 place-items-center md:grid lg:start-1/2 lg:-translate-x-1/2"
                >
                  <span className="glass-strong grid h-14 w-14 place-items-center rounded-full">
                    <span className="tabular font-display text-sm font-extrabold text-gradient-static">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </span>
                </m.span>

                <div
                  className={
                    flipped
                      ? "lg:ms-auto lg:w-[calc(50%-3.5rem)]"
                      : "lg:me-auto lg:w-[calc(50%-3.5rem)]"
                  }
                >
                  <m.div variants={fadeUp} initial="hidden" whileInView="show" viewport={viewportOnce}>
                    <GlassCard tilt className="group">
                      <div className="flex items-start gap-4">
                        <IconOrb icon={step.icon} tone={tone} size="lg" />
                        <div className="min-w-0">
                          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-[color:var(--page-fg-muted)]">
                            {step.kicker}
                          </p>
                          <h3 className="mt-1.5 font-display text-xl font-extrabold leading-tight tracking-tight">
                            {step.title}
                          </h3>
                        </div>
                      </div>

                      <p className="mt-4 text-[0.9375rem] leading-relaxed text-[color:var(--page-fg-muted)]">
                        {step.copy}
                      </p>

                      <ul className="mt-5 flex flex-wrap gap-2">
                        {step.detail.map((detail) => (
                          <li
                            key={detail}
                            className="glass-subtle inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-[color:var(--page-fg-muted)]"
                          >
                            <Check size={12} className="text-emerald-300" aria-hidden />
                            {detail}
                          </li>
                        ))}
                      </ul>
                    </GlassCard>
                  </m.div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </Section>
  );
}

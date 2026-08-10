"use client";

import { useState } from "react";
import { m } from "framer-motion";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { plans } from "@/lib/content";
import { EASE_GLASS, fadeUp, stagger, viewportOnce } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Cycle = "monthly" | "yearly";

/**
 * Pricing.
 *
 * NOTE: the tiers in lib/content.ts are placeholder packaging. Nothing here is
 * wired to a payment provider — the CTAs scroll to contact. Swap the plan data
 * and point the CTAs at checkout before launch.
 */
export function Pricing() {
  const [cycle, setCycle] = useState<Cycle>("yearly");

  return (
    <Section id="pricing" tinted>
      <SectionHeading
        eyebrow="Pricing"
        title={
          <>
            The whole speed test stays{" "}
            <span className="text-gradient">free, forever</span>
          </>
        }
        copy="Measurement, comparison and rankings never sit behind a paywall. Paid tiers add history, automation and API access for people who need evidence over time."
      />

      {/* ---- Billing toggle -------------------------------------------------- */}
      <Reveal className="mt-10 flex flex-col items-center gap-3">
        <div
          role="group"
          aria-label="Billing cycle"
          className="glass inline-flex items-center gap-1 rounded-full p-1.5"
        >
          {(["monthly", "yearly"] as const).map((option) => {
            const active = cycle === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => setCycle(option)}
                className={cn(
                  "relative rounded-full px-5 py-2 text-sm font-semibold capitalize transition-colors duration-300",
                  active ? "text-white" : "text-[color:var(--page-fg-muted)] hover:text-[color:var(--page-fg)]",
                )}
              >
                {active && (
                  <m.span
                    layoutId="pricing-cycle"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className="absolute inset-0 -z-10 rounded-full"
                    style={{ background: "linear-gradient(120deg, #5b5ff0, #22d3ee)" }}
                  />
                )}
                <span className="relative z-10">{option}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-[color:var(--page-fg-muted)]">
          Yearly billing saves roughly two months on every paid tier.
        </p>
      </Reveal>

      {/* ---- Plans ------------------------------------------------------------ */}
      <m.div
        variants={stagger(0.1)}
        initial="hidden"
        whileInView="show"
        viewport={viewportOnce}
        className="mt-12 grid items-start gap-4 lg:grid-cols-3"
      >
        {plans.map((plan) => {
          const price = cycle === "monthly" ? plan.monthly : plan.yearly;
          const unit = plan.monthly === 0 ? "" : cycle === "monthly" ? "/mo" : "/yr";

          return (
            <m.article
              key={plan.id}
              variants={fadeUp}
              className={cn(
                "glass glass-sheen spotlight relative flex flex-col rounded-[var(--radius-glass-lg)] p-7",
                "transition-[transform,box-shadow,background-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                plan.featured
                  ? "gradient-ring gradient-ring-always lg:-my-4 lg:scale-[1.035] hover:lg:scale-[1.06] shadow-[0_28px_70px_-28px_rgba(91,95,240,0.9)]"
                  : "gradient-ring hover:-translate-y-1.5 hover:bg-white/[0.11]",
              )}
              onPointerMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                event.currentTarget.style.setProperty(
                  "--mx",
                  `${((event.clientX - rect.left) / rect.width) * 100}%`,
                );
                event.currentTarget.style.setProperty(
                  "--my",
                  `${((event.clientY - rect.top) / rect.height) * 100}%`,
                );
              }}
            >
              {plan.featured && (
                <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-accent px-3.5 py-1.5 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-white shadow-[0_8px_24px_-8px_rgba(34,211,238,0.9)]">
                  <Sparkles size={11} aria-hidden />
                  Most popular
                </span>
              )}

              <h3 className="font-display text-lg font-extrabold tracking-tight">{plan.name}</h3>
              <p className="mt-2 min-h-[2.75rem] text-sm leading-relaxed text-[color:var(--page-fg-muted)]">
                {plan.tagline}
              </p>

              <div className="mt-6 flex items-baseline gap-1">
                {/* Keyed so the number animates when the cycle flips. */}
                <m.span
                  key={`${plan.id}-${cycle}`}
                  initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.4, ease: EASE_GLASS }}
                  className="tabular font-display text-[2.75rem] font-extrabold leading-none tracking-tight"
                >
                  {price === 0 ? "Free" : `$${price}`}
                </m.span>
                {unit && (
                  <span className="text-sm font-semibold text-[color:var(--page-fg-muted)]">{unit}</span>
                )}
              </div>

              <div className="rule-fade my-6" />

              <ul className="flex flex-1 flex-col gap-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm">
                    <span
                      aria-hidden
                      className="mt-0.5 grid h-[1.125rem] w-[1.125rem] shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-accent"
                    >
                      <Check size={11} strokeWidth={3.2} className="text-white" />
                    </span>
                    <span className="text-[color:var(--page-fg-muted)]">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                variant={plan.featured ? "primary" : "glass"}
                size="lg"
                magnetic={plan.featured}
                className="mt-7 w-full"
                onClick={() =>
                  document
                    .getElementById(plan.id === "free" ? "speed-test" : "contact")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                {plan.cta}
                <ArrowRight size={15} aria-hidden />
              </Button>
            </m.article>
          );
        })}
      </m.div>

      <Reveal className="mt-8">
        <p className="mx-auto max-w-2xl text-center text-xs leading-relaxed text-[color:var(--page-fg-muted)]">
          Placeholder packaging — no payment provider is connected yet. The free tier reflects what
          the product does today; paid tiers describe the roadmap.
        </p>
      </Reveal>
    </Section>
  );
}

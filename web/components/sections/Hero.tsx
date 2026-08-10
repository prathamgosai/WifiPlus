"use client";

import { useRef } from "react";
import { m, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { NetworkCanvas } from "@/components/fx/NetworkCanvas";
import { Particles } from "@/components/fx/Particles";
import { SpeedDashboard } from "./SpeedDashboard";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Counter } from "@/components/ui/Counter";
import { TypingText } from "@/components/ui/TypingText";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useSpeedTestContext } from "@/components/providers/SpeedTestProvider";
import { usePlatformNotice } from "@/hooks/useInstallPrompt";
import { capabilityChips, heroStats } from "@/lib/content";
import { EASE_EXPO } from "@/lib/motion";

const ROTATING = ["anywhere on Earth", "in your browser", "in five seconds", "without a signup"];

/**
 * Above the fold.
 *
 * Two layers of parallax: the network canvas drifts on scroll, and the
 * dashboard shifts slightly against the copy. Both are driven by motion values
 * so scrolling stays off the React render path.
 */
export function Hero() {
  const { t, locale } = useLocale();
  const { run } = useSpeedTestContext();
  const platform = usePlatformNotice();
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const soft = { stiffness: 90, damping: 26, restDelta: 0.001 };
  const canvasY = useSpring(useTransform(scrollYProgress, [0, 1], [0, 160]), soft);
  const copyY = useSpring(useTransform(scrollYProgress, [0, 1], [0, 60]), soft);
  const fade = useTransform(scrollYProgress, [0, 0.85], [1, 0]);

  return (
    <section
      ref={ref}
      id="speed-test"
      className="relative isolate overflow-hidden pb-20 pt-32 sm:pb-28 sm:pt-40 lg:pb-36 lg:pt-44"
      aria-label="Internet speed test"
    >
      {/* ---- Backdrop ---------------------------------------------------- */}
      <m.div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-[1]"
        style={reduced ? undefined : { y: canvasY, opacity: fade }}
      >
        <NetworkCanvas className="absolute inset-0 h-full w-full opacity-55" />
      </m.div>
      <Particles count={22} className="-z-[1] opacity-70" />

      <div className="shell">
        {/* The dial is the product, so it gets its own full-width row from lg up
            rather than half of a two-column hero — at half width the 65/35 split
            inside the panel left the gauge about a third of the viewport, which
            is smaller than the metric cards beside it. Below lg the two stack
            anyway, so nothing changes on mobile. */}
        <div className="grid items-center gap-14 lg:gap-12 xl:gap-16">
          {/* ---- Copy ------------------------------------------------------ */}
          <m.div style={reduced ? undefined : { y: copyY }} className="max-w-2xl">
            <m.a
              href="#how-it-works"
              initial={{ opacity: 0, y: -12, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.7, ease: EASE_EXPO }}
              className="glass glass-sheen group inline-flex items-center gap-2.5 rounded-full py-1.5 pe-3.5 ps-2 text-[0.75rem] font-medium text-[color:var(--page-fg-muted)] transition-colors hover:text-[color:var(--page-fg)]"
            >
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-accent px-2.5 py-1 text-[0.625rem] font-bold uppercase tracking-[0.12em] text-white">
                <Sparkles size={11} aria-hidden />
                New
              </span>
              AI WiFi Doctor reads your router screenshot
              <ArrowRight
                size={13}
                aria-hidden
                className="transition-transform duration-300 group-hover:translate-x-0.5"
              />
            </m.a>

            <m.h1
              initial={{ opacity: 0, y: 26, filter: "blur(16px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.9, ease: EASE_EXPO, delay: 0.1 }}
              className="mt-6 text-[clamp(2.5rem,6.4vw,4.75rem)] font-extrabold leading-[0.98]"
            >
              {/*
                The rotating words are English. Showing them under a translated
                headline would produce a bilingual sentence, so other locales get
                their full localized title with a gradient tail instead.
              */}
              {locale === "en" ? (
                <>
                  Test your internet speed
                  <br className="hidden sm:block" />
                  <TypingText words={ROTATING} className="mt-1" />
                </>
              ) : (
                <span className="text-gradient">{t.heroTitle}</span>
              )}
            </m.h1>

            <m.p
              initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.85, ease: EASE_EXPO, delay: 0.22 }}
              className="mt-6 max-w-xl text-[1.0625rem] leading-relaxed text-[color:var(--page-fg-muted)]"
            >
              {t.heroCopy}
            </m.p>

            <m.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: EASE_EXPO, delay: 0.32 }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <Button variant="primary" size="lg" magnetic onClick={run}>
                {t.startTest}
                <ArrowRight size={16} aria-hidden />
              </Button>
              <ButtonLink href="#intelligence" variant="glass" size="lg">
                Explore ISP data
              </ButtonLink>
            </m.div>

            {/* Capability chips — concrete, checkable claims. */}
            <m.ul
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.45 }}
              className="mt-7 flex flex-wrap gap-2"
            >
              {capabilityChips.map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="glass-subtle inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-[color:var(--page-fg-muted)]"
                >
                  <Icon size={12} className="text-accent-300" aria-hidden />
                  {label}
                </li>
              ))}
            </m.ul>

            <m.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.55 }}
              className="mt-5 text-[0.8125rem] text-[color:var(--page-fg-muted)]/85"
            >
              {platform}
            </m.p>

            {/* ---- Stat strip --------------------------------------------- */}
            <m.dl
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: EASE_EXPO, delay: 0.6 }}
              className="mt-10 grid max-w-lg grid-cols-2 gap-3 sm:grid-cols-4"
            >
              {heroStats.map((stat) => (
                <div key={stat.label} className="glass-subtle rounded-2xl px-3.5 py-3">
                  <dt className="sr-only">{stat.label}</dt>
                  <dd>
                    <span className="font-display text-2xl font-extrabold tracking-tight">
                      <Counter to={stat.value} suffix={stat.suffix} />
                    </span>
                    <span className="mt-0.5 block text-[0.6875rem] leading-tight text-[color:var(--page-fg-muted)]">
                      {stat.label}
                    </span>
                  </dd>
                </div>
              ))}
            </m.dl>
          </m.div>

          {/* ---- Dashboard -------------------------------------------------- */}
          <div className="relative">
            <SpeedDashboard />

            {/* Floating satellite cards — depth around the main panel. */}
            <FloatingCard
              className="-left-4 top-[18%] hidden xl:block"
              delay={1.1}
              label="Health score"
              value="Live"
              detail="6 use-case grades"
            />
            <FloatingCard
              className="-right-6 bottom-[12%] hidden xl:block"
              delay={1.35}
              label="Edge node"
              value="Nearest"
              detail="Auto-selected"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Small glass chip that drifts beside the dashboard. Decorative only. */
function FloatingCard({
  className = "",
  delay,
  label,
  value,
  detail,
}: {
  className?: string;
  delay: number;
  label: string;
  value: string;
  detail: string;
}) {
  const reduced = useReducedMotion();

  return (
    <m.div
      aria-hidden
      initial={{ opacity: 0, scale: 0.8, filter: "blur(12px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.8, ease: EASE_EXPO, delay }}
      className={`absolute z-10 ${className}`}
    >
      <div className={`glass glass-sheen rounded-2xl px-4 py-3 ${reduced ? "" : "animate-float"}`}>
        <p className="text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-[color:var(--page-fg-muted)]">
          {label}
        </p>
        <p className="mt-1 font-display text-lg font-extrabold leading-none text-gradient-static">
          {value}
        </p>
        <p className="mt-1 text-[0.6875rem] text-[color:var(--page-fg-muted)]">{detail}</p>
      </div>
    </m.div>
  );
}

"use client";

import { useRef } from "react";
import { m, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import { Ban, HardDrive, Lock, MonitorSmartphone, UserRoundX } from "lucide-react";
import { NetworkStage } from "@/components/three/NetworkStage";
import { GaugePanel } from "@/components/hero/GaugePanel";
import { HeroActions } from "@/components/hero/HeroActions";
import { useLocale } from "@/components/providers/LocaleProvider";
import { EASE_EXPO } from "@/lib/motion";

/**
 * Above the fold.
 * -----------------------------------------------------------------------------
 * The speed test is the product, so it owns the first viewport: the dial is the
 * largest object on the page and the primary CTA sits directly beside it.
 *
 * This component deliberately does NOT subscribe to the measurement store.
 * `HeroActions` and `GaugePanel` each subscribe to the slice they need, so a
 * run — which writes to the store dozens of times a second — re-renders those
 * two and nothing else. If this component read the store, every metric callback
 * would re-render the headline, the trust strip and the 3D stage element too.
 */

/**
 * The trust ribbon. Five checkable claims, deliberately understated — these are
 * reasons to proceed, not features to sell, and sizing them like features would
 * push the dial down the page.
 */
const TRUST = [
  { Icon: UserRoundX, label: "No sign-up" },
  { Icon: Ban, label: "No ads" },
  { Icon: MonitorSmartphone, label: "Measured in your browser" },
  { Icon: Lock, label: "Privacy-first" },
  { Icon: HardDrive, label: "Results stored locally" },
];

export function Hero() {
  const { t, locale } = useLocale();
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement>(null);

  /* Parallax on the backdrop only. Driven by motion values, so scrolling never
     enters the React render path. */
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const soft = { stiffness: 90, damping: 26, restDelta: 0.001 };
  const backdropY = useSpring(useTransform(scrollYProgress, [0, 1], [0, 140]), soft);
  const fade = useTransform(scrollYProgress, [0, 0.85], [1, 0]);

  return (
    <section
      ref={ref}
      id="speed-test"
      className="relative isolate overflow-hidden pb-16 pt-28 sm:pb-24 sm:pt-36 lg:pb-28 lg:pt-40"
      aria-label="Internet speed test"
    >
      {/* ---- 3D backdrop ------------------------------------------------- */}
      <m.div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-[1]"
        style={reduced ? undefined : { y: backdropY, opacity: fade }}
      >
        <NetworkStage />
      </m.div>

      <div className="shell">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,40fr)_minmax(0,60fr)] lg:gap-10 xl:gap-14">
          {/* ---- Copy ---------------------------------------------------- */}
          <m.div
            initial={reduced ? false : { opacity: 0, y: 24, filter: "blur(12px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.85, ease: EASE_EXPO }}
            className="max-w-xl"
          >
            <span className="glass-subtle inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--page-fg-muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-br from-brand-400 to-accent-400 shadow-[0_0_10px_2px_rgba(34,211,238,0.55)]" />
              Real-time internet intelligence
            </span>

            <h1 className="mt-6 text-[clamp(2.375rem,5.2vw,3.875rem)] font-extrabold leading-[1.02]">
              {/* Other locales get their translated headline. Splicing an English
                  phrase into a translated sentence produces a bilingual line. */}
              {locale === "en" ? (
                <>
                  See what your internet is{" "}
                  <span className="text-gradient">really capable of.</span>
                </>
              ) : (
                <span className="text-gradient">{t.heroTitle}</span>
              )}
            </h1>

            <p className="mt-5 max-w-lg text-[1.0625rem] leading-relaxed text-[color:var(--page-fg-muted)]">
              {locale === "en"
                ? "Measure speed, latency, stability and network health using real data from your own connection — then find out what is holding it back."
                : t.heroCopy}
            </p>

            <HeroActions className="mt-8" />

            {/* ---- Trust ribbon ---------------------------------------- */}
            <m.ul
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.4 }}
              className="mt-8 flex flex-wrap gap-x-4 gap-y-2"
            >
              {TRUST.map(({ Icon, label }) => (
                <li
                  key={label}
                  className="inline-flex items-center gap-1.5 text-[0.75rem] font-medium text-[color:var(--page-fg-muted)]"
                >
                  <Icon size={12} className="text-accent-300/80" aria-hidden />
                  {label}
                </li>
              ))}
            </m.ul>
          </m.div>

          {/* ---- Instrument --------------------------------------------- */}
          <div className="relative">
            <GaugePanel />

            {/*
              The one sentence that keeps an animated network from reading as a
              measured one. A browser has no ICMP, no traceroute and no view of
              a router or a WiFi radio; the scene behind this panel is an
              illustration of the path, animated by figures that were genuinely
              measured. Saying so is not a disclaimer — it is the difference
              between a diagnostic tool and a decorative one.
            */}
            <p className="mt-3 text-center text-[0.6875rem] leading-relaxed text-[color:var(--page-fg-muted)]/75">
              The network behind this panel is an illustration of the path your test takes, animated
              by the run&rsquo;s real throughput and probe timings. It is not a live view of your
              router or the hops between you and the edge — a browser cannot see those.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

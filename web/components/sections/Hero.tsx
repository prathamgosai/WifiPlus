"use client";

import { useEffect, useRef } from "react";
import { m, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { Ban, HardDrive, Lock, MonitorSmartphone, UserRoundX } from "lucide-react";
import { NetworkStage } from "@/components/three/NetworkStage";
import { pointerDrive, trackPointer } from "@/components/three/pointer";
import { HOPS } from "@/lib/hops";
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

  /*
   * The 3D camera's pointer source. The listener goes on this <section> rather
   * than on the canvas: every layer between them is `pointer-events-none` so
   * that the canvas can never swallow a click meant for the Start button, which
   * also means the canvas never receives a pointermove. The section does.
   *
   * ~0.25 KB and one passive listener — the only initial-bundle growth in this
   * pass, and it must stay that small.
   */
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return trackPointer(element);
  }, []);

  /*
   * Scroll drives the 3D CAMERA, not the canvas rectangle.
   *
   * This used to animate the wrapper's `y` from 0 to 140, which slides the
   * whole rendered image around as a DOM layer while its internal parallax
   * stays frozen — the classic "video behind a div" artefact. Publishing the
   * progress to the module instead lets `CameraRig` dolly the camera back, so
   * the perspective genuinely changes with scroll. The opacity fade stays: that
   * one is a real crossfade into the page below.
   */
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const fade = useTransform(scrollYProgress, [0, 0.85], [1, 0]);

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    pointerDrive.scrollP = value;
  });

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
        style={reduced ? undefined : { opacity: fade }}
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
              THE HOP LEGEND.
              The topology gives every node a label and, until now, rendered it
              nowhere: the canvas is aria-hidden, so the names of the hops
              existed in the DOM zero times. Plain markup, deliberately visible
              rather than sr-only — it reads as a legend and earns its space —
              and it works on the tier where no 3D renders at all.

              Imported from `lib/hops.ts`, NOT from `components/three/topology`.
              That module imports `three` for its Vector3 positions, and Hero is
              statically imported by the homepage — so taking the labels from
              there pulled the whole of three into the INITIAL bundle. Measured
              at 211 KB to 308 KB gzipped, from one import of a five-element
              array. See the header of lib/hops.ts.
            */}
            <ol className="mt-3 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-[color:var(--page-fg-muted)]">
              {HOPS.map((hop, index) => (
                <li key={hop.id} className="inline-flex items-center gap-1.5">
                  {index > 0 && <span aria-hidden className="text-[color:var(--page-fg-muted)]/40">→</span>}
                  {hop.label}
                </li>
              ))}
            </ol>

            {/*
              The sentences that keep an animated network from reading as a
              measured one. A browser has no ICMP, no traceroute and no view of
              a router or a WiFi radio; the scene behind this panel is an
              illustration of the path, animated by figures that were genuinely
              measured. Saying so is not a disclaimer — it is the difference
              between a diagnostic tool and a decorative one.

              The SECOND sentence is a hard requirement of the per-hop verdict
              colours: once individual hops turn amber or green, the diagram
              starts to look like five independently observed measurement
              points. It is not. Every verdict is inferred from timings taken
              at this browser, by the rules in core/health.js. These two ship
              together or neither ships.
            */}
            <p className="mt-2.5 text-center text-[0.6875rem] leading-relaxed text-[color:var(--page-fg-muted)]/75">
              The network behind this panel is an illustration of the path your test takes, animated
              by the run&rsquo;s real throughput and probe timings. It is not a live view of your
              router or the hops between you and the edge — a browser cannot see those. When a hop
              is highlighted after a test, that verdict is <em>inferred</em> from timings measured
              here, not observed at the hop itself.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

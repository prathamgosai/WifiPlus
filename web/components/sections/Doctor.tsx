"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { m } from "framer-motion";
import {
  Activity,
  Globe2,
  Loader2,
  Monitor,
  Radio,
  ShieldCheck,
  Signal,
  Tv,
  UploadCloud,
  Video,
} from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/Section";
import { GlassCard } from "@/components/ui/GlassCard";
import { IconOrb } from "@/components/ui/IconOrb";
import { Reveal, RevealGroup } from "@/components/ui/Reveal";
import { useSpeedTestContext } from "@/components/providers/SpeedTestProvider";
import {
  ALLOWED_UPLOAD_TYPES,
  DOCTOR_DEFAULTS,
  DOCTOR_LABELS,
  analyseRouterScreenshot,
  foldFindings,
  validateUpload,
} from "@/lib/analyzer";
import { healthVerdict } from "@/lib/scoring";
import { fadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { DoctorCategory } from "@/types";

const SCORE_TILES = [
  { key: "health", label: "WiFi health", icon: Signal, tone: "brand" },
  { key: "gaming", label: "Gaming", icon: Radio, tone: "accent" },
  { key: "streaming", label: "Streaming", icon: Tv, tone: "violet" },
  { key: "video", label: "Video calls", icon: Video, tone: "mint" },
  { key: "work", label: "Work", icon: Monitor, tone: "brand" },
  { key: "dns", label: "DNS", icon: Globe2, tone: "accent" },
] as const;

const CATEGORY_ICON = {
  security: ShieldCheck,
  channels: Signal,
  placement: Activity,
  performance: Monitor,
} as const;

/**
 * AI Internet Analyzer + AI WiFi Doctor.
 *
 * The left column reads the scores from whichever test the visitor ran in the
 * hero (shared through SpeedTestProvider). The right column sends a router
 * screenshot to our Worker for analysis — the image is downscaled and
 * re-encoded client-side first, which also strips EXIF/GPS metadata.
 */
export function Doctor() {
  const { scores } = useSpeedTestContext();
  const verdict = scores ? healthVerdict(scores.health) : null;

  const [preview, setPreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [findings, setFindings] = useState(DOCTOR_DEFAULTS);
  const previewUrl = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Blob URLs are leaked memory until explicitly revoked.
  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  const onFile = useCallback(async (file: File) => {
    const error = validateUpload(file);
    if (error) {
      setUploadError(error);
      return;
    }
    setUploadError(null);

    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = URL.createObjectURL(file);
    setPreview(previewUrl.current);

    setAnalysing(true);
    try {
      const result = await analyseRouterScreenshot(file);
      if (!result.is_router_screenshot) {
        setFindings(DOCTOR_DEFAULTS);
        setUploadError(
          "That does not look like a router settings page. Upload a screenshot of your router's admin panel.",
        );
      } else {
        setFindings(foldFindings(result));
      }
    } catch (error) {
      setFindings(DOCTOR_DEFAULTS);
      setUploadError(`Could not analyse the screenshot: ${(error as Error).message}`);
    } finally {
      setAnalysing(false);
    }
  }, []);

  return (
    <Section id="doctor">
      <SectionHeading
        eyebrow="AI diagnosis"
        title={
          <>
            AI Internet Analyzer and{" "}
            <span className="text-gradient">AI WiFi Doctor</span>
          </>
        }
        copy="Turn raw measurements into a verdict, then hand the router itself to the model for a security, channel and placement review."
      />

      <div className="mt-14 grid gap-4 lg:grid-cols-2">
        {/* ---- Scores -------------------------------------------------------- */}
        <Reveal>
          <GlassCard tilt className="group h-full">
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-[color:var(--page-fg-muted)]">
              Current analysis
            </p>
            <h3 className="mt-1.5 font-display text-xl font-extrabold leading-snug tracking-tight">
              {verdict ? verdict.title : "Run a speed test to generate AI insights"}
            </h3>
            <p className="mt-2.5 text-sm leading-relaxed text-[color:var(--page-fg-muted)]">
              {verdict
                ? verdict.detail
                : "WifiPlus will score gaming, streaming, video calls, work from home, DNS latency and overall WiFi health from your measured result."}
            </p>

            <dl className="mt-7 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {SCORE_TILES.map((tile, index) => {
                const value = scores?.[tile.key] ?? null;
                return (
                  <m.div
                    key={tile.key}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.05, duration: 0.45 }}
                    className="glass-subtle rounded-2xl px-3.5 py-3.5"
                  >
                    <dt className="flex items-center gap-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--page-fg-muted)]">
                      <tile.icon size={11} aria-hidden />
                      {tile.label}
                    </dt>
                    <dd
                      className={cn(
                        "tabular mt-2 font-display text-2xl font-extrabold leading-none",
                        value === null ? "text-[color:var(--page-fg-muted)]/45" : "text-gradient-static",
                      )}
                    >
                      {value ?? "—"}
                    </dd>
                    {/* Score meter — instantly comparable across tiles. */}
                    <span className="mt-2.5 block h-1 w-full overflow-hidden rounded-full bg-white/10">
                      <m.span
                        className="block h-full rounded-full"
                        style={{ background: "linear-gradient(90deg,#5b5ff0,#22d3ee)" }}
                        initial={{ width: 0 }}
                        animate={{ width: value ? `${value}%` : "0%" }}
                        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </span>
                  </m.div>
                );
              })}
            </dl>
          </GlassCard>
        </Reveal>

        {/* ---- Screenshot analysis -------------------------------------------- */}
        <Reveal delay={0.08}>
          <GlassCard spotlight={false} className="flex h-full flex-col">
            <div className="flex items-center gap-3.5">
              <IconOrb icon={UploadCloud} tone="accent" />
              <div>
                <p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-[color:var(--page-fg-muted)]">
                  Router review
                </p>
                <h3 className="mt-1 font-display text-lg font-extrabold tracking-tight">
                  Upload a router settings screenshot
                </h3>
              </div>
            </div>

            <p className="mt-3.5 text-sm leading-relaxed text-[color:var(--page-fg-muted)]">
              Downscaled and re-encoded in your browser first, which strips EXIF metadata including
              GPS. The API key lives in a Cloudflare Worker, never in this page.
            </p>

            {/* Drop zone. Real <input type=file> underneath, so keyboard works. */}
            <label
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files?.[0];
                if (file) void onFile(file);
              }}
              className="glass-subtle group/drop mt-5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-dashed px-6 py-8 text-center transition-colors duration-300 hover:bg-white/[0.09] focus-within:ring-2 focus-within:ring-accent/60"
            >
              <UploadCloud
                size={22}
                aria-hidden
                className="text-accent-300 transition-transform duration-400 group-hover/drop:-translate-y-0.5"
              />
              <span className="text-sm font-semibold">Drop a screenshot, or browse</span>
              <span className="text-xs text-[color:var(--page-fg-muted)]">
                PNG, JPEG or WebP · up to 8 MB
              </span>
              <input
                ref={inputRef}
                type="file"
                accept={ALLOWED_UPLOAD_TYPES.join(",")}
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onFile(file);
                  event.target.value = "";
                }}
              />
            </label>

            {preview && (
              <m.figure
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass-subtle mt-3.5 overflow-hidden rounded-2xl p-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL, never optimizable */}
                <img
                  src={preview}
                  alt="Uploaded router settings screenshot preview"
                  className="max-h-44 w-full rounded-xl object-contain"
                />
              </m.figure>
            )}

            {analysing && (
              <p className="mt-3.5 flex items-center gap-2 text-sm text-accent-300" role="status">
                <Loader2 size={14} className="animate-spin" aria-hidden />
                Analysing your screenshot…
              </p>
            )}

            {uploadError && (
              <p role="alert" className="mt-3.5 text-sm leading-relaxed text-amber-300">
                {uploadError}
              </p>
            )}

            <RevealGroup className="mt-5 grid gap-2.5 sm:grid-cols-2" step={0.05}>
              {(Object.keys(findings) as DoctorCategory[]).map((category) => {
                const Icon = CATEGORY_ICON[category];
                return (
                  <m.div
                    key={category}
                    variants={fadeUp}
                    className="glass-subtle rounded-2xl p-4"
                  >
                    <p className="flex items-center gap-2 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-[color:var(--page-fg-muted)]">
                      <Icon size={12} aria-hidden className="text-accent-300" />
                      {DOCTOR_LABELS[category]}
                    </p>
                    <p className="mt-2 text-[0.8125rem] leading-relaxed text-[color:var(--page-fg-muted)]">
                      {findings[category]}
                    </p>
                  </m.div>
                );
              })}
            </RevealGroup>
          </GlassCard>
        </Reveal>
      </div>
    </Section>
  );
}

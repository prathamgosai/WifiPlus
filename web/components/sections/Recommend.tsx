"use client";

import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Sparkles, Wand2 } from "lucide-react";
import { DataNotice, Section, SectionHeading } from "@/components/ui/Section";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { RangeField, Select, Tag, TextField } from "@/components/ui/Controls";
import { Reveal } from "@/components/ui/Reveal";
import { citiesIn, countries, providers } from "@/lib/providers";
import { scoreProvider } from "@/lib/scoring";
import type { Provider, UsageProfile } from "@/types";

const COUNTRIES = countries();

const USAGE: { value: UsageProfile; label: string }[] = [
  { value: "balanced", label: "Balanced home internet" },
  { value: "gaming", label: "Gaming" },
  { value: "streaming", label: "Streaming" },
  { value: "remote", label: "Remote work" },
  { value: "enterprise", label: "Enterprise connectivity" },
];

interface Ranked {
  provider: Provider;
  score: number;
}

/**
 * The recommendation engine. Inputs are local to this section (deliberately —
 * "where should I buy" is a different question from "what am I looking at" in
 * the explorer above, and sharing state between them surprised testers).
 */
export function Recommend() {
  const [country, setCountry] = useState("India");
  const [city, setCity] = useState("Mumbai");
  const [budget, setBudget] = useState(60);
  const [usage, setUsage] = useState<UsageProfile>("balanced");
  const [gamingNeed, setGamingNeed] = useState(7);
  const [streamingNeed, setStreamingNeed] = useState(8);

  const cities = useMemo(() => citiesIn(country), [country]);

  const compute = useCallback((): Ranked[] => {
    let candidates = providers.filter((p) => p.country === country && p.city === city);
    if (!candidates.length) candidates = providers.filter((p) => p.country === country);
    if (!candidates.length) candidates = providers;

    return candidates
      .map((provider) => ({
        provider,
        score: scoreProvider(provider, usage, budget || 999, gamingNeed, streamingNeed),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [country, city, budget, usage, gamingNeed, streamingNeed]);

  const [results, setResults] = useState<Ranked[]>(() => compute());

  return (
    <Section id="recommend">
      <SectionHeading
        eyebrow="Recommendations"
        title={
          <>
            AI ISP <span className="text-gradient">Recommendation Engine</span>
          </>
        }
        copy="Enter location, budget and usage. The engine weights speed, upload, latency, reliability, coverage, value and your stated priorities into a single fit score."
      />
      <DataNotice>
        recommendations are generated from the illustrative prototype dataset. Treat them as a
        demonstration of the matching logic, not as buying advice.
      </DataNotice>

      <div className="mt-14 grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        {/* ---- Inputs -------------------------------------------------------- */}
        <Reveal>
          <GlassCard spotlight={false} className="h-full">
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Country"
                value={country}
                options={COUNTRIES}
                onChange={(event) => {
                  const next = event.target.value;
                  setCountry(next);
                  setCity(citiesIn(next)[0] ?? "");
                }}
              />
              <Select
                label="City"
                value={city}
                options={cities}
                onChange={(event) => setCity(event.target.value)}
              />
              <TextField
                label="Monthly budget (USD)"
                type="number"
                min={5}
                value={budget}
                onChange={(event) => setBudget(Number(event.target.value))}
              />
              <Select
                label="Primary usage"
                value={usage}
                options={USAGE}
                onChange={(event) => setUsage(event.target.value as UsageProfile)}
              />
              <RangeField
                label="Gaming priority"
                min={0}
                max={10}
                value={gamingNeed}
                onChange={(event) => setGamingNeed(Number(event.target.value))}
              />
              <RangeField
                label="Streaming priority"
                min={0}
                max={10}
                value={streamingNeed}
                onChange={(event) => setStreamingNeed(Number(event.target.value))}
              />
            </div>

            <Button
              variant="primary"
              size="lg"
              magnetic
              className="mt-7 w-full sm:w-auto"
              onClick={() => setResults(compute())}
            >
              <Wand2 size={16} aria-hidden />
              Recommend providers
            </Button>
          </GlassCard>
        </Reveal>

        {/* ---- Results ------------------------------------------------------- */}
        <div className="flex flex-col gap-3">
          <AnimatePresence mode="popLayout">
            {results.map(({ provider, score }, index) => (
              <m.div
                key={`${provider.name}-${provider.city}`}
                layout
                initial={{ opacity: 0, x: 24, filter: "blur(10px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, x: -18, filter: "blur(10px)" }}
                transition={{ delay: index * 0.08, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              >
                <GlassCard
                  tilt
                  ring={index === 0 ? "always" : "hover"}
                  className="group h-full"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-[color:var(--page-fg-muted)]">
                        {index === 0 && <Sparkles size={12} className="text-accent-300" aria-hidden />}
                        {index === 0 ? "Best match" : `Alternative ${index}`}
                      </p>
                      <h3 className="mt-1.5 font-display text-lg font-extrabold tracking-tight">
                        {provider.name}
                      </h3>
                      <p className="mt-1 text-sm text-[color:var(--page-fg-muted)]">
                        {provider.plan} in {provider.city}. {provider.type}, {provider.dataCap} data.
                      </p>
                    </div>
                    <div className="glass-subtle shrink-0 rounded-2xl px-4 py-2.5 text-center">
                      <span className="tabular font-display text-2xl font-extrabold leading-none text-gradient-static">
                        {score}
                      </span>
                      <span className="mt-0.5 block text-[0.5625rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--page-fg-muted)]">
                        / 100
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <Tag>{provider.download} Mbps down</Tag>
                    <Tag>{provider.upload} Mbps up</Tag>
                    <Tag>{provider.ping} ms ping</Tag>
                    <Tag>${provider.price}/mo</Tag>
                    <Tag>{provider.reliability} reliability</Tag>
                  </div>
                </GlassCard>
              </m.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </Section>
  );
}

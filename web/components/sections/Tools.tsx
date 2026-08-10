"use client";

import { useState } from "react";
import { m } from "framer-motion";
import { Gamepad2, Sliders } from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/Section";
import { GlassCard } from "@/components/ui/GlassCard";
import { IconOrb } from "@/components/ui/IconOrb";
import { RangeField, Select, TextField } from "@/components/ui/Controls";
import { Reveal } from "@/components/ui/Reveal";
import { pingGrade, requiredBandwidth } from "@/lib/scoring";

const GAME_TARGETS = [
  { value: "35", label: "BGMI (35 ms)" },
  { value: "30", label: "Valorant (30 ms)" },
  { value: "45", label: "Free Fire (45 ms)" },
  { value: "60", label: "Casual multiplayer (60 ms)" },
];

const GRADE_TONE: Record<string, string> = {
  A: "text-emerald-300",
  B: "text-accent-300",
  C: "text-amber-300",
  D: "text-rose-300",
};

/** Two calculators that answer the questions a speed test raises. */
export function Tools() {
  return (
    <Section id="tools" tinted>
      <SectionHeading
        eyebrow="Calculators"
        title={
          <>
            Practical <span className="text-gradient">diagnostics</span>
          </>
        }
        copy="Work out what you actually need before paying for more, and whether your latency is good enough for the game you play."
      />

      <div className="mt-14 grid gap-4 lg:grid-cols-2">
        <Reveal>
          <BandwidthCalculator />
        </Reveal>
        <Reveal delay={0.08}>
          <PingCalculator />
        </Reveal>
      </div>
    </Section>
  );
}

function BandwidthCalculator() {
  const [devices, setDevices] = useState(8);
  const [streams, setStreams] = useState(2);
  const [gamers, setGamers] = useState(2);
  const [calls, setCalls] = useState(2);

  const { required, advice } = requiredBandwidth(devices, streams, gamers, calls);

  return (
    <GlassCard spotlight={false} className="group h-full">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <IconOrb icon={Sliders} tone="brand" />
          <div>
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-[color:var(--page-fg-muted)]">
              Bandwidth calculator
            </p>
            <h3 className="mt-1 font-display text-lg font-extrabold tracking-tight">
              Estimate required speed
            </h3>
          </div>
        </div>

        <div className="glass-subtle shrink-0 rounded-2xl px-4 py-2.5 text-center">
          <m.span
            key={required}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="tabular block font-display text-2xl font-extrabold leading-none text-gradient-static"
          >
            {required}
          </m.span>
          <span className="mt-0.5 block text-[0.5625rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--page-fg-muted)]">
            Mbps
          </span>
        </div>
      </div>

      <div className="mt-7 grid gap-5 sm:grid-cols-2">
        <RangeField label="Devices" min={1} max={50} value={devices} onChange={(e) => setDevices(Number(e.target.value))} />
        <RangeField label="4K streams" min={0} max={10} value={streams} onChange={(e) => setStreams(Number(e.target.value))} />
        <RangeField label="Gamers" min={0} max={10} value={gamers} onChange={(e) => setGamers(Number(e.target.value))} />
        <RangeField label="Video calls" min={0} max={12} value={calls} onChange={(e) => setCalls(Number(e.target.value))} />
      </div>

      <p className="glass-subtle mt-6 rounded-2xl px-4 py-3 text-sm leading-relaxed text-[color:var(--page-fg-muted)]">
        {advice}
      </p>
    </GlassCard>
  );
}

function PingCalculator() {
  const [target, setTarget] = useState("35");
  const [ping, setPing] = useState(28);

  const { grade, advice } = pingGrade(ping, Number(target));

  return (
    <GlassCard spotlight={false} className="group h-full">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <IconOrb icon={Gamepad2} tone="accent" />
          <div>
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-[color:var(--page-fg-muted)]">
              Gaming latency
            </p>
            <h3 className="mt-1 font-display text-lg font-extrabold tracking-tight">
              Find ideal ping targets
            </h3>
          </div>
        </div>

        <div className="glass-subtle grid h-[3.75rem] w-[3.75rem] shrink-0 place-items-center rounded-2xl">
          <m.span
            key={grade}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 24 }}
            className={`font-display text-3xl font-extrabold leading-none ${GRADE_TONE[grade] ?? ""}`}
          >
            {grade}
          </m.span>
        </div>
      </div>

      <div className="mt-7 grid gap-5 sm:grid-cols-2">
        <Select
          label="Game profile"
          value={target}
          options={GAME_TARGETS}
          onChange={(event) => setTarget(event.target.value)}
        />
        <TextField
          label="Your ping (ms)"
          type="number"
          min={1}
          max={300}
          value={ping}
          onChange={(event) => setPing(Number(event.target.value))}
        />
      </div>

      <p className="glass-subtle mt-6 rounded-2xl px-4 py-3 text-sm leading-relaxed text-[color:var(--page-fg-muted)]">
        {advice}
      </p>
    </GlassCard>
  );
}

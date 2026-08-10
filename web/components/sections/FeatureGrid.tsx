"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { IconOrb } from "@/components/ui/IconOrb";
import { RevealGroup } from "@/components/ui/Reveal";
import { fadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { FeatureItem } from "@/lib/content";

interface FeatureGridProps {
  items: FeatureItem[];
  columns?: 2 | 3 | 4;
  tilt?: boolean;
  className?: string;
}

const COLUMNS = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
} as const;

/**
 * Shared card grid behind Features, Ecosystem, Monetization, Community and
 * Architecture. One component means one hover behaviour and one spacing scale
 * across five sections.
 */
export function FeatureGrid({ items, columns = 4, tilt = true, className }: FeatureGridProps) {
  return (
    <RevealGroup className={cn("mt-14 grid gap-4", COLUMNS[columns], className)}>
      {items.map((item) => (
        <GlassCard key={item.title} variants={fadeUp} tilt={tilt} className="group h-full">
          <IconOrb icon={item.icon} tone={item.tone} />
          <h3 className="mt-5 font-display text-[1.0625rem] font-bold leading-snug tracking-tight">
            {item.title}
          </h3>
          <p className="mt-2.5 text-[0.875rem] leading-relaxed text-[color:var(--page-fg-muted)]">
            {item.copy}
          </p>
        </GlassCard>
      ))}
    </RevealGroup>
  );
}

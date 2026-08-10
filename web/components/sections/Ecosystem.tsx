"use client";

import { Section, SectionHeading } from "@/components/ui/Section";
import { FeatureGrid } from "./FeatureGrid";
import { ecosystem } from "@/lib/content";

export function Ecosystem() {
  return (
    <Section id="ecosystem" tinted>
      <SectionHeading
        eyebrow="Ecosystem"
        title={
          <>
            One platform for testing, diagnosis,{" "}
            <span className="text-gradient">content and growth</span>
          </>
        }
        copy="Real-time measurement, AI analysis, ISP data, community content, outage visibility and monetization-ready discovery surfaces — designed as one system, not eight products."
      />
      <FeatureGrid items={ecosystem} columns={4} />
    </Section>
  );
}

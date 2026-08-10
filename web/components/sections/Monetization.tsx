"use client";

import { Section, SectionHeading } from "@/components/ui/Section";
import { FeatureGrid } from "./FeatureGrid";
import { monetization } from "@/lib/content";

export function Monetization() {
  return (
    <Section id="monetization">
      <SectionHeading
        eyebrow="Business model"
        title={
          <>
            Designed for growth, trust and{" "}
            <span className="text-gradient">multi-revenue monetization</span>
          </>
        }
        copy="Affiliate partnerships, sponsored listings, premium memberships, enterprise dashboards, API access and local lead generation — none of which take anything away from the free core."
      />
      <FeatureGrid items={monetization} columns={4} />
    </Section>
  );
}

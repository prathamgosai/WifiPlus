"use client";

import { Section, SectionHeading } from "@/components/ui/Section";
import { FeatureGrid } from "./FeatureGrid";
import { features } from "@/lib/content";

export function Features() {
  return (
    <Section id="features">
      <SectionHeading
        eyebrow="The platform"
        title={
          <>
            Built for global ISP discovery,{" "}
            <span className="text-gradient">testing and recommendation</span>
          </>
        }
        copy="Structured for fiber, cable, wireless, fixed wireless, mobile, satellite, government-owned, private, regional and enterprise providers alike."
      />
      <FeatureGrid items={features} columns={4} />
    </Section>
  );
}

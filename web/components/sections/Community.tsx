"use client";

import { Section, SectionHeading } from "@/components/ui/Section";
import { FeatureGrid } from "./FeatureGrid";
import { community } from "@/lib/content";

export function Community() {
  return (
    <Section id="community" tinted>
      <SectionHeading
        eyebrow="Community"
        title={
          <>
            Community, reviews and <span className="text-gradient">trust</span>
          </>
        }
        copy="Accounts, speed history, ISP reviews, ratings, forums and shareable result cards — the loop that turns a one-off diagnostic into something people come back to."
      />
      <FeatureGrid items={community} columns={4} />
    </Section>
  );
}

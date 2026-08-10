"use client";

import { Section, SectionHeading } from "@/components/ui/Section";
import { Accordion } from "@/components/ui/Accordion";
import { Reveal } from "@/components/ui/Reveal";
import { faqs } from "@/lib/content";

export function Faq() {
  return (
    <Section id="faq">
      <SectionHeading
        eyebrow="FAQ"
        title={
          <>
            Questions, <span className="text-gradient">answered honestly</span>
          </>
        }
        copy="Including the ones about what this measures, what it does not, and which numbers on this page are real."
      />

      <Reveal className="mx-auto mt-14 max-w-3xl">
        <Accordion items={faqs} />
      </Reveal>
    </Section>
  );
}

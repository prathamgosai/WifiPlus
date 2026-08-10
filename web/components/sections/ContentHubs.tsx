"use client";

import { ArrowUpRight } from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/Section";
import { GlassCard } from "@/components/ui/GlassCard";
import { IconOrb } from "@/components/ui/IconOrb";
import { RevealGroup } from "@/components/ui/Reveal";
import { contentHubs } from "@/lib/content";
import { fadeUp } from "@/lib/motion";
import type { Tone } from "@/components/ui/tone";

const TONES: Tone[] = ["brand", "accent", "violet"];

export function ContentHubs() {
  return (
    <Section id="content">
      <SectionHeading
        eyebrow="Editorial"
        title={
          <>
            Content and <span className="text-gradient">SEO ecosystem</span>
          </>
        }
        copy="Editorial hubs build durable organic traffic around ISP reviews, broadband guides, troubleshooting, routers, gaming, streaming, fiber and telecom news."
      />

      <RevealGroup className="mt-14 grid gap-4 lg:grid-cols-3" step={0.08}>
        {contentHubs.map((hub, index) => (
          <GlassCard key={hub.kicker} variants={fadeUp} tilt className="group">
            <div className="flex items-center gap-3.5">
              <IconOrb icon={hub.icon} tone={TONES[index % TONES.length]} />
              <h3 className="font-display text-[1.0625rem] font-bold tracking-tight">{hub.kicker}</h3>
            </div>

            <ul className="mt-6 flex flex-col">
              {hub.links.map((link) => (
                <li key={link}>
                  <a
                    href="#content"
                    className="group/link flex items-center justify-between gap-3 border-t border-white/[0.07] py-3 text-sm transition-colors first:border-t-0 hover:text-accent-300"
                  >
                    <span className="text-[color:var(--page-fg-muted)] transition-colors group-hover/link:text-[color:var(--page-fg)]">
                      {link}
                    </span>
                    <ArrowUpRight
                      size={14}
                      aria-hidden
                      className="shrink-0 text-[color:var(--page-fg-muted)] transition-all duration-300 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 group-hover/link:text-accent-300"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </GlassCard>
        ))}
      </RevealGroup>
    </Section>
  );
}

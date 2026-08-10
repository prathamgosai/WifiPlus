"use client";

import { Star } from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/Section";
import { Marquee } from "@/components/ui/Marquee";
import { Reveal } from "@/components/ui/Reveal";
import { testimonials } from "@/lib/content";
import type { Testimonial } from "@/lib/content";

/**
 * Two counter-scrolling marquee rows.
 *
 * The quotes in lib/content.ts are explicitly labelled placeholders and the
 * names read as "Sample Reviewer A" — invented reviews presented as genuine are
 * not something to ship. Replace with attributed quotes before launch.
 */
export function Testimonials() {
  const half = Math.ceil(testimonials.length / 2);
  const rowOne = testimonials.slice(0, half);
  const rowTwo = testimonials.slice(half);

  return (
    <Section id="testimonials">
      <SectionHeading
        eyebrow="Reception"
        title={
          <>
            Built for people who want the{" "}
            <span className="text-gradient">actual numbers</span>
          </>
        }
        copy="What the diagnostics are used for, in the words of the people using them."
      />

      <div className="mt-14 flex flex-col gap-5">
        <Marquee duration={58}>
          {rowOne.map((item) => (
            <TestimonialCard key={item.name} {...item} />
          ))}
        </Marquee>
        <Marquee duration={66} reverse>
          {rowTwo.map((item) => (
            <TestimonialCard key={item.name} {...item} />
          ))}
        </Marquee>
      </div>

      <Reveal className="mt-10">
        <p className="mx-auto max-w-2xl text-center text-xs leading-relaxed text-[color:var(--page-fg-muted)]">
          Placeholder content — these are illustrative quotes, not real customer reviews. Replace
          them with attributed testimonials before publishing.
        </p>
      </Reveal>
    </Section>
  );
}

function TestimonialCard({ quote, name, role, initials, rating }: Testimonial) {
  return (
    <figure className="glass glass-sheen gradient-ring w-[19rem] shrink-0 rounded-[var(--radius-glass)] p-6 transition-colors duration-500 hover:bg-white/[0.12] sm:w-[23rem]">
      <div className="flex gap-0.5" aria-label={`${rating} out of 5`}>
        {Array.from({ length: 5 }, (_, index) => (
          <Star
            key={index}
            size={13}
            aria-hidden
            className={
              index < rating ? "fill-amber-300 text-amber-300" : "text-[color:var(--page-fg-muted)]/35"
            }
          />
        ))}
      </div>

      <blockquote className="mt-4 text-[0.9375rem] leading-relaxed text-[color:var(--page-fg-muted)]">
        “{quote}”
      </blockquote>

      <figcaption className="mt-5 flex items-center gap-3">
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full font-display text-xs font-extrabold text-white"
          style={{ background: "linear-gradient(135deg,#8b5cf6,#5b5ff0 50%,#22d3ee)" }}
        >
          {initials}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold tracking-tight">{name}</span>
          <span className="block truncate text-xs text-[color:var(--page-fg-muted)]">{role}</span>
        </span>
      </figcaption>
    </figure>
  );
}

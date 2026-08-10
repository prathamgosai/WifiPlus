"use client";

import { m } from "framer-motion";
import type { Variants } from "framer-motion";
import { EASE_GLASS, fadeUp, stagger, viewportOnce } from "@/lib/motion";

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  variants?: Variants;
  delay?: number;
  as?: "div" | "section" | "article" | "li" | "span" | "p" | "h2";
}

/**
 * Scroll-reveal wrapper. Fires once — re-animating on every scroll-back is the
 * fastest way to make a long page feel cheap.
 */
export function Reveal({ children, className, variants = fadeUp, delay = 0, as = "div" }: RevealProps) {
  const Tag = m[as] as typeof m.div;
  return (
    <Tag
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="show"
      viewport={viewportOnce}
      // A bare `{ delay }` would replace the variant's transition wholesale and
      // fall back to Framer's defaults, so the timing is restated here.
      transition={delay ? { duration: 0.75, ease: EASE_GLASS, delay } : undefined}
    >
      {children}
    </Tag>
  );
}

/**
 * Parent for a group of Reveals — children cascade instead of appearing as one
 * block. Children must declare `variants` (GlassCard takes a `variants` prop).
 */
export function RevealGroup({
  children,
  className,
  step = 0.07,
  delay = 0,
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  step?: number;
  delay?: number;
  as?: "div" | "ul" | "section";
}) {
  const Tag = m[as] as typeof m.div;
  return (
    <Tag
      className={className}
      variants={stagger(step, delay)}
      initial="hidden"
      whileInView="show"
      viewport={viewportOnce}
    >
      {children}
    </Tag>
  );
}

"use client";

import { m } from "framer-motion";
import { fadeUp, viewportOnce } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Small uppercase label above a heading. Sets the section's category. */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "glass-subtle inline-flex items-center gap-2 rounded-full px-3.5 py-1.5",
        "text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--page-fg-muted)]",
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-br from-brand-400 to-accent-400 shadow-[0_0_10px_2px_rgba(34,211,238,0.55)]" />
      {children}
    </span>
  );
}

interface SectionHeadingProps {
  eyebrow?: string;
  title: React.ReactNode;
  copy?: React.ReactNode;
  align?: "center" | "start";
  className?: string;
}

/** Consistent eyebrow → headline → deck stack used by every section. */
export function SectionHeading({
  eyebrow,
  title,
  copy,
  align = "center",
  className,
}: SectionHeadingProps) {
  return (
    <m.header
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={viewportOnce}
      className={cn(
        "flex flex-col gap-5",
        align === "center" ? "mx-auto max-w-3xl items-center text-center" : "items-start text-start",
        className,
      )}
    >
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="text-balance text-[clamp(2rem,4.6vw,3.5rem)] font-extrabold leading-[1.05]">
        {title}
      </h2>
      {copy && (
        <p className="max-w-2xl text-pretty text-[0.9875rem] leading-relaxed text-[color:var(--page-fg-muted)] sm:text-base">
          {copy}
        </p>
      )}
    </m.header>
  );
}

interface SectionProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  /** Adds a faint tinted plate behind the section to alternate rhythm. */
  tinted?: boolean;
  "aria-label"?: string;
}

export function Section({ id, children, className, tinted = false, ...rest }: SectionProps) {
  return (
    <section id={id} className={cn("section-shell", className)} {...rest}>
      {tinted && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-[1]"
          style={{
            background:
              "linear-gradient(180deg, transparent, color-mix(in oklab, var(--page-fg) 3%, transparent) 22%, color-mix(in oklab, var(--page-fg) 3%, transparent) 78%, transparent)",
          }}
        />
      )}
      <div className="shell">{children}</div>
    </section>
  );
}

/** The recurring "this is sample data" disclosure. */
export function DataNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="glass-subtle mx-auto mt-6 max-w-3xl rounded-2xl px-5 py-3.5 text-[0.8125rem] leading-relaxed text-[color:var(--page-fg-muted)]">
      <strong className="font-semibold text-[color:var(--page-fg)]">Sample data — </strong>
      {children}
    </p>
  );
}

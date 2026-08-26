"use client";

import { CircleHelp, Cpu, Ruler, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Where a number came from.
 * -----------------------------------------------------------------------------
 * The single most important component in the result. Every figure this product
 * shows is one of four things, and conflating them is the failure mode the
 * whole engine is built to avoid:
 *
 *   MEASURED     Observed directly this run. Bytes over the wire, probes that
 *                returned. The engine can defend the number.
 *   INFERRED     Derived from measurements by a stated rule. Real reasoning
 *                over real data, but a conclusion rather than an observation —
 *                "your router is queueing" is inferred from latency under load,
 *                not read off the router.
 *   ESTIMATED    A modelled figure, not specific to this connection.
 *   UNAVAILABLE  The browser cannot see this. Said plainly, with why.
 *
 * The badge is small on purpose. It should be findable next to every claim
 * without competing with the claim itself.
 */

export type Provenance = "measured" | "inferred" | "estimated" | "unavailable";

const STYLES: Record<Provenance, { label: string; className: string; Icon: typeof Ruler }> = {
  measured: {
    label: "Measured",
    className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    Icon: Ruler,
  },
  inferred: {
    label: "Inferred",
    className: "border-accent-400/30 bg-accent-400/10 text-accent-300",
    Icon: Wand2,
  },
  estimated: {
    label: "Estimated",
    className: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    Icon: Cpu,
  },
  unavailable: {
    label: "Unavailable in browser",
    className: "border-white/15 bg-white/[0.05] text-[color:var(--page-fg-muted)]",
    Icon: CircleHelp,
  },
};

export function ProvenanceBadge({
  kind,
  /** Replaces the default wording — e.g. naming what was measured. */
  label,
  /** Native tooltip carrying the explanation. Keyboard users get it via title. */
  hint,
  className,
}: {
  kind: Provenance;
  label?: string;
  hint?: string;
  className?: string;
}) {
  const style = STYLES[kind];
  const { Icon } = style;

  return (
    <span
      title={hint}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
        "text-[0.5625rem] font-bold uppercase tracking-[0.12em]",
        style.className,
        className,
      )}
    >
      <Icon size={9} strokeWidth={2.5} aria-hidden />
      {label ?? style.label}
    </span>
  );
}

"use client";

import { cn } from "@/lib/utils";

/**
 * Brand mark: three concentric signal arcs over a gradient node.
 * Inline SVG so it inherits the gradient and costs no network request.
 */
export function Logo({ className, showWordmark = true }: { className?: string; showWordmark?: boolean }) {
  return (
    <span className={cn("group inline-flex items-center gap-2.5", className)}>
      <span className="glass relative grid h-9 w-9 place-items-center overflow-hidden rounded-[0.7rem]">
        <span
          aria-hidden
          className="absolute inset-0 opacity-80 transition-opacity duration-500 group-hover:opacity-100"
          style={{ background: "linear-gradient(135deg, #8b5cf6 0%, #5b5ff0 50%, #22d3ee 100%)" }}
        />
        <svg
          viewBox="0 0 24 24"
          width="19"
          height="19"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          className="relative z-10 text-white"
          aria-hidden
        >
          <path d="M2.6 9.2a15 15 0 0 1 18.8 0" opacity="0.55" />
          <path d="M5.7 12.6a10.2 10.2 0 0 1 12.6 0" opacity="0.8" />
          <path d="M8.8 16a5.4 5.4 0 0 1 6.4 0" />
          <circle cx="12" cy="19.4" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      </span>

      {showWordmark && (
        <span className="font-display text-[1.0625rem] font-extrabold tracking-tight">
          Wifi<span className="text-gradient-static">Plus</span>
        </span>
      )}
    </span>
  );
}

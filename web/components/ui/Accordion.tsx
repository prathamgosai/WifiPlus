"use client";

import { useId, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Plus } from "lucide-react";
import { collapse } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface AccordionItem {
  q: string;
  a: string;
}

/**
 * Single-open accordion.
 *
 * Buttons carry `aria-expanded` and `aria-controls`; the panel is a region
 * labelled by its trigger, so this announces correctly in screen readers rather
 * than being a div that happens to grow.
 */
export function Accordion({ items, className }: { items: AccordionItem[]; className?: string }) {
  const [open, setOpen] = useState<number | null>(0);
  const baseId = useId();

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {items.map((item, index) => {
        const isOpen = open === index;
        const triggerId = `${baseId}-trigger-${index}`;
        const panelId = `${baseId}-panel-${index}`;

        return (
          <div
            key={item.q}
            data-active={isOpen}
            className={cn(
              "glass glass-sheen gradient-ring rounded-[var(--radius-glass)] transition-colors duration-400",
              isOpen && "bg-white/[0.11]",
            )}
          >
            <h3>
              <button
                id={triggerId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : index)}
                className="flex w-full items-center justify-between gap-5 rounded-[var(--radius-glass)] px-6 py-5 text-start"
              >
                <span className="font-display text-[1.0625rem] font-bold leading-snug tracking-tight sm:text-lg">
                  {item.q}
                </span>
                <m.span
                  animate={{ rotate: isOpen ? 45 : 0 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="glass-subtle grid h-9 w-9 shrink-0 place-items-center rounded-full"
                >
                  <Plus size={16} strokeWidth={2.4} className="text-accent-300" aria-hidden />
                </m.span>
              </button>
            </h3>

            <AnimatePresence initial={false}>
              {isOpen && (
                <m.div
                  key="panel"
                  id={panelId}
                  role="region"
                  aria-labelledby={triggerId}
                  variants={collapse}
                  initial="hidden"
                  animate="show"
                  exit="hidden"
                  className="overflow-hidden"
                >
                  <p className="px-6 pb-6 pe-16 text-[0.9375rem] leading-relaxed text-[color:var(--page-fg-muted)]">
                    {item.a}
                  </p>
                </m.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

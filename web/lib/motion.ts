import type { Transition, Variants } from "framer-motion";

/**
 * Shared motion vocabulary. Sections import these rather than inventing their
 * own timings, which is what keeps a 23-section page feeling like one product.
 *
 * Every variant animates only `opacity`, `transform` and `filter` — all three
 * are compositor properties, so nothing here triggers layout or paint.
 */

export const EASE_GLASS = [0.22, 1, 0.36, 1] as const;
export const EASE_EXPO = [0.16, 1, 0.3, 1] as const;

export const springSoft: Transition = { type: "spring", stiffness: 220, damping: 28, mass: 0.9 };
export const springSnappy: Transition = { type: "spring", stiffness: 420, damping: 32, mass: 0.6 };

/** Default scroll trigger: fire once, slightly before the element is centred. */
export const viewportOnce = { once: true, amount: 0.25, margin: "0px 0px -12% 0px" } as const;

/** Fade + rise + de-blur. The blur is what makes it read as "premium" not "fade". */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 26, filter: "blur(12px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.75, ease: EASE_GLASS },
  },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0, filter: "blur(10px)" },
  show: { opacity: 1, filter: "blur(0px)", transition: { duration: 0.8, ease: EASE_GLASS } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.94, filter: "blur(14px)" },
  show: {
    opacity: 1,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: 0.85, ease: EASE_EXPO },
  },
};

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -34, filter: "blur(10px)" },
  show: { opacity: 1, x: 0, filter: "blur(0px)", transition: { duration: 0.8, ease: EASE_GLASS } },
};

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 34, filter: "blur(10px)" },
  show: { opacity: 1, x: 0, filter: "blur(0px)", transition: { duration: 0.8, ease: EASE_GLASS } },
};

/** Parent for lists of cards — children cascade rather than popping together. */
export function stagger(step = 0.07, delay = 0): Variants {
  return {
    hidden: {},
    show: { transition: { staggerChildren: step, delayChildren: delay } },
  };
}

/** Accordion / collapsible body. Height animation is unavoidable here. */
export const collapse: Variants = {
  hidden: { height: 0, opacity: 0, transition: { duration: 0.32, ease: EASE_GLASS } },
  show: { height: "auto", opacity: 1, transition: { duration: 0.42, ease: EASE_GLASS } },
};

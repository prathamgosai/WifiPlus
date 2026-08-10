"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";

/* ==========================================================================
   Pointer-driven micro-interactions.

   All three hooks below write to CSS custom properties or Framer motion values
   rather than React state — a pointermove that calls setState re-renders the
   subtree 60 times a second and is the usual reason "premium" pages drop frames.
   ========================================================================== */

/**
 * 3D card tilt. Returns props to spread on the card plus the rotation values.
 * Disabled automatically for reduced-motion users and coarse pointers.
 */
export function useTilt(max = 9) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);

  const config = { stiffness: 220, damping: 22, mass: 0.55 };
  const rotateX = useSpring(useTransform(py, [0, 1], [max, -max]), config);
  const rotateY = useSpring(useTransform(px, [0, 1], [-max, max]), config);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (reduced || event.pointerType !== "mouse") return;
      const rect = event.currentTarget.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      px.set(x);
      py.set(y);
      // Feeds the .spotlight highlight without a re-render.
      event.currentTarget.style.setProperty("--mx", `${x * 100}%`);
      event.currentTarget.style.setProperty("--my", `${y * 100}%`);
    },
    [px, py, reduced],
  );

  const onPointerLeave = useCallback(() => {
    px.set(0.5);
    py.set(0.5);
  }, [px, py]);

  return {
    ref,
    rotateX: reduced ? 0 : rotateX,
    rotateY: reduced ? 0 : rotateY,
    handlers: { onPointerMove, onPointerLeave },
  };
}

/**
 * Magnetic button: the element drifts toward the cursor while it is nearby,
 * then springs home. `strength` is the fraction of the offset it follows.
 */
export function useMagnetic<T extends HTMLElement = HTMLButtonElement>(strength = 0.28, radius = 90) {
  const ref = useRef<T>(null);
  const reduced = useReducedMotion();
  const x = useSpring(0, { stiffness: 320, damping: 20, mass: 0.5 });
  const y = useSpring(0, { stiffness: 320, damping: 20, mass: 0.5 });

  useEffect(() => {
    const node = ref.current;
    if (!node || reduced) return;
    if (window.matchMedia("(hover: none)").matches) return;

    const onMove = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = event.clientX - cx;
      const dy = event.clientY - cy;

      if (Math.hypot(dx, dy) < rect.width / 2 + radius) {
        x.set(dx * strength);
        y.set(dy * strength);
      } else {
        x.set(0);
        y.set(0);
      }
    };

    const reset = () => {
      x.set(0);
      y.set(0);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", reset);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", reset);
    };
  }, [radius, reduced, strength, x, y]);

  return { ref, x, y };
}

/**
 * Writes `--mx` / `--my` on the element so the `.spotlight` gradient follows the
 * cursor. Cheaper than useTilt when a card only needs the highlight.
 */
export function useSpotlight<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);

  const onPointerMove = useCallback((event: React.PointerEvent<T>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--mx", `${((event.clientX - rect.left) / rect.width) * 100}%`);
    event.currentTarget.style.setProperty("--my", `${((event.clientY - rect.top) / rect.height) * 100}%`);
  }, []);

  return { ref, spotlightHandlers: { onPointerMove } };
}

/**
 * Which section is currently in view, for the navbar's animated active link.
 * IntersectionObserver rather than a scroll listener — no work on scroll frames.
 */
export function useActiveSection(ids: readonly string[], rootMargin = "-45% 0px -50% 0px") {
  const [active, setActive] = useState<string>(ids[0] ?? "");

  useEffect(() => {
    const sections = ids
      .map((id) => document.getElementById(id.replace("#", "")))
      .filter((node): node is HTMLElement => node !== null);
    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(`#${entry.target.id}`);
        }
      },
      { rootMargin, threshold: 0 },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [ids, rootMargin]);

  return active;
}

/** True once the window has scrolled past `offset` — used to condense the nav. */
export function useScrolled(offset = 24) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > offset);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [offset]);

  return scrolled;
}

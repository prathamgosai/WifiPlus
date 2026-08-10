"use client";

import { forwardRef, useCallback, useRef, useState } from "react";
import { m } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import { useMagnetic } from "@/hooks/useInteractions";
import { cn } from "@/lib/utils";

type Variant = "primary" | "glass" | "ghost";
type Size = "sm" | "md" | "lg";

interface BaseProps {
  variant?: Variant;
  size?: Size;
  /** Follow the cursor when it comes close. Off for dense control clusters. */
  magnetic?: boolean;
  className?: string;
  children: React.ReactNode;
}

/* Framer's motion props replace React's native drag handlers with pan handlers,
   so the base type has to come from HTMLMotionProps rather than the DOM props. */
type ButtonProps = BaseProps & Omit<HTMLMotionProps<"button">, keyof BaseProps | "ref">;
type AnchorProps = BaseProps & Omit<HTMLMotionProps<"a">, keyof BaseProps | "ref"> & { href: string };

const SIZES: Record<Size, string> = {
  sm: "h-9 px-4 text-[0.8125rem] gap-1.5",
  md: "h-11 px-5 text-sm gap-2",
  lg: "h-[3.25rem] px-7 text-[0.9375rem] gap-2.5",
};

const BASE =
  "group/btn relative inline-flex select-none items-center justify-center overflow-hidden rounded-full font-semibold tracking-tight " +
  "transition-[transform,box-shadow,background-color,color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] " +
  "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 will-change-transform";

const VARIANTS: Record<Variant, string> = {
  // Gradient fill + brand bloom. Reserved for the single primary action per view.
  primary:
    "text-white shadow-[0_10px_30px_-10px_rgba(91,95,240,0.85)] hover:shadow-[0_18px_44px_-12px_rgba(34,211,238,0.75)]",
  // Liquid glass — the default for everything secondary.
  glass:
    "glass glass-sheen text-[color:var(--page-fg)] hover:bg-white/[0.14] hover:-translate-y-0.5",
  ghost:
    "text-[color:var(--page-fg-muted)] hover:text-[color:var(--page-fg)] hover:bg-white/[0.06]",
};

interface Ripple {
  id: number;
  x: number;
  y: number;
}

/** Shared visual shell: gradient fill, sheen sweep and the ripple layer. */
function Chrome({ variant, ripples }: { variant: Variant; ripples: Ripple[] }) {
  return (
    <>
      {variant === "primary" && (
        <>
          {/*
            z-0, not -z-10: the button only forms a stacking context when the
            magnetic transform is applied, so a negative z-index would escape
            and paint behind whichever ancestor happens to own the context.
          */}
          <span
            aria-hidden
            className="absolute inset-0 z-0 rounded-full"
            style={{ background: "linear-gradient(120deg, #8b5cf6 0%, #5b5ff0 45%, #22d3ee 100%)" }}
          />
          {/* Hover bloom sits above the fill but below the label. */}
          <span
            aria-hidden
            className="absolute inset-0 z-0 rounded-full opacity-0 transition-opacity duration-500 group-hover/btn:opacity-100"
            style={{ background: "linear-gradient(120deg, #22d3ee 0%, #5b5ff0 55%, #8b5cf6 100%)" }}
          />
        </>
      )}

      {/* Specular sweep on hover — the "glass catches the light" moment. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
      >
        <span className="absolute inset-y-0 -left-1/3 w-1/3 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover/btn:translate-x-[420%]" />
      </span>

      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          aria-hidden
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30 animate-pulse-ring"
          style={{ left: ripple.x, top: ripple.y, width: 120, height: 120 }}
        />
      ))}
    </>
  );
}

/** Ripple origin tracking, shared by both the button and anchor variants. */
function useRipple() {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const seq = useRef(0);

  const spawn = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const id = seq.current++;
    setRipples((prev) => [...prev, { id, x: event.clientX - rect.left, y: event.clientY - rect.top }]);
    // Matches the 2.4s pulse-ring keyframe; leaving them mounted leaks nodes.
    window.setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), 700);
  }, []);

  return { ripples, spawn };
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "glass", size = "md", magnetic = false, className, children, onPointerDown, ...rest },
  forwardedRef,
) {
  const { ref: magneticRef, x, y } = useMagnetic<HTMLButtonElement>(magnetic ? 0.25 : 0);
  const { ripples, spawn } = useRipple();

  return (
    <m.button
      ref={(node: HTMLButtonElement | null) => {
        magneticRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      style={magnetic ? { x, y } : undefined}
      className={cn(BASE, SIZES[size], VARIANTS[variant], className)}
      onPointerDown={(event) => {
        spawn(event);
        onPointerDown?.(event);
      }}
      {...rest}
    >
      <Chrome variant={variant} ripples={ripples} />
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </m.button>
  );
});

/** Anchor-flavoured twin, so in-page CTAs keep real link semantics. */
export function ButtonLink({
  variant = "glass",
  size = "md",
  magnetic = false,
  className,
  children,
  onPointerDown,
  ...rest
}: AnchorProps) {
  const { ref, x, y } = useMagnetic<HTMLAnchorElement>(magnetic ? 0.25 : 0);
  const { ripples, spawn } = useRipple();

  return (
    <m.a
      ref={ref}
      style={magnetic ? { x, y } : undefined}
      className={cn(BASE, SIZES[size], VARIANTS[variant], className)}
      onPointerDown={(event) => {
        spawn(event);
        onPointerDown?.(event);
      }}
      {...rest}
    >
      <Chrome variant={variant} ripples={ripples} />
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </m.a>
  );
}

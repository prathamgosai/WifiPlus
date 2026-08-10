"use client";

import { m } from "framer-motion";
import { useTilt } from "@/hooks/useInteractions";
import { fadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  /** 3D tilt toward the cursor. Off for cards that contain form controls. */
  tilt?: boolean;
  /** Cursor-tracking radial highlight. */
  spotlight?: boolean;
  /** Gradient ring: `hover` reveals on hover/focus, `always` keeps it lit. */
  ring?: "hover" | "always" | "none";
  /** Lift on hover. Off for large panels where lifting looks unstable. */
  lift?: boolean;
  padded?: boolean;
  as?: "div" | "article" | "aside" | "li";
  /** Participate in a parent `stagger()` variant. */
  variants?: typeof fadeUp;
}

/**
 * The workhorse surface. Composes the CSS glass primitives from globals.css
 * with optional pointer interactions.
 *
 * `transform-style: preserve-3d` plus a perspective wrapper is what makes the
 * tilt read as depth rather than a skew.
 */
export function GlassCard({
  children,
  className,
  tilt = false,
  spotlight = true,
  ring = "hover",
  lift = true,
  padded = true,
  as = "div",
  variants,
}: GlassCardProps) {
  const { rotateX, rotateY, handlers } = useTilt(8);
  const Tag = m[as] as typeof m.div;

  const card = (
    <Tag
      variants={variants}
      className={cn(
        "glass glass-sheen relative rounded-[var(--radius-glass)]",
        spotlight && "spotlight",
        ring === "hover" && "gradient-ring",
        ring === "always" && "gradient-ring gradient-ring-always",
        lift &&
          "transition-[transform,box-shadow,background-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1.5 hover:bg-white/[0.11]",
        padded && "p-6 sm:p-7",
        className,
      )}
      style={tilt ? { rotateX, rotateY, transformStyle: "preserve-3d" } : undefined}
      {...(tilt ? handlers : {})}
      {...(!tilt && spotlight
        ? {
            onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
              const rect = event.currentTarget.getBoundingClientRect();
              event.currentTarget.style.setProperty(
                "--mx",
                `${((event.clientX - rect.left) / rect.width) * 100}%`,
              );
              event.currentTarget.style.setProperty(
                "--my",
                `${((event.clientY - rect.top) / rect.height) * 100}%`,
              );
            },
          }
        : {})}
    >
      {children}
    </Tag>
  );

  // A perspective ancestor is required; without it rotateX/Y flatten out.
  return tilt ? <div style={{ perspective: 1100 }}>{card}</div> : card;
}

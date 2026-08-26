"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { NetworkCanvas } from "@/components/fx/NetworkCanvas";
import { detectCapability, type Capability } from "@/lib/capability";
import { cn } from "@/lib/utils";

/**
 * Decides whether the 3D scene is rendered at all, and when.
 * -----------------------------------------------------------------------------
 * The hero's background must never be the reason the page is slow, because the
 * hero's background is not why anyone came. Three rules follow from that:
 *
 * 1. THE 3D CODE IS NOT IN THE INITIAL BUNDLE. `next/dynamic` with `ssr: false`
 *    puts three, R3F, drei and the scene in a chunk that is only requested on
 *    devices that will actually render it. A phone that falls back to the 2D
 *    canvas never downloads a byte of it.
 *
 * 2. IT IS NOT FETCHED UNTIL THE PAGE IS IDLE. Even on a capable machine the
 *    chunk competes with hydration and with the fonts. `requestIdleCallback`
 *    holds it until the main thread has nothing better to do, so Largest
 *    Contentful Paint is decided before the scene is even requested.
 *
 * 3. THERE IS ALWAYS SOMETHING THERE. The existing 2D `NetworkCanvas` renders
 *    immediately and stays until the scene has faded in. It is also the
 *    permanent answer for reduced-motion, no-WebGL and low-end devices — a real
 *    component that already ships, not a blank rectangle.
 */

const NetworkScene = dynamic(() => import("./NetworkScene"), {
  ssr: false,
  // No loading UI: the 2D fallback below is already on screen underneath.
  loading: () => null,
});

/** Fallback stays mounted through the crossfade, then unmounts. */
const CROSSFADE_MS = 700;

export function NetworkStage({ className }: { className?: string }) {
  const [capability, setCapability] = useState<Capability | null>(null);
  const [mountScene, setMountScene] = useState(false);
  const [sceneVisible, setSceneVisible] = useState(false);

  /* Capability is decided on the client only — the server has no GPU to
     describe, and the correct first paint is the fallback either way. */
  useEffect(() => {
    const detected = detectCapability();
    setCapability(detected);
    if (detected.tier === "none") return;

    let idle = 0;
    let timer = 0;
    const start = () => {
      setMountScene(true);
      // One frame after mount so the fade-in has an initial state to animate
      // from; setting both in the same tick would skip the transition.
      timer = window.setTimeout(() => setSceneVisible(true), 60);
    };

    // Safari still has no requestIdleCallback, so a timeout is the fallback.
    // Tested as a property rather than with `in`: the DOM lib declares it as
    // required, so `"requestIdleCallback" in window` narrows the else branch to
    // `never` and the fallback stops compiling.
    const idleAvailable = typeof window.requestIdleCallback === "function";
    if (idleAvailable) {
      idle = window.requestIdleCallback(start, { timeout: 2500 });
    } else {
      timer = window.setTimeout(start, 1200);
    }

    return () => {
      if (idle && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
      window.clearTimeout(timer);
    };
  }, []);

  /* Someone turning on "reduce motion" mid-session is asking for this to stop
     now, not on the next navigation. */
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => {
      if (query.matches) {
        setMountScene(false);
        setSceneVisible(false);
        setCapability((prev) => (prev ? { ...prev, tier: "none", reason: "prefers-reduced-motion" } : prev));
      }
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // Drop the 2D layer once the scene has finished fading in, so only one of the
  // two is ever actually drawing.
  const [fallbackMounted, setFallbackMounted] = useState(true);
  useEffect(() => {
    if (!sceneVisible) return;
    const timer = window.setTimeout(() => setFallbackMounted(false), CROSSFADE_MS);
    return () => window.clearTimeout(timer);
  }, [sceneVisible]);

  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {fallbackMounted && (
        <NetworkCanvas
          className={cn(
            "absolute inset-0 h-full w-full transition-opacity duration-700",
            sceneVisible ? "opacity-0" : "opacity-55",
          )}
        />
      )}

      {mountScene && capability && capability.tier !== "none" && (
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-700 ease-out",
            sceneVisible ? "opacity-100" : "opacity-0",
          )}
        >
          <NetworkScene capability={capability} className="h-full w-full" />
        </div>
      )}
    </div>
  );
}

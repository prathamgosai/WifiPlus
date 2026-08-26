"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { AdaptiveDpr } from "@react-three/drei";
import { Bloom, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { useTestStore } from "@/store/useTestStore";
import type { Capability } from "@/lib/capability";
import { CameraRig } from "./CameraRig";
import { LinkTrails } from "./LinkTrails";
import { NetworkNodes } from "./NetworkNodes";
import { PacketField } from "./PacketField";
import { NODES, satellites } from "./topology";

/**
 * The 3D network scene.
 * -----------------------------------------------------------------------------
 * A miniature of the path a measurement takes - device, router, ISP, edge,
 * internet - with traffic flowing along it. It exists to make the phases of a
 * speed test legible, so it is driven by the phases of a real speed test:
 * `drive.flow` is live throughput, `drive.direction` is the phase the engine is
 * in, `drive.pulse` counts probes that actually came back.
 *
 * IT IS AN ILLUSTRATION, NOT AN OBSERVATION. A browser cannot see a router, run
 * a traceroute, or watch a packet cross an ISP. The caption rendered next to
 * this canvas says so, and that caption is not decoration - it is the thing
 * that keeps an animated network from reading as a measured one.
 *
 * -------- WEBGL OPTIMISATION SUMMARY -----------------------------------------
 * The whole scene is FOUR draw calls, whatever the packet budget:
 *      1  ambient satellite sprites   (instanced billboards)
 *      2  node halos                  (instanced billboards)
 *      3  link trails                 (one merged LineSegments)
 *      4  packets                     (instanced billboards)
 *   + five tiny lit cores sharing a single icosahedron geometry.
 *
 * Per frame the CPU writes about a dozen uniforms and three ring transforms.
 * There is no per-particle JS, no matrix upload and no geometry rebuild.
 *
 * The loop is also GATED, which matters more than any of the above:
 *   · An `IntersectionObserver` sets `frameloop` to "never" the moment the hero
 *     scrolls away, so reading the rest of the page costs zero GPU.
 *   · The same happens when the tab is hidden. A backgrounded tab rendering a
 *     particle field is pure battery drain — and this app measures networks, so
 *     a user WILL background it mid-run.
 *   · `AdaptiveDpr` drops resolution if the frame rate sags, then restores it.
 *   · DPR is capped by tier; above 2 the fill cost squares for no visible gain.
 */

export interface NetworkSceneProps {
  capability: Capability;
  className?: string;
}

export default function NetworkScene({ capability, className = "" }: NetworkSceneProps) {
  const wrapper = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  // Only `stage` is selected, so the scene re-renders on phase changes (a
  // handful per run) and never on metric updates (dozens per second).
  const stage = useTestStore((state) => state.stage);

  const satelliteNodes = useMemo(
    () => satellites(capability.tier === "full" ? 90 : 40),
    [capability.tier],
  );

  /* Gate the render loop on visibility. Both conditions must hold, so a hero
     that is on screen in a hidden tab still stops. */
  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;

    let onScreen = false;
    const sync = () => setActive(onScreen && document.visibilityState === "visible");

    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry?.isIntersecting ?? false;
        sync();
      },
      // A little margin so the scene is already running by the time it is seen.
      { threshold: 0, rootMargin: "120px" },
    );
    observer.observe(element);
    document.addEventListener("visibilitychange", sync);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return (
    <div ref={wrapper} className={className} aria-hidden="true" data-tier={capability.tier}>
      <Canvas
        // "never" fully parks the loop — no rAF is scheduled at all.
        frameloop={active ? "always" : "never"}
        dpr={capability.dpr}
        // Lets AdaptiveDpr trade resolution for frame rate instead of dropping frames.
        performance={{ min: 0.5 }}
        gl={{
          // MSAA is the single most expensive setting here and the packets are
          // soft-edged sprites, so only the full tier pays for it.
          antialias: capability.tier === "full",
          alpha: true,
          // No stencil buffer is used; asking for one costs memory bandwidth.
          stencil: false,
          powerPreference: "high-performance",
          // The page never reads pixels back, so the driver may discard the
          // buffer after compositing.
          preserveDrawingBuffer: false,
        }}
        camera={{ fov: 42, near: 0.1, far: 40, position: [0, 0.35, 9.6] }}
        onCreated={({ gl, scene }) => {
          // Transparent: the page's aurora and grid show through, so the scene
          // is part of the background rather than a rectangle sitting on it.
          gl.setClearColor(new THREE.Color("#080b16"), 0);
          // Exponential fog dims the ambient field with distance, which is what
          // gives the flat topology its depth.
          scene.fog = new THREE.FogExp2("#080b16", 0.052);
        }}
      >
        {/* ---- Lighting ------------------------------------------------------
            Only the five hop cores are lit (MeshStandardMaterial); everything
            else is additive and unlit, so three lights is the entire rig.
            A key from the front-right, a cool rim from behind-left to separate
            the cores from the fog, and a low ambient so nothing goes pure black. */}
        <ambientLight intensity={0.55} color="#8ea0d8" />
        <directionalLight position={[4, 5, 6]} intensity={1.5} color="#ffffff" />
        <directionalLight position={[-6, -2, -4]} intensity={0.9} color="#22d3ee" />

        <CameraRig stage={stage} interactive={capability.tier === "full"} />

        <NetworkNodes nodes={NODES} satelliteNodes={satelliteNodes} stage={stage} />
        <LinkTrails nodes={NODES} />
        <PacketField count={capability.packets} nodes={NODES} />

        <EffectComposer multisampling={0}>
          <Bloom intensity={1.1} luminanceThreshold={0.55} luminanceSmoothing={0.3} mipmapBlur />
          <Vignette eskil={false} offset={0.2} darkness={0.7} />
          <Noise opacity={0.025} />
        </EffectComposer>
        <AdaptiveDpr pixelated={false} />
      </Canvas>
    </div>
  );
}

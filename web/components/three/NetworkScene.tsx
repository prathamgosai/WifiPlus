"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import gsap from "gsap";
import * as THREE from "three";
import { useTestStore } from "@/store/useTestStore";
import type { Capability } from "@/lib/capability";
import { birth } from "./birth";
import { CameraRig } from "./CameraRig";
import { Composite } from "./Composite";
import { clock } from "./clock";
import { pointerDrive, pointerWorld } from "./pointer";
import { createGovernor, resetQuality } from "./quality";
import { LinkTrails } from "./LinkTrails";
import { NetworkNodes } from "./NetworkNodes";
import { FOG_DENSITY, PacketField } from "./PacketField";
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
 *   · DPR is capped by tier; above 2 the fill cost squares for no visible gain.
 *
 * There is deliberately NO adaptive-quality component here. `AdaptiveDpr` from
 * drei was removed rather than kept: it reacts to `state.performance.current`,
 * which fiber only ever lowers in response to a `performance.regress()` call
 * that fiber itself never makes. With nothing calling it, `current` stays
 * pinned at 1 and drei's `setDpr(1 * initialDpr)` is a self-assignment on every
 * change — a no-op wearing the name of a safeguard, which is worse than no
 * safeguard because it stops anyone looking for one.
 */

/**
 * Advances the one shared clock, before anything reads it.
 *
 * Must be a CHILD of <Canvas>: `useFrame` needs the fiber context, and
 * NetworkScene itself creates the Canvas and therefore sits outside it.
 *
 * Priority -1 runs this ahead of every other subscriber. Verified in fiber 9.7
 * that a negative priority does not take over rendering — the manual-render
 * flag is only incremented for `priority > 0`.
 */
function Tick({ interactive }: { interactive: boolean }) {
  const setDpr = useThree((state) => state.setDpr);
  const capped = useThree((state) => state.viewport.dpr);

  /* The real adaptive-quality loop, replacing drei's AdaptiveDpr — which was a
     verified no-op, since fiber never calls performance.regress(). */
  const governor = useMemo(
    () =>
      createGovernor((level) => {
        setDpr(Math.max(1, capped * level));
      }),
    [setDpr, capped],
  );

  /* Allocated once. A Plane and a Vector3 per frame would be 120 allocations a
     second handed to the garbage collector for no reason. */
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), []);
  const hit = useMemo(() => new THREE.Vector3(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);

  useFrame(({ camera, raycaster }, delta) => {
    const step = Math.min(delta, 0.05);

    // Clamped once, here, instead of separately in four places. A long frame
    // (a parked loop resuming) advances the scene by one frame, not by the
    // seconds that elapsed while nothing was drawn.
    clock.t += step;

    // Measured, not assumed. Frozen while a throughput phase runs — see
    // quality.ts for why that freeze is the rule that makes this safe here.
    governor.sample(delta);

    /* The pointer projected onto the scene's z = 0 plane, computed ONCE per
       frame and shared. `pointerDrive` is already in NDC (-1..1, y up), which
       is exactly what setFromCamera expects. */
    if (interactive) {
      ndc.set(pointerDrive.x, pointerDrive.y);
      raycaster.setFromCamera(ndc, camera);
      // Returns null when the ray is parallel to the plane — leave the last
      // position rather than writing NaN into a uniform.
      if (raycaster.ray.intersectPlane(plane, hit)) {
        pointerWorld.x = hit.x;
        pointerWorld.y = hit.y;
        pointerWorld.z = hit.z;
      }
    }

    // Decay to nothing when the cursor leaves, so the field relaxes instead of
    // freezing mid-bulge.
    const want = interactive && pointerDrive.engaged ? 1 : 0;
    pointerWorld.force += (want - pointerWorld.force) * (1 - Math.exp(-step / 0.6));
  }, -1);

  return null;
}

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

  /* The scene draws itself in on mount. Killed on unmount so a remount does
     not leave GSAP ticking against a dead scene. */
  useEffect(() => {
    birth.t = 0;
    resetQuality();
    const tween = gsap.to(birth, { t: 1, duration: 2.2, ease: "expo.out" });
    return () => {
      tween.kill();
    };
  }, []);

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
    <div
      ref={wrapper}
      className={className}
      aria-hidden="true"
      data-tier={capability.tier}
      // capability.ts documents the reason as "surfaced in the scene's title
      // attribute for support"; it never was. It is an attribute rather than a
      // title so it cannot surface a tooltip on an aria-hidden decoration.
      data-reason={capability.reason}
    >
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

          /*
           * Neutral, not ACES. ACES is the usual default and it desaturates
           * saturated cyan hard toward white — which is most of this palette.
           * Khronos PBR Neutral holds hue into the highlights, so a bright
           * packet reads as a bright cyan packet rather than a white one.
           */
          gl.toneMapping = THREE.NeutralToneMapping;

          /*
           * This fog reaches the five lit cores and NOTHING ELSE, which is worth
           * stating because the comment here used to claim it was "what gives
           * the flat topology its depth". It never did: ShaderMaterial defaults
           * to `fog: false`, so the packets, the link trails and — the whole
           * point — the 90 ambient satellites at z -2.4 to -6.0 received no
           * attenuation whatsoever. The real depth cue is now hand-rolled in
           * each additive fragment shader against the same density.
           */
          scene.fog = new THREE.FogExp2("#080b16", FOG_DENSITY);
        }}
      >
        {/* ---- No lights ------------------------------------------------------
            There is deliberately no light rig. Every material in this scene is
            now either additive-unlit or the cores' own fresnel shader, which
            derives its rim from the view direction rather than from a light.
            The three lights that used to be here existed solely for the five
            MeshStandardMaterial cores that the instanced rebuild replaced. */}

        <Tick interactive={capability.tier === "full"} />

        {/* Renders the scene into a half-float target, blooms the overrange and
            tone-maps to the canvas. Full tier only — the light tier renders
            straight to the default framebuffer, exactly as before. It disables
            itself at runtime if the canvas alpha round-trip turns out to be
            broken; see the header of Composite.tsx. */}
        <Composite enabled={capability.tier === "full"} />

        <CameraRig stage={stage} interactive={capability.tier === "full"} />

        <NetworkNodes
          nodes={NODES}
          satelliteNodes={satelliteNodes}
          stage={stage}
          pointerForce={capability.tier === "full"}
        />
        <LinkTrails nodes={NODES} />
        <PacketField
          count={capability.packets}
          nodes={NODES}
          pointerForce={capability.tier === "full"}
        />

      </Canvas>
    </div>
  );
}

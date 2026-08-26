"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import gsap from "gsap";
import * as THREE from "three";
import type { StageId } from "@/lib/stages";

/**
 * Camera choreography.
 * -----------------------------------------------------------------------------
 * Two things move the camera and they must not fight:
 *
 *   GSAP owns the STAGE MOVE - the deliberate push-in when a test starts and
 *   the settle when it finishes. It tweens a plain object, never the camera.
 *
 *   `useFrame` owns the POINTER PARALLAX - a damped offset applied on top of
 *   whatever GSAP currently holds.
 *
 * Tweening `camera.position` directly is the obvious implementation and it is
 * wrong: the parallax would overwrite GSAP's value every frame, so the tween
 * would appear to do nothing while still running. Composing a GSAP-owned base
 * with a frame-owned offset is what lets both exist at once.
 *
 * Every move is a camera move. Nothing here scales the scene, so the topology
 * keeps its real proportions and the push-in reads as approach rather than zoom.
 */

interface Shot {
  position: [number, number, number];
  look: [number, number, number];
  /** Seconds. Longer for the settle, shorter for the commit into a phase. */
  duration: number;
}

/**
 * One shot per stage. The download and upload shots are mirrored so the
 * handover between them is a visible sweep across the topology - the moment the
 * flow reverses is the most legible thing the scene does.
 */
const SHOTS: Record<StageId, Shot> = {
  idle: { position: [0, 0.35, 9.6], look: [0, 0, 0], duration: 1.4 },
  discovering: { position: [0.35, 0.5, 8.7], look: [1.2, 0.2, 0], duration: 0.9 },
  latency: { position: [-0.5, 0.3, 7.9], look: [-1.1, 0, 0], duration: 1.0 },
  download: { position: [1.05, 0.15, 6.5], look: [0.4, -0.1, 0], duration: 1.2 },
  upload: { position: [-1.05, 0.15, 6.5], look: [-0.4, -0.1, 0], duration: 1.2 },
  complete: { position: [0, 0.45, 8.9], look: [0, 0, 0], duration: 1.6 },
  error: { position: [0, 0.35, 9.6], look: [0, 0, 0], duration: 0.8 },
};

/** How far the pointer may push the camera, in world units. */
const PARALLAX = { x: 0.5, y: 0.32 };

export function CameraRig({ stage, interactive }: { stage: StageId; interactive: boolean }) {
  const { camera } = useThree();

  /* GSAP writes here; useFrame reads it. Plain numbers rather than a Vector3 so
     GSAP can tween the properties without touching three's change tracking. */
  const base = useMemo(
    () => ({ x: SHOTS.idle.position[0], y: SHOTS.idle.position[1], z: SHOTS.idle.position[2] }),
    [],
  );
  const look = useMemo(() => ({ x: 0, y: 0, z: 0 }), []);

  /** Damped pointer, so a flicked cursor eases rather than snaps. */
  const pointer = useRef({ x: 0, y: 0 });
  const target = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const shot = SHOTS[stage] ?? SHOTS.idle;

    const tweens = [
      gsap.to(base, {
        x: shot.position[0],
        y: shot.position[1],
        z: shot.position[2],
        duration: shot.duration,
        ease: "power3.inOut",
        overwrite: "auto",
      }),
      gsap.to(look, {
        x: shot.look[0],
        y: shot.look[1],
        z: shot.look[2],
        duration: shot.duration,
        ease: "power3.inOut",
        overwrite: "auto",
      }),
    ];

    // Without this, unmounting mid-tween leaves GSAP holding a reference to an
    // object whose scene is gone, and it keeps ticking until the tween ends.
    return () => tweens.forEach((tween) => tween.kill());
  }, [stage, base, look]);

  useFrame((state, delta) => {
    const step = Math.min(delta, 0.05);
    // Frame-rate independent damping: identical easing at 60 and 144 Hz.
    const ease = 1 - Math.exp(-step / 0.35);

    if (interactive) {
      pointer.current.x += (state.pointer.x - pointer.current.x) * ease;
      pointer.current.y += (state.pointer.y - pointer.current.y) * ease;
    } else {
      pointer.current.x += (0 - pointer.current.x) * ease;
      pointer.current.y += (0 - pointer.current.y) * ease;
    }

    camera.position.set(
      base.x + pointer.current.x * PARALLAX.x,
      base.y + pointer.current.y * PARALLAX.y,
      base.z,
    );

    // The look target counter-shifts slightly, which deepens the parallax
    // without the horizon appearing to swing.
    target.set(look.x - pointer.current.x * 0.18, look.y - pointer.current.y * 0.12, look.z);
    camera.lookAt(target);
  });

  return null;
}

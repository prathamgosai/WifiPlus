"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import gsap from "gsap";
import * as THREE from "three";
import type { StageId } from "@/lib/stages";
import { clock } from "./clock";
import { pointerDrive } from "./pointer";

/**
 * Camera choreography.
 * -----------------------------------------------------------------------------
 * Three things move the camera and they must not fight:
 *
 *   GSAP owns the STAGE MOVE — the deliberate push-in when a test starts, the
 *   counter-move before the flow reverses, and the settle when it finishes. It
 *   tweens plain objects, never the camera.
 *
 *   `useFrame` owns the POINTER PARALLAX and the SCROLL DOLLY, applied on top
 *   of whatever GSAP currently holds.
 *
 * Tweening `camera.position` directly is the obvious implementation and it is
 * wrong: the per-frame composition would overwrite GSAP's value every frame, so
 * the tween would appear to do nothing while still running.
 *
 * WHY EACH SHOT HAS ITS OWN CURVE. Every shot used to share `power3.inOut` — a
 * symmetric curve with no attack — so the commit into a download, the settle at
 * completion and the retreat after an error were tonally identical moves.
 * Position and look were also perfectly locked (same duration, same ease, same
 * start frame), which is the clearest possible tell of keyframed rather than
 * operated camera work. A real operator leads with the body and the framing
 * catches up, which is what `lookLag` is.
 */

interface Shot {
  position: [number, number, number];
  look: [number, number, number];
  duration: number;
  /** GSAP core eases only — all ship in the base package, none need a plugin. */
  ease: string;
  lookEase: string;
  /** Seconds the look target trails the body by. */
  lookLag: number;
  /** Radians. Kept tiny — see the note in the frame loop about what this is. */
  roll: number;
}

/**
 * One shot per stage.
 *
 * `discovering` is deliberately the shortest: with no self-hosted edge
 * registered the phase can be over in a single frame, so a long tween there is
 * only ever seen being overwritten by the next one.
 */
const SHOTS: Record<StageId, Shot> = {
  idle: {
    position: [0, 0.35, 9.6],
    look: [0, 0, 0],
    duration: 2.0,
    ease: "power1.inOut",
    lookEase: "power2.out",
    lookLag: 0.12,
    roll: 0,
  },
  discovering: {
    position: [0.35, 0.5, 8.7],
    look: [1.2, 0.2, 0],
    duration: 0.55,
    ease: "power2.out",
    lookEase: "power2.out",
    lookLag: 0.1,
    roll: 0.008,
  },
  latency: {
    // back.out overshoots slightly and settles — the camera arrives with a
    // small amount of weight rather than easing to a stop.
    position: [-0.5, 0.3, 7.9],
    look: [-1.1, 0, 0],
    duration: 0.85,
    ease: "back.out(1.15)",
    lookEase: "power2.out",
    lookLag: 0.12,
    roll: -0.012,
  },
  download: {
    position: [1.05, 0.15, 6.5],
    look: [0.4, -0.1, 0],
    duration: 1.2,
    ease: "expo.out",
    lookEase: "power2.out",
    lookLag: 0.14,
    roll: 0.016,
  },
  upload: {
    position: [-1.05, 0.15, 6.5],
    look: [-0.4, -0.1, 0],
    duration: 1.0,
    ease: "expo.out",
    lookEase: "power2.out",
    lookLag: 0.14,
    roll: -0.016,
  },
  complete: {
    position: [0, 0.45, 8.9],
    look: [0, 0, 0],
    duration: 1.6,
    ease: "power2.inOut",
    lookEase: "power2.out",
    lookLag: 0.12,
    roll: 0,
  },
  error: {
    // Fast and flat. An error should not be given a graceful move.
    position: [0, 0.35, 9.6],
    look: [0, 0, 0],
    duration: 0.5,
    ease: "power4.out",
    lookEase: "power3.out",
    lookLag: 0.06,
    roll: 0,
  },
};

/** How far the pointer may push the camera, in world units. */
const PARALLAX = { x: 0.5, y: 0.32 };

/** Where the camera flies in FROM on first mount. */
const BIRTH_FROM: [number, number, number] = [0, 1.6, 13.5];

export function CameraRig({ stage, interactive }: { stage: StageId; interactive: boolean }) {
  const { camera } = useThree();

  /* GSAP writes here; useFrame reads. Plain numbers rather than Vector3s so
     GSAP can tween the properties without touching three's change tracking. */
  const base = useMemo(
    () => ({ x: BIRTH_FROM[0], y: BIRTH_FROM[1], z: BIRTH_FROM[2] }),
    [],
  );
  const look = useMemo(() => ({ x: 0, y: 0.35, z: 0 }), []);
  const roll = useMemo(() => ({ z: 0 }), []);

  /** Damped pointer, so a flicked cursor eases rather than snaps. */
  const pointer = useRef({ x: 0, y: 0 });
  const target = useMemo(() => new THREE.Vector3(), []);

  /** Distinguishes the first stage effect (the birth) from every later one. */
  const mounted = useRef(false);
  const previousStage = useRef<StageId>(stage);

  /* ---- Birth ------------------------------------------------------------
     A mount-only arrival. The stage effect below is guarded so it does not
     immediately overwrite this with `overwrite: "auto"` — on mount `stage` is
     "idle", and its tween to SHOTS.idle would otherwise kill this one on the
     very next tick. */
  useEffect(() => {
    const shot = SHOTS.idle;
    const tweens = [
      gsap.to(base, {
        x: shot.position[0],
        y: shot.position[1],
        z: shot.position[2],
        duration: 2.4,
        ease: "expo.out",
      }),
      gsap.to(look, {
        x: shot.look[0],
        y: shot.look[1],
        z: shot.look[2],
        duration: 2.1,
        // The framing settles after the body has almost arrived.
        delay: 0.3,
        ease: "power2.out",
      }),
    ];
    return () => tweens.forEach((tween) => tween.kill());
  }, [base, look]);

  /* ---- Stage moves ------------------------------------------------------ */
  useEffect(() => {
    // Skip the first run: the birth tween above owns the opening move.
    if (!mounted.current) {
      mounted.current = true;
      previousStage.current = stage;
      return;
    }

    const shot = SHOTS[stage] ?? SHOTS.idle;
    const from = previousStage.current;
    previousStage.current = stage;

    /*
     * THE REVERSAL COUNTER-MOVE.
     *
     * download → upload is the signature beat. Cutting straight to the mirrored
     * shot reads as an undo, so the camera pulls the WRONG way first — a short
     * anticipation against the direction of travel — and only then sweeps
     * across. This is the camera half of the beat; `beat.ts` owns the field half.
     */
    const isReversal = from === "download" && stage === "upload";
    /* A run finishing deserves an impact, not a fade: push in hard, hold for a
       beat, then release. Impact-then-release is what makes an ending read as
       an ending. */
    const isCompletion = stage === "complete";

    const timeline = gsap.timeline();

    if (isCompletion) {
      timeline
        .to(base, {
          x: shot.position[0],
          y: shot.position[1],
          z: 6.2,
          duration: 0.28,
          ease: "power4.out",
          overwrite: "auto",
        })
        .to(base, {
          z: shot.position[2],
          duration: 1.5,
          ease: "expo.out",
        });
    } else if (isReversal) {
      timeline
        .to(base, {
          x: shot.position[0] * -0.35,
          duration: 0.22,
          ease: "power2.in",
          overwrite: "auto",
        })
        .to(base, {
          x: shot.position[0],
          y: shot.position[1],
          z: shot.position[2],
          duration: 1.0,
          ease: "expo.out",
        });
    } else {
      timeline.to(base, {
        x: shot.position[0],
        y: shot.position[1],
        z: shot.position[2],
        duration: shot.duration,
        ease: shot.ease,
        overwrite: "auto",
      });
    }

    timeline.to(
      look,
      {
        x: shot.look[0],
        y: shot.look[1],
        z: shot.look[2],
        duration: shot.duration,
        ease: shot.lookEase,
        overwrite: "auto",
      },
      // Positive offset from the timeline start: the framing trails the body.
      shot.lookLag,
    );

    timeline.to(
      roll,
      { z: shot.roll, duration: shot.duration * 1.2, ease: "power2.out", overwrite: "auto" },
      0,
    );

    // A remount mid-timeline would otherwise leave GSAP ticking against objects
    // whose scene is gone.
    return () => {
      timeline.kill();
    };
  }, [stage, base, look, roll]);

  useFrame((_, delta) => {
    const step = Math.min(delta, 0.05);
    // Frame-rate independent damping: identical easing at 60 and 144 Hz.
    const ease = 1 - Math.exp(-step / 0.35);

    /*
     * Reads `pointerDrive`, NOT fiber's `state.pointer`.
     *
     * The canvas lives inside two `pointer-events-none` ancestors — necessary,
     * so it never intercepts a click meant for the Start button — which means
     * fiber's own listeners on the canvas container never fired and
     * `state.pointer` was permanently (0, 0). See pointer.ts.
     */
    let targetX: number;
    let targetY: number;

    if (interactive) {
      targetX = pointerDrive.x;
      targetY = pointerDrive.y;
    } else {
      /*
       * Coarse-pointer devices have no hover, which is why `interactive` is
       * false for them — but that was being read as "the camera should be
       * dead", and the mobile hero was static apart from sprite sway. A slow
       * Lissajous drift gives it life without pretending to track a pointer
       * that is not there. The frequencies are incommensurate, so the path
       * never visibly repeats.
       */
      targetX = Math.sin(clock.t * 0.11) * 0.45;
      targetY = Math.sin(clock.t * 0.077 + 1.1) * 0.45;
    }

    pointer.current.x += (targetX - pointer.current.x) * ease;
    pointer.current.y += (targetY - pointer.current.y) * ease;

    /*
     * SCROLL DOLLY, not a DOM transform.
     *
     * Hero used to animate the whole canvas rectangle's `y` on scroll, which
     * slides a frozen image around and is the classic "video behind a div"
     * artefact — the internal parallax stays put while the frame translates.
     * Pushing the camera back instead means the perspective genuinely changes
     * with scroll, which is what the eye expects from a 3D layer.
     */
    const p = pointerDrive.scrollP;

    camera.position.set(
      base.x + pointer.current.x * PARALLAX.x,
      base.y + pointer.current.y * PARALLAX.y,
      base.z + p * 3.2,
    );

    // The look target counter-shifts slightly, which deepens the parallax
    // without the horizon appearing to swing.
    target.set(
      look.x - pointer.current.x * 0.18,
      look.y - pointer.current.y * 0.12 - p * 0.55,
      look.z,
    );
    camera.lookAt(target);

    /*
     * A fraction of a degree of roll, applied after lookAt.
     *
     * Strictly this is NOT a pure roll: `lookAt` writes a full quaternion, and
     * assigning `rotation.z` recomposes the Euler in XYZ order, so the axis is
     * only approximately the view axis. At these magnitudes and with targets
     * this close to axis-aligned the difference is invisible — but do not scale
     * it up expecting it to stay a roll.
     */
    camera.rotation.z = roll.z + pointer.current.x * 0.008 + p * 0.03;
  });

  return null;
}

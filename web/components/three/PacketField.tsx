"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import gsap from "gsap";
import * as THREE from "three";
import { drive } from "@/store/useTestStore";
import { beat } from "./beat";
import { birth } from "./birth";
import { clock } from "./clock";
import { quality, render } from "./quality";
import { pointerWorld } from "./pointer";
import { quadAttributes } from "./quad";
import { LINKS, nodeMap, type TopologyNode } from "./topology";

/**
 * The data packets, as one instanced draw call.
 * -----------------------------------------------------------------------------
 * WEBGL OPTIMISATION - this is the hot path of the whole scene, so the design
 * rule is: the CPU touches nothing per particle, per frame.
 *
 *   · ONE `InstancedBufferGeometry`, one material, one draw call for every
 *     packet on every link. Adding a link adds instances, never draw calls.
 *   · Position is computed IN THE VERTEX SHADER from a start, an end and a
 *     phase. There is no per-frame JS loop, no `Matrix4` per instance and no
 *     `instanceMatrix` re-upload - the classic instanced-mesh approach would
 *     write 900 x 16 floats to the GPU every frame to do the same thing.
 *   · Per frame the CPU writes exactly four uniforms. That is the entire cost.
 *   · The quad is billboarded in view space, so packets always face the camera
 *     without a CPU-side `lookAt`.
 *   · Additive blending with `depthWrite: false` - glowing packets should
 *     accumulate through each other, and skipping depth writes avoids sorting
 *     thousands of transparent instances.
 *
 * The animation is driven by `drive`, which carries real readings: `flow` is
 * live throughput normalised against its own ceiling, and `direction` is the
 * phase the engine is genuinely in. Idle is a slow downstream drift, which is
 * ambient motion and not a claim that anything is being measured.
 */

/**
 * Fog density, shared by every additive material so the depth cue is one
 * consistent atmosphere rather than three. Matches the FogExp2 density the
 * cores use, so lit and additive geometry recede at the same rate.
 */
export const FOG_DENSITY = 0.052;

const VERTEX = /* glsl */ `
  attribute vec3 aStart;
  attribute vec3 aEnd;
  attribute float aPhase;
  attribute float aSpeed;
  attribute float aSize;
  attribute float aCurve;
  attribute float aTint;

  uniform float uTime;
  uniform float uFlow;
  uniform float uDirection;
  uniform float uIntensity;
  uniform float uBirth;
  uniform float uDrain;
  uniform float uKick;
  uniform float uStream;
  uniform vec3  uPointer;
  uniform float uPointerForce;
  uniform vec3  uColorIdle;
  uniform vec3  uColorDown;
  uniform vec3  uColorUp;

  varying vec2  vQuad;
  varying vec3  vColor;
  varying float vAlpha;
  varying float vViewZ;

  void main() {
    // Idle still drifts downstream so the network reads as alive. uFlow is 0
    // then, so the speed term collapses to the slow ambient constant.
    float dir = abs(uDirection) < 0.5 ? 1.0 : uDirection;

    // The kick accelerates the field for ~90ms as the flow bites the other way.
    float speed = (0.045 + uFlow * 0.9) * (1.0 + uKick * 1.6);

    // fract() of a decreasing value is still 0-1 in GLSL (x - floor(x)), so a
    // reversed direction wraps correctly without a second code path.
    float t = fract(aPhase + uTime * speed * aSpeed * dir);

    // ANTICIPATION: the field collapses toward its destination node before the
    // direction flips, so the un-easable switch happens at the darkest frame.
    t = mix(t, dir > 0.0 ? 1.0 : 0.0, uDrain);

    vec3 pos = mix(aStart, aEnd, t);

    // Bow the path off the straight line. The offset axis is derived from the
    // link direction so every link bends in its own plane.
    //
    // The guard is not hypothetical: for a link running exactly along Z the
    // cross product is the zero vector, normalize() of which is NaN, and a
    // single NaN vertex position silently discards the whole primitive. No
    // link in the current topology is axis-aligned that way, but a future one
    // could be, and the failure would look like "the packets vanished".
    vec3 axis = normalize(aEnd - aStart);
    vec3 raw  = cross(axis, vec3(0.0, 0.0, 1.0));
    vec3 bend = length(raw) > 0.0001 ? normalize(raw) : vec3(0.0, 1.0, 0.0);
    pos += bend * sin(t * 3.141592653589793) * aCurve;

    // Cursor as a physical force: the stream bulges away from the pointer as it
    // passes, like a finger drawn through water. Moves dots, never numbers.
    float push = 0.0;
    if (uPointerForce > 0.0) {
      vec3 dp = pos - uPointer;
      push = uPointerForce * exp(-dot(dp.xy, dp.xy) * 2.2);
      pos += normalize(dp + vec3(1e-4)) * push * 0.32;
    }

    // Billboard: offset the quad corner in VIEW space, after the model-view
    // transform, so it always faces the camera at zero CPU cost.
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float size = aSize * (0.6 + uIntensity * 0.8) * (1.0 + uKick * 0.9);
    mv.xy += position.xy * size;
    gl_Position = projectionMatrix * mv;

    // Fade at both ends of the link so packets dissolve into the nodes rather
    // than popping in and out at them.
    float ends = smoothstep(0.0, 0.14, t) * (1.0 - smoothstep(0.86, 1.0, t));

    // Hue crossfades through the flash rather than popping on a step().
    vec3 stream = mix(uColorDown, uColorUp, uStream);
    vec3 tinted = mix(uColorIdle, stream, clamp(uFlow * 1.5, 0.0, 1.0));

    // Distance from the camera, for the fog term in the fragment shader.
    // Negated because view space looks down -Z.
    vViewZ = -mv.z;

    vQuad  = position.xy;
    vColor = mix(tinted, tinted * 1.35, aTint);

    // Packets only flow once the path they travel on has been drawn.
    vAlpha = ends * (0.2 + uIntensity * 0.8)
           * (1.0 - uDrain * 0.85)
           * (1.0 + push * 1.3)
           * smoothstep(0.55, 1.0, uBirth);
  }
`;

const FRAGMENT = /* glsl */ `
  precision mediump float;

  uniform float uFogDensity;
  uniform float uExposure;

  varying vec2  vQuad;
  varying vec3  vColor;
  varying float vAlpha;
  varying float vViewZ;

  void main() {
    // Radial falloff inside the quad. Discarding outside the circle keeps the
    // blend cheap and stops square edges showing where packets overlap.
    float d = length(vQuad);
    if (d > 0.5) discard;

    // Exponent raised from 2.4: sRGB encoding below lifts dim fragments hard
    // (linear 0.1 encodes to 0.35), so the old falloff turned every packet into
    // a soft blob. A tighter curve keeps them reading as points of light.
    float glow = pow(1.0 - d * 2.0, 2.8);

    /*
     * Fog, hand-rolled rather than three's <fog_fragment>.
     *
     * The built-in chunk does mix(color, fogColor, f) - it blends TOWARD the fog
     * colour. Under AdditiveBlending that ADDS dark blue to the framebuffer
     * instead of attenuating, so distant particles would get brighter. Black is
     * the additive identity, so the correct operation here is to multiply toward
     * it. Applied to alpha as well, so the fade survives the blend.
     *
     * This is also why scene.fog never reached these materials: ShaderMaterial
     * defaults to fog:false and needs the uniforms and chunks wired by hand.
     */
    float fog = exp(-uFogDensity * uFogDensity * vViewZ * vViewZ);

    /* Multiplier down from 1.7 for the sRGB encode below; uExposure then lifts
       it back above 1.0 ONLY when the HDR composite is running to catch the
       overrange. Without the composite it stays at 1.0 and the field behaves
       exactly as it did. */
    gl_FragColor = vec4(vColor * glow * 1.15 * uExposure * fog, glow * vAlpha * fog);

    /*
     * THE COLOUR PIPELINE.
     *
     * Without these two chunks this shader wrote LINEAR values straight into an
     * sRGB-encoded framebuffer, while the five lit cores went through the
     * renderer's full tone-map + encode path — two colour spaces in one image,
     * which is the structural reason the cores looked composited in from a
     * different scene.
     *
     * Verified in three r171: WebGLProgram injects the chunk prefix whenever
     * isRawShaderMaterial !== true (line 6377), so these resolve inside a
     * plain ShaderMaterial. Both are selected by currentRenderTarget === null
     * (lines 6886 / 6919), which means that if a render target is ever
     * introduced they neutralise themselves to NoToneMapping and an identity
     * transfer function rather than double-encoding.
     *
     * Every hand-tuned constant above was originally tuned against the broken
     * output, so encoding brightens them and they have come down accordingly.
     */
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

interface PacketFieldProps {
  /** Instance budget for this render tier. */
  count: number;
  nodes: TopologyNode[];
  /** Full tier only: the field bulges away from the cursor. */
  pointerForce?: boolean;
}

export function PacketField({ count, nodes, pointerForce = false }: PacketFieldProps) {

  /* Geometry and per-instance attributes are built once. Nothing below runs
     again unless the tier changes the budget. */
  const { geometry, shader } = useMemo(() => {
    const lookup = nodeMap(nodes);
    const usable = LINKS.filter((link) => lookup.has(link.from) && lookup.has(link.to));
    const totalWeight = usable.reduce((sum, link) => sum + link.weight, 0) || 1;

    const starts: number[] = [];
    const ends: number[] = [];
    const phases: number[] = [];
    const speeds: number[] = [];
    const sizes: number[] = [];
    const curves: number[] = [];
    const tints: number[] = [];

    // Deterministic pseudo-random: a fixed sequence means the field looks
    // identical on every load, so a remount never visibly reshuffles.
    let seed = 0x2f6e2b1;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };

    for (const link of usable) {
      const from = lookup.get(link.from);
      const to = lookup.get(link.to);
      if (!from || !to) continue;

      const share = Math.max(8, Math.round((count * link.weight) / totalWeight));
      for (let i = 0; i < share; i += 1) {
        starts.push(from.position.x, from.position.y, from.position.z);
        ends.push(to.position.x, to.position.y, to.position.z);
        // Evenly spread plus jitter: an even spread alone reads as a marching
        // dashed line rather than traffic.
        phases.push((i / share + rand() * 0.35) % 1);
        speeds.push(0.72 + rand() * 0.62);
        sizes.push(0.035 + rand() * 0.055);
        curves.push(link.curve * (0.62 + rand() * 0.76));
        tints.push(rand());
      }
    }

    const instances = phases.length;

    // A single quad, expanded per instance. Two triangles is the whole mesh.
    // No uv attribute: the fragment shader derives its radial falloff from
    // `position.xy`, so a uv buffer would be dead memory on every instance.
    const quad = quadAttributes();
    const geo = new THREE.InstancedBufferGeometry();
    geo.setIndex(quad.index);
    geo.setAttribute("position", quad.position);
    geo.instanceCount = instances;

    const attr = (data: number[], size: number) =>
      new THREE.InstancedBufferAttribute(new Float32Array(data), size);

    geo.setAttribute("aStart", attr(starts, 3));
    geo.setAttribute("aEnd", attr(ends, 3));
    geo.setAttribute("aPhase", attr(phases, 1));
    geo.setAttribute("aSpeed", attr(speeds, 1));
    geo.setAttribute("aSize", attr(sizes, 1));
    geo.setAttribute("aCurve", attr(curves, 1));
    geo.setAttribute("aTint", attr(tints, 1));

    // The packets move far off their origin in the vertex shader, so the
    // computed bounds are wrong and three would frustum-cull the whole field
    // the moment the origin left the view. A generous manual sphere avoids
    // that without disabling culling for the rest of the scene.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 12);

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uFlow: { value: 0 },
        uDirection: { value: 0 },
        uIntensity: { value: 0 },
        uColorIdle: { value: new THREE.Color("#5b5ff0") },
        uColorDown: { value: new THREE.Color("#22d3ee") },
        uColorUp: { value: new THREE.Color("#a78bfa") },
        uFogDensity: { value: FOG_DENSITY },
        uExposure: { value: 1 },
        uBirth: { value: 0 },
        uDrain: { value: 0 },
        uKick: { value: 0 },
        uStream: { value: 0 },
        uPointer: { value: new THREE.Vector3() },
        uPointerForce: { value: 0 },
      },
    });

    return { geometry: geo, shader: mat };
  }, [count, nodes]);

  /* GPU resources are not garbage collected. Without this, every remount of
     the hero leaks a geometry and a compiled program. */
  useEffect(
    () => () => {
      geometry.dispose();
      shader.dispose();
    },
    [geometry, shader],
  );

  /*
   * The reversal beat.
   *
   * Tracked against a LOCAL ref rather than a field on `drive`: the store keeps
   * that channel to values a `useFrame` actually consumes, and this component
   * already reads `direction` every frame anyway.
   */
  const lastDirection = useRef(0);
  const reversal = useRef<gsap.core.Timeline | null>(null);

  // A remount mid-beat would otherwise leave GSAP ticking against a dead scene.
  // Braced so the cleanup returns void rather than the killed Timeline.
  useEffect(
    () => () => {
      reversal.current?.kill();
    },
    [],
  );

  /* The material from `useMemo` is used directly rather than through a ref on
     `<primitive>`. It is the same object either way, and reading the closure
     removes a null check from the hot path. */
  /** Full budget, so the governor can scale against it without drift. */
  const budget = useRef(0);
  useEffect(() => {
    budget.current = geometry.instanceCount;
  }, [geometry]);

  useFrame((_, delta) => {
    const { uniforms } = shader;

    /* Scaling the packet budget is the ideal quality lever: it is a single
       integer write with no buffer re-upload, and the field degrades by
       thinning rather than by changing character. */
    if (budget.current > 0) {
      const wanted = Math.max(24, Math.round(budget.current * quality.level));
      if (geometry.instanceCount !== wanted) geometry.instanceCount = wanted;
    }

    // Read the shared clock rather than accumulating a private one — see
    // clock.ts for why three independent accumulators plus a wall-clock breath
    // produced a visible pop on every scroll-away.
    uniforms.uTime!.value = clock.t;
    uniforms.uBirth!.value = birth.t;
    uniforms.uExposure!.value = render.hdr ? 2.4 : 1;
    uniforms.uDrain!.value = beat.drain;
    uniforms.uKick!.value = beat.kick;
    uniforms.uStream!.value = beat.stream;

    const step = Math.min(delta, 0.05);

    // Ease toward the measured values rather than snapping. The engine reports
    // throughput in uneven bursts; easing keeps the field's response continuous
    // without smoothing away the reading itself, which is displayed elsewhere.
    const ease = 1 - Math.exp(-step / 0.28);
    uniforms.uFlow!.value += (drive.flow - uniforms.uFlow!.value) * ease;

    /* Idle floor, so the resting scene is not dimmer than something spending a
       WebGL context should look. Peaks at 0.22; a live run sets 0.35 at its
       start, so this can never brighten a real reading. */
    const floor = 0.16 + 0.06 * Math.sin(clock.t * 0.21);
    const target = Math.max(drive.intensity, floor);
    uniforms.uIntensity!.value += (target - uniforms.uIntensity!.value) * ease;

    /* ---- Direction, and the beat that hides the switch ------------------
     * Direction is a hard switch: easing it through zero would stall every
     * packet mid-link. So on a genuine download→upload reversal the field
     * drains first, the value flips on the darkest frame, and a kick fires.
     *
     * ONLY on +1 → -1. `drive.direction` also moves 0→1 when the download
     * starts, −1→0 at completion, and →0 on error; a 260 ms drain firing at
     * completion would collide head-on with the completion surge.
     */
    const next = drive.direction;
    if (next !== lastDirection.current) {
      const isReversal = lastDirection.current === 1 && next === -1;
      lastDirection.current = next;

      if (isReversal) {
        reversal.current?.kill();
        // Captured HERE, not read inside the callback: by the time the .call()
        // fires 260 ms later, drive.direction may already have moved on.
        const committed = next;
        reversal.current = gsap
          .timeline()
          .to(beat, { drain: 1, duration: 0.26, ease: "power2.in" })
          .call(() => {
            uniforms.uDirection!.value = committed;
          })
          .to(beat, { kick: 1, duration: 0.09, ease: "power4.out" })
          .to(beat, { stream: committed < 0 ? 1 : 0, duration: 0.5 }, "<")
          .to(beat, { drain: 0, duration: 0.6, ease: "expo.out" }, "<")
          .to(beat, { kick: 0, duration: 0.72, ease: "power2.out" }, "<");
      } else {
        uniforms.uDirection!.value = next;
        beat.stream = next < 0 ? 1 : 0;
      }
    }

    if (pointerForce) {
      (uniforms.uPointer!.value as THREE.Vector3).set(
        pointerWorld.x,
        pointerWorld.y,
        pointerWorld.z,
      );
      uniforms.uPointerForce!.value = pointerWorld.force;
    }
  });

  return (
    <mesh frustumCulled={false} renderOrder={2}>
      <primitive object={geometry} attach="geometry" />
      <primitive object={shader} attach="material" />
    </mesh>
  );
}

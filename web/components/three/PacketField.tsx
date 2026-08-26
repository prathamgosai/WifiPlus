"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { drive } from "@/store/useTestStore";
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
  uniform vec3  uColorIdle;
  uniform vec3  uColorDown;
  uniform vec3  uColorUp;

  varying vec2  vQuad;
  varying vec3  vColor;
  varying float vAlpha;

  void main() {
    // Idle still drifts downstream so the network reads as alive. uFlow is 0
    // then, so the speed term collapses to the slow ambient constant.
    float dir = abs(uDirection) < 0.5 ? 1.0 : uDirection;
    float speed = 0.045 + uFlow * 0.9;

    // fract() of a decreasing value is still 0-1 in GLSL (x - floor(x)), so a
    // reversed direction wraps correctly without a second code path.
    float t = fract(aPhase + uTime * speed * aSpeed * dir);

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

    // Billboard: offset the quad corner in VIEW space, after the model-view
    // transform, so it always faces the camera at zero CPU cost.
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float size = aSize * (0.6 + uIntensity * 0.8);
    mv.xy += position.xy * size;
    gl_Position = projectionMatrix * mv;

    // Fade at both ends of the link so packets dissolve into the nodes rather
    // than popping in and out at them.
    float ends = smoothstep(0.0, 0.14, t) * (1.0 - smoothstep(0.86, 1.0, t));

    vec3 stream = mix(uColorDown, uColorUp, step(uDirection, -0.5));
    vec3 tinted = mix(uColorIdle, stream, clamp(uFlow * 1.5, 0.0, 1.0));

    vQuad  = position.xy;
    vColor = mix(tinted, tinted * 1.35, aTint);
    vAlpha = ends * (0.2 + uIntensity * 0.8);
  }
`;

const FRAGMENT = /* glsl */ `
  precision mediump float;

  varying vec2  vQuad;
  varying vec3  vColor;
  varying float vAlpha;

  void main() {
    // Radial falloff inside the quad. Discarding outside the circle keeps the
    // blend cheap and stops square edges showing where packets overlap.
    float d = length(vQuad);
    if (d > 0.5) discard;

    float glow = pow(1.0 - d * 2.0, 2.4);
    gl_FragColor = vec4(vColor * glow * 1.7, glow * vAlpha);
  }
`;

interface PacketFieldProps {
  /** Instance budget for this render tier. */
  count: number;
  nodes: TopologyNode[];
}

export function PacketField({ count, nodes }: PacketFieldProps) {

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

  /* The material from `useMemo` is used directly rather than through a ref on
     `<primitive>`. It is the same object either way, and reading the closure
     removes a null check from the hot path. */
  useFrame((_, delta) => {
    const { uniforms } = shader;

    // Clamped so a long frame (a backgrounded tab returning) cannot jump the
    // animation forward by seconds.
    const step = Math.min(delta, 0.05);
    uniforms.uTime!.value += step;

    // Ease toward the measured values rather than snapping. The engine reports
    // throughput in uneven bursts; easing keeps the field's response continuous
    // without smoothing away the reading itself, which is displayed elsewhere.
    const ease = 1 - Math.exp(-step / 0.28);
    uniforms.uFlow!.value += (drive.flow - uniforms.uFlow!.value) * ease;
    uniforms.uIntensity!.value += (drive.intensity - uniforms.uIntensity!.value) * ease;
    // Direction is a hard switch: easing it through zero would stall every
    // packet mid-link at the download-to-upload handover.
    uniforms.uDirection!.value = drive.direction;
  });

  return (
    <mesh frustumCulled={false} renderOrder={2}>
      <primitive object={geometry} attach="geometry" />
      <primitive object={shader} attach="material" />
    </mesh>
  );
}

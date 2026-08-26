"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { drive } from "@/store/useTestStore";
import { LINKS, nodeMap, type TopologyNode } from "./topology";

/**
 * The connections between hops, with a signal travelling along them.
 * -----------------------------------------------------------------------------
 * WEBGL OPTIMISATION - every link is one polyline in ONE merged geometry drawn
 * as a single `LineSegments`. The travelling highlight is a shader term over a
 * per-vertex `aT` (0-1 along its own link), so the sweep costs one uniform per
 * frame rather than a geometry rebuild.
 *
 * Plain `LineSegments` rather than a tube or a mesh-line: GPU line width is
 * capped at 1px on every WebGL implementation, so a thicker line means building
 * quad strips - roughly 8x the vertices and a second pass - for an effect that
 * additive blending and a glow halo already sell in a dark scene.
 *
 * The sweep direction follows the phase the engine is genuinely in, so during
 * upload the highlight runs upstream. During idle it drifts slowly downstream:
 * ambient motion, not a claim of measurement.
 */

/** Samples per link. Enough to make the bow read as a curve, few enough to be free. */
const SEGMENTS = 48;

const VERTEX = /* glsl */ `
  attribute float aT;
  varying float vT;

  void main() {
    vT = aT;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision mediump float;

  uniform float uTime;
  uniform float uFlow;
  uniform float uDirection;
  uniform float uIntensity;
  uniform vec3  uColorIdle;
  uniform vec3  uColorDown;
  uniform vec3  uColorUp;

  varying float vT;

  void main() {
    float dir = abs(uDirection) < 0.5 ? 1.0 : uDirection;
    float speed = 0.09 + uFlow * 0.7;

    // Distance from this vertex to the travelling band, wrapped so the band
    // re-enters at the far end instead of jumping.
    float head = fract(uTime * speed * dir);
    float d = abs(fract(vT - head + 0.5) - 0.5);

    float band = pow(1.0 - smoothstep(0.0, 0.22, d), 3.0);

    vec3 stream = mix(uColorDown, uColorUp, step(uDirection, -0.5));
    vec3 tinted = mix(uColorIdle, stream, clamp(uFlow * 1.5, 0.0, 1.0));

    // A dim resting line so the topology is legible before a test is ever run,
    // plus the band on top.
    float base = 0.16 + uIntensity * 0.16;
    float alpha = base + band * (0.35 + uIntensity * 0.65);

    gl_FragColor = vec4(tinted * (0.65 + band * 1.5), alpha);
  }
`;

export function LinkTrails({ nodes }: { nodes: TopologyNode[] }) {

  const { geometry, shader } = useMemo(() => {
    const lookup = nodeMap(nodes);
    const positions: number[] = [];
    const ts: number[] = [];

    for (const link of LINKS) {
      const from = lookup.get(link.from);
      const to = lookup.get(link.to);
      if (!from || !to) continue;

      // Same bow the packets ride, so the trail and the traffic share a path.
      // Deriving the bend axis identically here is what keeps them aligned.
      const axis = new THREE.Vector3().subVectors(to.position, from.position).normalize();
      const bend = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 0, 1)).normalize();

      const point = (t: number) =>
        new THREE.Vector3()
          .lerpVectors(from.position, to.position, t)
          .addScaledVector(bend, Math.sin(t * Math.PI) * link.curve);

      // LineSegments takes vertex PAIRS, so each sample is emitted twice except
      // at the ends — this is what draws a continuous polyline in one call.
      for (let i = 0; i < SEGMENTS; i += 1) {
        const t0 = i / SEGMENTS;
        const t1 = (i + 1) / SEGMENTS;
        const p0 = point(t0);
        const p1 = point(t1);
        positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
        ts.push(t0, t1);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("aT", new THREE.Float32BufferAttribute(ts, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uFlow: { value: 0 },
        uDirection: { value: 0 },
        uIntensity: { value: 0 },
        uColorIdle: { value: new THREE.Color("#4c51e0") },
        uColorDown: { value: new THREE.Color("#22d3ee") },
        uColorUp: { value: new THREE.Color("#a78bfa") },
      },
    });

    return { geometry: geo, shader: mat };
  }, [nodes]);

  useEffect(
    () => () => {
      geometry.dispose();
      shader.dispose();
    },
    [geometry, shader],
  );

  useFrame((_, delta) => {
    const { uniforms } = shader;

    const step = Math.min(delta, 0.05);
    uniforms.uTime!.value += step;

    const ease = 1 - Math.exp(-step / 0.3);
    uniforms.uFlow!.value += (drive.flow - uniforms.uFlow!.value) * ease;
    uniforms.uIntensity!.value += (drive.intensity - uniforms.uIntensity!.value) * ease;
    uniforms.uDirection!.value = drive.direction;
  });

  return (
    <lineSegments frustumCulled={false} renderOrder={1}>
      <primitive object={geometry} attach="geometry" />
      <primitive object={shader} attach="material" />
    </lineSegments>
  );
}

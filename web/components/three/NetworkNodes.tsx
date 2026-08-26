"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { drive } from "@/store/useTestStore";
import type { StageId } from "@/lib/stages";
import { quadAttributes } from "./quad";
import type { TopologyNode } from "./topology";

/**
 * The hops themselves: solid cores, glow halos, and the ambient field behind.
 * -----------------------------------------------------------------------------
 * WEBGL OPTIMISATION
 *   · ONE `IcosahedronGeometry` is shared by every core mesh. Five meshes, one
 *     geometry upload. Detail 2 (~80 triangles) is indistinguishable from a
 *     sphere at this size and a fraction of the cost.
 *   · Halos and satellites are each a single instanced draw call, billboarded
 *     in the vertex shader - the same technique as `PacketField`, for the same
 *     reason: no CPU-side `lookAt` per object.
 *   · Only the five named cores get a `MeshStandardMaterial` (lit). The
 *     hundreds of satellites are unlit additive sprites, which cost nothing.
 *
 * The ripple is driven by `drive.pulse`, which the store increments once per
 * latency probe that ACTUALLY RETURNED. It is a real round trip made visible,
 * not a timed animation - if the probes stop coming back, the ripples stop.
 */

const NODE_COLOR: Record<string, string> = {
  device: "#8184f3",
  router: "#a2a5f7",
  isp: "#22d3ee",
  edge: "#67e8f9",
  internet: "#a78bfa",
  satellite: "#5b5ff0",
};

/* ---------------------------------------------------------------------------
   Billboarded additive sprites — shared by halos and satellites
   ------------------------------------------------------------------------ */

const SPRITE_VERTEX = /* glsl */ `
  attribute vec3  aCenter;
  attribute float aSize;
  attribute vec3  aColor;
  attribute float aSeed;

  uniform float uTime;
  uniform float uIntensity;
  uniform float uSway;

  varying vec2 vQuad;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec3 pos = aCenter;

    // A slow, per-sprite drift so the ambient field is never perfectly static.
    // Amplitude is a uniform so the named halos can opt out with uSway = 0.
    pos.x += sin(uTime * 0.35 + aSeed * 6.283) * uSway;
    pos.y += cos(uTime * 0.28 + aSeed * 4.712) * uSway;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    mv.xy += position.xy * aSize;
    gl_Position = projectionMatrix * mv;

    vQuad  = position.xy;
    vColor = aColor;
    // Gentle breathing, offset per sprite so they never pulse in unison.
    vAlpha = 0.45 + 0.25 * sin(uTime * 0.9 + aSeed * 6.283) + uIntensity * 0.3;
  }
`;

const SPRITE_FRAGMENT = /* glsl */ `
  precision mediump float;

  varying vec2 vQuad;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float d = length(vQuad);
    if (d > 0.5) discard;
    // Wider, softer falloff than the packets — these read as bloom, not dots.
    float glow = pow(1.0 - d * 2.0, 3.2);
    gl_FragColor = vec4(vColor * glow, glow * vAlpha);
  }
`;

interface SpriteSpec {
  center: THREE.Vector3;
  size: number;
  color: THREE.Color;
}

/** One instanced draw call for an arbitrary set of glowing billboards. */
function SpriteField({ sprites, sway }: { sprites: SpriteSpec[]; sway: number }) {

  const { geometry, shader } = useMemo(() => {
    const centers: number[] = [];
    const sizes: number[] = [];
    const colors: number[] = [];
    const seeds: number[] = [];

    sprites.forEach((sprite, index) => {
      centers.push(sprite.center.x, sprite.center.y, sprite.center.z);
      sizes.push(sprite.size);
      colors.push(sprite.color.r, sprite.color.g, sprite.color.b);
      // Deterministic per-index seed — no Math.random, so the field is stable
      // across remounts and identical between renders.
      seeds.push(((index * 0.6180339887) % 1 + 1) % 1);
    });

    const quad = quadAttributes();
    const geo = new THREE.InstancedBufferGeometry();
    geo.setIndex(quad.index);
    geo.setAttribute("position", quad.position);
    geo.instanceCount = sprites.length;

    const attr = (data: number[], size: number) =>
      new THREE.InstancedBufferAttribute(new Float32Array(data), size);

    geo.setAttribute("aCenter", attr(centers, 3));
    geo.setAttribute("aSize", attr(sizes, 1));
    geo.setAttribute("aColor", attr(colors, 3));
    geo.setAttribute("aSeed", attr(seeds, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -2), 14);

    const mat = new THREE.ShaderMaterial({
      vertexShader: SPRITE_VERTEX,
      fragmentShader: SPRITE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uSway: { value: sway },
      },
    });

    return { geometry: geo, shader: mat };
  }, [sprites, sway]);

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
    const ease = 1 - Math.exp(-step / 0.35);
    uniforms.uIntensity!.value += (drive.intensity - uniforms.uIntensity!.value) * ease;
  });

  return (
    <mesh frustumCulled={false} renderOrder={0}>
      <primitive object={geometry} attach="geometry" />
      <primitive object={shader} attach="material" />
    </mesh>
  );
}

/* ---------------------------------------------------------------------------
   Named hop cores
   ------------------------------------------------------------------------ */

interface CoresProps {
  nodes: TopologyNode[];
  stage: StageId;
}

/**
 * Where the cores settle once a run finishes.
 *
 * The bands match `healthBand()` in `core/health.js` (78 excellent, 62 good,
 * 42 fair) so the colour the scene rests at and the word printed in the report
 * are describing the same verdict. A scene that always resolves to a confident
 * green would be congratulating every connection equally.
 */
const HEALTH_COLORS = [
  { min: 0.78, color: new THREE.Color("#34d399") },
  { min: 0.62, color: new THREE.Color("#22d3ee") },
  { min: 0.42, color: new THREE.Color("#fbbf24") },
  { min: 0, color: new THREE.Color("#fb7185") },
];

function healthColor(health: number): THREE.Color {
  const band = HEALTH_COLORS.find((entry) => health >= entry.min);
  return band ? band.color : (HEALTH_COLORS[HEALTH_COLORS.length - 1]!.color);
}

function Cores({ nodes, stage }: CoresProps) {
  const group = useRef<THREE.Group>(null);
  const lastPulse = useRef(0);
  const flash = useRef(0);

  // ONE geometry for every core. Detail 2 is ~80 triangles.
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1, 2), []);

  /** The colour each core returns to. Kept so the health tint is reversible. */
  const baseColors = useMemo(
    () => nodes.map((node) => new THREE.Color(NODE_COLOR[node.kind] ?? "#5b5ff0")),
    [nodes],
  );

  const materials = useMemo(
    () =>
      baseColors.map(
        (color) =>
          new THREE.MeshStandardMaterial({
            color: color.clone().multiplyScalar(0.35),
            emissive: color.clone(),
            emissiveIntensity: 0.55,
            roughness: 0.35,
            metalness: 0.1,
          }),
      ),
    [baseColors],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      materials.forEach((material) => material.dispose());
    },
    [geometry, materials],
  );

  useFrame((_, delta) => {
    const step = Math.min(delta, 0.05);

    // A returned probe spikes the flash; it decays on its own from there.
    if (drive.pulse !== lastPulse.current) {
      lastPulse.current = drive.pulse;
      flash.current = 1;
    }
    flash.current *= Math.exp(-step / 0.22);

    nodes.forEach((node, index) => {
      const material = materials[index];
      const mesh = group.current?.children[index];
      if (!material || !mesh) return;

      const lit = node.litBy.includes(stage as never);
      const target =
        (lit ? 0.75 : 0.3) + drive.intensity * 0.55 + (lit ? flash.current * 0.9 : 0);

      material.emissiveIntensity += (target - material.emissiveIntensity) * (1 - Math.exp(-step / 0.2));

      /* Once the run completes, the cores drift toward the colour of the score
         it earned; at every other moment they drift back to their own hue.
         `lerp` on the material's emissive is the cheapest possible way to do
         this — no new Color is allocated per frame. */
      const settle = stage === "complete" ? healthColor(drive.health) : baseColors[index];
      if (settle) material.emissive.lerp(settle, 1 - Math.exp(-step / 0.9));

      // A gentle breath keeps the cores from looking like static geometry.
      const breath = 1 + Math.sin(performance.now() * 0.0012 + index) * 0.035;
      const active = lit ? 1 + drive.intensity * 0.12 + flash.current * 0.1 : 1;
      mesh.scale.setScalar(node.radius * breath * active);
    });
  });

  return (
    <group ref={group}>
      {nodes.map((node, index) => (
        <mesh
          key={node.id}
          geometry={geometry}
          material={materials[index]}
          position={node.position}
          scale={node.radius}
        />
      ))}
    </group>
  );
}

/* ---------------------------------------------------------------------------
   Latency ripple
   ------------------------------------------------------------------------ */

/**
 * Expanding rings at the device, one per returned probe.
 *
 * Three rings are pooled and recycled. A probe arriving while all three are
 * mid-flight takes the oldest, which is what makes a fast connection look busy
 * without allocating anything.
 */
function LatencyRipple({ at }: { at: THREE.Vector3 }) {
  const group = useRef<THREE.Group>(null);
  const ages = useRef([9, 9, 9]);
  const next = useRef(0);
  const lastPulse = useRef(0);

  const geometry = useMemo(() => new THREE.RingGeometry(0.85, 1, 48), []);
  const materials = useMemo(
    () =>
      [0, 1, 2].map(
        () =>
          new THREE.MeshBasicMaterial({
            color: new THREE.Color("#67e8f9"),
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
          }),
      ),
    [],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      materials.forEach((material) => material.dispose());
    },
    [geometry, materials],
  );

  useFrame(({ camera }, delta) => {
    const step = Math.min(delta, 0.05);

    if (drive.pulse !== lastPulse.current) {
      lastPulse.current = drive.pulse;
      ages.current[next.current] = 0;
      next.current = (next.current + 1) % ages.current.length;
    }

    for (let i = 0; i < ages.current.length; i += 1) {
      const age = (ages.current[i] ?? 9) + step;
      ages.current[i] = age;

      const material = materials[i];
      const mesh = group.current?.children[i];
      if (!material || !mesh) continue;

      // 1.1s life. Past that the ring is invisible and costs one opacity write.
      const t = Math.min(age / 1.1, 1);
      material.opacity = t >= 1 ? 0 : (1 - t) * 0.5;
      mesh.scale.setScalar(0.22 + t * 1.5);
      // Only three objects, so a per-frame quaternion copy is genuinely cheaper
      // than a billboarding shader would be here.
      mesh.quaternion.copy(camera.quaternion);
    }
  });

  return (
    <group ref={group} position={at}>
      {materials.map((material, index) => (
        <mesh key={index} geometry={geometry} material={material} />
      ))}
    </group>
  );
}

/* ---------------------------------------------------------------------------
   Public component
   ------------------------------------------------------------------------ */

interface NetworkNodesProps {
  nodes: TopologyNode[];
  satelliteNodes: TopologyNode[];
  stage: StageId;
}

export function NetworkNodes({ nodes, satelliteNodes, stage }: NetworkNodesProps) {
  const halos = useMemo<SpriteSpec[]>(
    () =>
      nodes.map((node) => ({
        center: node.position,
        // Halos are several times the core radius — the bloom is what sells the
        // node as a light source rather than a ball.
        size: node.radius * 7.5,
        color: new THREE.Color(NODE_COLOR[node.kind] ?? "#5b5ff0"),
      })),
    [nodes],
  );

  const ambient = useMemo<SpriteSpec[]>(
    () =>
      satelliteNodes.map((node) => ({
        center: node.position,
        size: node.radius * 9,
        color: new THREE.Color(NODE_COLOR.satellite ?? "#5b5ff0"),
      })),
    [satelliteNodes],
  );

  const device = nodes.find((node) => node.kind === "device");

  return (
    <group>
      <SpriteField sprites={ambient} sway={0.06} />
      <SpriteField sprites={halos} sway={0} />
      <Cores nodes={nodes} stage={stage} />
      {device && <LatencyRipple at={device.position} />}
    </group>
  );
}

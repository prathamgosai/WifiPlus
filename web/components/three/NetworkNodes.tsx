"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import gsap from "gsap";
import * as THREE from "three";
import { drive } from "@/store/useTestStore";
import type { StageId } from "@/lib/stages";
import { birth } from "./birth";
import { clock } from "./clock";
import { FOG_DENSITY } from "./PacketField";
import { pointerWorld } from "./pointer";
import { render } from "./quality";
import { quadAttributes } from "./quad";
import type { TopologyNode } from "./topology";

/**
 * The hops themselves: solid fresnel cores, glow halos, and the ambient field.
 * -----------------------------------------------------------------------------
 * WEBGL OPTIMISATION
 *   · The five cores are ONE `InstancedMesh` with ONE `ShaderMaterial`, down
 *     from five meshes with five `MeshStandardMaterial`s. Five draw calls
 *     become one, and the scene no longer needs a light rig at all.
 *   · Halos and satellites are each a single instanced draw call, billboarded
 *     in the vertex shader — no CPU-side `lookAt` per object.
 *   · Per frame the CPU writes 5 instance matrices and 5 floats. Nothing else.
 *
 * WHY FRESNEL. The cores previously had no readable silhouette: an emissive
 * ball sitting inside its own additive halo has no edge, so it dissolved into
 * the glow rather than sitting in front of it. A rim term — brightest where the
 * surface turns away from the camera — is the cheapest way to give an emissive
 * object a contour, and shifting the rim hue with the viewing angle costs one
 * `mix`.
 *
 * WHY THE CORES ARE OPAQUE. Everything else in this scene is additive with
 * `depthWrite: false`, which means nothing could ever be darker than the page
 * behind it. The cores write depth and are the one element that genuinely
 * occludes — they are what the glow has to sit in front of.
 *
 * The ripple is driven by `drive.pulse`, which the store increments once per
 * latency probe ATTEMPT. It is paced by real network activity rather than by a
 * timer — but note the limit precisely: `core/measure.js` fires its onSample
 * callback at the end of every iteration including failed ones, and hands back
 * the most recent SUCCESSFUL round trip. A lost probe is indistinguishable from
 * a returned one at that boundary, so the ripples do NOT stop when probes stop
 * coming back. Fixing that would mean changing core/, which is out of bounds.
 */

const NODE_COLOR: Record<string, string> = {
  device: "#8184f3",
  router: "#a2a5f7",
  isp: "#22d3ee",
  edge: "#67e8f9",
  internet: "#a78bfa",
  satellite: "#5b5ff0",
};

/**
 * Verdict colours, indexed by the flag values `lib/doctor.ts` produces.
 *
 * Index 0 is unused — a node with no verdict keeps its own hue rather than
 * being tinted. Three states, not two: `core/health.js` genuinely returns
 * ok / suspect / unknown, and collapsing "could not judge" into "fine" is the
 * same dishonesty as inventing a measurement.
 */
const FLAG_COLOR = ["#000000", "#34d399", "#fbbf24", "#64748b"] as const;

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
  uniform float uBirth;
  uniform vec3  uPointer;
  uniform float uPointerForce;

  varying vec2 vQuad;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vViewZ;

  void main() {
    vec3 pos = aCenter;

    // A slow, per-sprite drift so the ambient field is never perfectly static.
    // Amplitude is a uniform so the named halos can opt out with uSway = 0.
    pos.x += sin(uTime * 0.35 + aSeed * 6.283) * uSway;
    pos.y += cos(uTime * 0.28 + aSeed * 4.712) * uSway;

    // Cursor displacement. uPointerForce is 0 for the node halos — they must
    // stay welded to their cores, or the glow detaches from the object.
    float push = 0.0;
    if (uPointerForce > 0.0) {
      vec3 dp = pos - uPointer;
      push = uPointerForce * exp(-dot(dp.xy, dp.xy) * 1.4);
      pos += normalize(dp + vec3(1e-4)) * push * 0.22;
    }

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    mv.xy += position.xy * aSize;
    gl_Position = projectionMatrix * mv;

    vViewZ = -mv.z;
    vQuad  = position.xy;
    vColor = aColor;

    // Gentle breathing, offset per sprite so they never pulse in unison.
    // Amplitudes are down from 0.45/0.25/0.3 to compensate for sRGB encoding.
    float breathe = 0.30 + 0.17 * sin(uTime * 0.9 + aSeed * 6.283) + uIntensity * 0.22;

    // Birth: the field resolves out of the fog, staggered by seed so it does
    // not appear as one sheet.
    vAlpha = breathe * smoothstep(0.0, 0.7, uBirth + aSeed * 0.25) * (1.0 + push * 1.1);
  }
`;

const SPRITE_FRAGMENT = /* glsl */ `
  precision mediump float;

  uniform float uFogDensity;

  varying vec2 vQuad;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vViewZ;

  void main() {
    float d = length(vQuad);
    if (d > 0.5) discard;
    // Wider, softer falloff than the packets — these read as bloom, not dots.
    // Exponent up from 3.2 to hold that shape once encoding lifts the tail.
    float glow = pow(1.0 - d * 2.0, 3.6);

    // The ambient satellite field is the whole reason this term exists: it sits
    // at z -2.4 to -6.0 and, before this, received no depth attenuation at all
    // because scene.fog cannot reach a ShaderMaterial.
    float fog = exp(-uFogDensity * uFogDensity * vViewZ * vViewZ);

    gl_FragColor = vec4(vColor * glow * fog, glow * vAlpha * fog);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

interface SpriteSpec {
  center: THREE.Vector3;
  size: number;
  color: THREE.Color;
}

/** One instanced draw call for an arbitrary set of glowing billboards. */
function SpriteField({
  sprites,
  sway,
  pointerFactor = 0,
}: {
  sprites: SpriteSpec[];
  sway: number;
  /** 0 for node halos — they must not detach from their cores. */
  pointerFactor?: number;
}) {
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
        uFogDensity: { value: FOG_DENSITY },
        uBirth: { value: 0 },
        uPointer: { value: new THREE.Vector3() },
        uPointerForce: { value: 0 },
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

    uniforms.uTime!.value = clock.t;
    uniforms.uBirth!.value = birth.t;

    const ease = 1 - Math.exp(-step / 0.35);
    // Idle floor — see the note in LinkTrails. Peaks at 0.22, below the 0.35 a
    // live run sets, so it can never brighten a real reading.
    const floor = 0.16 + 0.06 * Math.sin(clock.t * 0.21);
    const target = Math.max(drive.intensity, floor);
    uniforms.uIntensity!.value += (target - uniforms.uIntensity!.value) * ease;

    if (pointerFactor > 0) {
      (uniforms.uPointer!.value as THREE.Vector3).set(
        pointerWorld.x,
        pointerWorld.y,
        pointerWorld.z,
      );
      uniforms.uPointerForce!.value = pointerWorld.force * pointerFactor;
    }
  });

  return (
    <mesh frustumCulled={false} renderOrder={0}>
      <primitive object={geometry} attach="geometry" />
      <primitive object={shader} attach="material" />
    </mesh>
  );
}

/* ---------------------------------------------------------------------------
   Named hop cores — one instanced fresnel mesh
   ------------------------------------------------------------------------ */

const CORE_VERTEX = /* glsl */ `
  attribute vec3  aColor;
  attribute float aEmissive;

  varying vec3  vColor;
  varying float vEmissive;
  varying vec3  vNormalView;
  varying vec3  vViewDir;
  varying float vViewZ;

  void main() {
    vColor = aColor;
    vEmissive = aEmissive;

    // instanceMatrix is declared for us by three's vertex prefix whenever the
    // object is an InstancedMesh and the material is not a RawShaderMaterial.
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);

    // Normal into view space. mat3() of the combined matrix is correct here
    // because every instance is uniformly scaled — a non-uniform scale would
    // need the inverse transpose.
    mat3 nm = mat3(modelViewMatrix * instanceMatrix);
    vNormalView = normalize(nm * normal);

    // In view space the camera sits at the origin, so the direction to it is
    // simply the negated position.
    vViewDir = normalize(-mv.xyz);
    vViewZ = -mv.z;

    gl_Position = projectionMatrix * mv;
  }
`;

const CORE_FRAGMENT = /* glsl */ `
  precision mediump float;

  uniform vec3  uRimA;
  uniform vec3  uRimB;
  uniform float uFogDensity;

  varying vec3  vColor;
  varying float vEmissive;
  varying vec3  vNormalView;
  varying vec3  vViewDir;
  varying float vViewZ;

  void main() {
    // Fresnel: brightest where the surface turns away from the camera. This is
    // what gives an emissive ball a readable contour against a glow field.
    float f = pow(1.0 - abs(dot(normalize(vNormalView), normalize(vViewDir))), 3.2);

    // The rim shifts hue with the viewing angle. One mix, and it reads as a
    // thin iridescent shell rather than a flat outline.
    vec3 rim = mix(uRimA, uRimB, f);

    vec3 color = vColor * vEmissive + rim * f * 2.4;

    float fog = exp(-uFogDensity * uFogDensity * vViewZ * vViewZ);

    // Opaque. These are the only objects in the scene that occlude anything.
    gl_FragColor = vec4(color * fog, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

interface CoresProps {
  nodes: TopologyNode[];
  stage: StageId;
}

function Cores({ nodes, stage }: CoresProps) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const lastPulse = useRef(0);
  const flash = useRef(0);

  // ONE geometry for every core. Detail 2 is ~80 triangles.
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1, 2), []);

  const baseColors = useMemo(
    () => nodes.map((node) => new THREE.Color(NODE_COLOR[node.kind] ?? "#5b5ff0")),
    [nodes],
  );

  const { material, colorAttr, emissiveAttr } = useMemo(() => {
    const count = baseColors.length;

    const colors = new Float32Array(count * 3);
    baseColors.forEach((color, index) => {
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    });

    const colorAttribute = new THREE.InstancedBufferAttribute(colors, 3);
    const emissiveAttribute = new THREE.InstancedBufferAttribute(
      new Float32Array(count).fill(0.55),
      1,
    );

    const mat = new THREE.ShaderMaterial({
      vertexShader: CORE_VERTEX,
      fragmentShader: CORE_FRAGMENT,
      // Opaque and depth-writing: this is the scene's only occluder.
      transparent: false,
      depthWrite: true,
      uniforms: {
        uRimA: { value: new THREE.Color("#22d3ee") },
        uRimB: { value: new THREE.Color("#a78bfa") },
        uFogDensity: { value: FOG_DENSITY },
      },
    });

    return { material: mat, colorAttr: colorAttribute, emissiveAttr: emissiveAttribute };
  }, [baseColors]);

  /* Attach the per-instance attributes to the geometry. They travel with it
     into the InstancedMesh three builds. */
  useEffect(() => {
    geometry.setAttribute("aColor", colorAttr);
    geometry.setAttribute("aEmissive", emissiveAttr);
  }, [geometry, colorAttr, emissiveAttr]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  /* ---- Completion surge ------------------------------------------------
     A staggered pop along the chain when a run finishes. Impact then release
     is what makes an ending feel like an ending rather than a fade. */
  const surges = useMemo(() => nodes.map(() => ({ v: 0 })), [nodes]);

  useEffect(() => {
    if (stage !== "complete") return;
    const timelines = surges.map((surge, index) =>
      gsap
        .timeline({ delay: index * 0.08 })
        .to(surge, { v: 1, duration: 0.2, ease: "power4.out" })
        .to(surge, { v: 0, duration: 1.4, ease: "expo.out" }),
    );
    return () => timelines.forEach((timeline) => timeline.kill());
  }, [stage, surges]);

  /** Scratch objects, allocated once — never per frame. */
  const scratch = useMemo(
    () => ({ matrix: new THREE.Matrix4(), color: new THREE.Color(), target: new THREE.Color() }),
    [],
  );

  useFrame((_, delta) => {
    const instanced = mesh.current;
    if (!instanced) return;
    const step = Math.min(delta, 0.05);

    // A returned probe spikes the flash; it decays on its own from there.
    if (drive.pulse !== lastPulse.current) {
      lastPulse.current = drive.pulse;
      flash.current = 1;
    }
    flash.current *= Math.exp(-step / 0.22);

    const settled = stage === "complete";

    nodes.forEach((node, index) => {
      const lit = node.litBy.includes(stage as never);
      const surge = surges[index]?.v ?? 0;

      /* ---- Emissive ---------------------------------------------------- */
      const current = emissiveAttr.getX(index);
      /* Above 1.0 only when the HDR composite is running to catch it. Without
         it these values are tone-mapped per fragment and then added in an
         8-bit buffer, where anything this bright resolves to white. */
      const exposure = render.hdr ? 3.2 : 1;
      const target =
        ((lit ? 0.75 : 0.3) + drive.intensity * 0.55 + (lit ? flash.current * 0.9 : 0)) * exposure +
        surge * 1.6 * exposure;
      /* 0.35s, not 0.9s. At 0.9 the exponential needs ln(20) x 0.9 ~= 2.7s to
         reach 95%, so the scene was still arriving at its verdict long after
         the DOM had printed the number — a visible desync at the one moment
         the two should agree. */
      emissiveAttr.setX(index, current + (target - current) * (1 - Math.exp(-step / 0.35)));

      /* ---- Colour: the node's own hue, or its verdict once settled ------
         Each core settles to ITS OWN hop's verdict rather than all five taking
         the overall health score — which would be the scene answering
         "everywhere, equally" to a question about where the bottleneck is. */
      const flag = drive.hopFlags[index] ?? 0;
      const base = baseColors[index];
      if (base) {
        if (settled && flag > 0) {
          scratch.target.set(FLAG_COLOR[flag] ?? "#64748b");
        } else {
          scratch.target.copy(base);
        }
        scratch.color.fromBufferAttribute(colorAttr, index);
        scratch.color.lerp(scratch.target, 1 - Math.exp(-step / 0.35));
        colorAttr.setXYZ(index, scratch.color.r, scratch.color.g, scratch.color.b);
      }

      /* ---- Scale: breath, activity, flash, birth, surge ----------------- */
      const breath = 1 + Math.sin(clock.t * 1.2 + index) * 0.035;
      const active = lit ? 1 + drive.intensity * 0.12 + flash.current * 0.1 : 1;

      // Staggered pop-in along the chain, with a slight overshoot.
      const grow = THREE.MathUtils.smoothstep(birth.t, index * 0.14, index * 0.14 + 0.5);
      const overshoot = grow < 1 ? 1 + Math.sin(grow * Math.PI) * 0.22 : 1;

      const scale = node.radius * breath * active * grow * overshoot * (1 + surge * 0.18);

      scratch.matrix.makeScale(scale, scale, scale);
      scratch.matrix.setPosition(node.position);
      instanced.setMatrixAt(index, scratch.matrix);
    });

    instanced.instanceMatrix.needsUpdate = true;
    colorAttr.needsUpdate = true;
    emissiveAttr.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, nodes.length]}
      frustumCulled={false}
      renderOrder={2}
    />
  );
}

/* ---------------------------------------------------------------------------
   Latency ripple
   ------------------------------------------------------------------------ */

/**
 * Expanding rings at the device, one per latency probe.
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
      const ring = group.current?.children[i];
      if (!material || !ring) continue;

      // 1.1s life. Past that the ring is invisible and costs one opacity write.
      const t = Math.min(age / 1.1, 1);

      /* Eased, not linear. A shockwave that expands and fades at a constant
         rate is the most generic ripple there is: real ones leave fast and
         decay slowly. */
      const expand = 1 - Math.pow(1 - t, 3);
      material.opacity = t >= 1 ? 0 : Math.pow(1 - t, 1.8) * 0.55;
      ring.scale.setScalar(0.22 + expand * 2.4);

      // Only three objects, so a per-frame quaternion copy is genuinely cheaper
      // than a billboarding shader would be here.
      ring.quaternion.copy(camera.quaternion);
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
   Backdrop
   ------------------------------------------------------------------------ */

/**
 * One large dark plane behind everything.
 *
 * Every other element here is additive with `depthWrite: false`, which means
 * nothing in the image could ever be darker than the CSS background — the
 * structural reason the scene read as glowing particles rather than as a
 * photographed space. Light needs something to be brighter THAN.
 *
 * One normal-blended plane, drawn first, with a soft radial falloff so it has
 * no visible edge. One draw call and ONE layer of fill: the alternative
 * considered was a stack of ~40 overlapping quads, which is an overdraw stack
 * costing roughly an order of magnitude more for the same value range.
 */
function Backdrop() {
  const { geometry, material } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(34, 20);
    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        uniform vec3  uColor;
        uniform float uBirth;
        varying vec2 vUv;
        void main() {
          // Radial falloff from the centre, so the plane has no findable edge
          // against the page background it sits on.
          float d = length(vUv - 0.5) * 1.6;
          float a = (1.0 - smoothstep(0.15, 1.0, d)) * 0.55;
          gl_FragColor = vec4(uColor, a * uBirth);
        }
      `,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Color("#04060f") },
        uBirth: { value: 0 },
      },
    });
    return { geometry: geo, material: mat };
  }, []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame(() => {
    material.uniforms.uBirth!.value = birth.t;
  });

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[0, 0, -7]}
      frustumCulled={false}
      renderOrder={-1}
    />
  );
}

/* ---------------------------------------------------------------------------
   Public component
   ------------------------------------------------------------------------ */

interface NetworkNodesProps {
  nodes: TopologyNode[];
  satelliteNodes: TopologyNode[];
  stage: StageId;
  /** Full tier only: the satellite field reacts to the cursor. */
  pointerForce?: boolean;
}

export function NetworkNodes({
  nodes,
  satelliteNodes,
  stage,
  pointerForce = false,
}: NetworkNodesProps) {
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
      <Backdrop />
      <SpriteField sprites={ambient} sway={0.06} pointerFactor={pointerForce ? 0.4 : 0} />
      {/* sway and pointerFactor both 0: a halo must stay welded to its core. */}
      <SpriteField sprites={halos} sway={0} pointerFactor={0} />
      <Cores nodes={nodes} stage={stage} />
      {device && <LatencyRipple at={device.position} />}
    </group>
  );
}

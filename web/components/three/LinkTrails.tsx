"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { drive } from "@/store/useTestStore";
import { beat } from "./beat";
import { birth } from "./birth";
import { clock } from "./clock";
import { FOG_DENSITY } from "./PacketField";
import { LINKS, nodeMap, type TopologyNode } from "./topology";

/**
 * The connections between hops: camera-facing ribbons with a travelling signal.
 * -----------------------------------------------------------------------------
 * WEBGL OPTIMISATION — every link is one strip in ONE merged geometry drawn as
 * a single indexed `Mesh`. 4 links x 48 segments x 2 triangles = 384 triangles,
 * 392 vertices, one draw call. The travelling highlight is a shader term over a
 * per-vertex `aT` (0-1 along its own link), so the sweep costs one uniform per
 * frame rather than a geometry rebuild. The ribbon is billboarded in VIEW
 * space, so it always faces the camera with no CPU-side orientation work.
 *
 * WHY NOT `LineSegments` ANY MORE. This used to be 1px GL lines, defended in a
 * comment claiming a ribbon would cost "roughly 8x the vertices and a second
 * pass". Both halves were wrong at this scale: it is 392 vertices in the same
 * single draw call, and there is no second pass. The real problem with the line
 * version is that GPU line width is capped at 1px on every WebGL
 * implementation — so at DPR 2 the topology was drawn in half-CSS-pixel strokes
 * that shimmer under any camera motion and that no amount of MSAA can fix. The
 * links are the connective tissue of the composition and were its weakest
 * element.
 *
 * The bow is sampled from the SAME `point(t)` the packets ride, which is what
 * keeps the traffic visually attached to the path it travels along.
 */

/** Samples per link. Enough to make the bow read as a curve, few enough to be free. */
const SEGMENTS = 48;

/**
 * Ribbon half-width in world units.
 *
 * Deliberately at the low end of the usable range. `SpeedGauge` sits directly
 * in front of this scene, and additive blending with `depthWrite: false`
 * double-brightens wherever a bow crosses itself — worst on the two negatively
 * curved links. Evaluate any increase against the composited hero, never
 * against a screenshot of the canvas alone.
 */
const HALF_WIDTH = 0.012;

const VERTEX = /* glsl */ `
  attribute float aT;
  attribute float aSide;
  attribute float aOrder;
  attribute vec3  aTangent;

  uniform float uWidth;

  varying float vT;
  varying float vSide;
  varying float vOrder;
  varying float vViewZ;

  void main() {
    vT = aT;
    vSide = aSide;
    vOrder = aOrder;

    // Billboard in view space: transform the centreline point AND its tangent,
    // then offset perpendicular to the projected tangent. The ribbon therefore
    // always presents its full width to the camera at zero CPU cost.
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 mvTangent = normalize((modelViewMatrix * vec4(aTangent, 0.0)).xyz);
    vec2 perp = normalize(vec2(-mvTangent.y, mvTangent.x));

    // Taper to nothing at both nodes, so a connection reads as plugging into
    // the hop rather than stopping dead against it.
    float halfWidth = uWidth * sin(aT * 3.141592653589793);
    mv.xy += perp * aSide * halfWidth;

    vViewZ = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  precision mediump float;

  // Explicitly highp: a single shared accumulator runs for the whole session,
  // and at mediump (fp16 on real mobile GPUs) the band quantises once it grows.
  uniform highp float uTime;

  uniform float uFlow;
  uniform float uDirection;
  uniform float uIntensity;
  uniform float uFogDensity;
  uniform float uBirth;
  uniform float uStream;
  uniform float uKick;
  uniform vec3  uColorIdle;
  uniform vec3  uColorDown;
  uniform vec3  uColorUp;

  // Per-link verdict, as FOUR SCALARS rather than an array. These materials
  // compile as GLSL ES 1.00, and ESSL1 does not guarantee dynamic indexing of a
  // uniform array in a fragment shader — selecting with step() always compiles.
  // 0 = no verdict, 1 = ok, 2 = suspect.
  uniform float uFlag0;
  uniform float uFlag1;
  uniform float uFlag2;
  uniform float uFlag3;
  uniform vec3  uFlagOk;
  uniform vec3  uFlagSuspect;
  uniform vec3  uFlagUnknown;

  varying float vT;
  varying float vSide;
  varying float vOrder;
  varying float vViewZ;

  void main() {
    // ---- Birth: each link draws itself, one hop after the previous ---------
    // vOrder arrives as a varying because a fragment shader cannot read a
    // vertex attribute directly.
    float grow = clamp((uBirth - vOrder * 0.16) / 0.40, 0.0, 1.0);
    if (vT > grow) discard;

    float dir = abs(uDirection) < 0.5 ? 1.0 : uDirection;
    float speed = 0.09 + uFlow * 0.7;

    // Distance from this fragment to the travelling band, wrapped so the band
    // re-enters at the far end instead of jumping.
    float head = fract(uTime * speed * dir);
    float d = abs(fract(vT - head + 0.5) - 0.5);

    // Asymmetric falloff makes the band a comet rather than a blob: the
    // trailing side stretches, the leading edge stays sharp.
    float ahead = fract(vT - head + 0.5) - 0.5;
    float spread = ahead > 0.0 ? 0.30 : 0.13;
    float band = pow(1.0 - smoothstep(0.0, spread, d), 3.0);

    // Soft cross-section: a lit core fading at the ribbon edges, rather than a
    // flat strip with hard sides.
    float section = pow(1.0 - abs(vSide), 2.0);

    vec3 stream = mix(uColorDown, uColorUp, uStream);
    vec3 tinted = mix(uColorIdle, stream, clamp(uFlow * 1.5, 0.0, 1.0));

    // ---- Per-link verdict tint --------------------------------------------
    float flag = uFlag0;
    flag = mix(flag, uFlag1, step(0.5, vOrder));
    flag = mix(flag, uFlag2, step(1.5, vOrder));
    flag = mix(flag, uFlag3, step(2.5, vOrder));

    // Three states, not two. health.js genuinely returns ok / suspect /
    // unknown, and collapsing "we could not judge this" into "this is fine" is
    // the same dishonesty as inventing a measurement, wearing a nicer colour.
    vec3 verdict = uFlagOk;
    verdict = mix(verdict, uFlagSuspect, step(1.5, flag));
    verdict = mix(verdict, uFlagUnknown, step(2.5, flag));
    // step(0.5, flag) is 0 when there is no verdict at all, so an unflagged
    // link keeps the stream colour instead of being tinted green by default.
    tinted = mix(tinted, verdict, step(0.5, flag) * 0.55);

    // A dim resting line so the topology is legible before a test is ever run,
    // plus the band on top. Constants are down from their originals: sRGB
    // encoding below lifts exactly this range of dim values hardest.
    float base = 0.10 + uIntensity * 0.11;
    float alpha = (base + band * (0.26 + uIntensity * 0.48)) * section;

    // Multiply toward black, never mix toward a fog colour — see PacketField.
    float fog = exp(-uFogDensity * uFogDensity * vViewZ * vViewZ);

    vec3 lit = tinted * (0.5 + band * 1.15) * (1.0 + uKick * 1.1) * fog;

    gl_FragColor = vec4(lit, alpha * fog);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function LinkTrails({ nodes }: { nodes: TopologyNode[] }) {
  const { geometry, shader } = useMemo(() => {
    const lookup = nodeMap(nodes);

    const positions: number[] = [];
    const tangents: number[] = [];
    const sides: number[] = [];
    const ts: number[] = [];
    const orders: number[] = [];
    const indices: number[] = [];

    let order = 0;

    for (const link of LINKS) {
      const from = lookup.get(link.from);
      const to = lookup.get(link.to);
      if (!from || !to) continue;

      // Same bow the packets ride. Deriving the bend axis identically here is
      // what keeps the trail and the traffic on one path.
      const axis = new THREE.Vector3().subVectors(to.position, from.position).normalize();
      const bend = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 0, 1)).normalize();

      const point = (t: number) =>
        new THREE.Vector3()
          .lerpVectors(from.position, to.position, t)
          .addScaledVector(bend, Math.sin(t * Math.PI) * link.curve);

      const base = positions.length / 3;

      for (let i = 0; i <= SEGMENTS; i += 1) {
        const t = i / SEGMENTS;
        const p = point(t);

        // Numeric derivative, clamped inside [0,1] so the endpoints take a
        // one-sided difference rather than sampling off the curve.
        const h = 0.5 / SEGMENTS;
        const tangent = new THREE.Vector3()
          .subVectors(point(Math.min(1, t + h)), point(Math.max(0, t - h)))
          .normalize();

        // Two vertices per sample, one either side of the centreline.
        for (const side of [-1, 1]) {
          positions.push(p.x, p.y, p.z);
          tangents.push(tangent.x, tangent.y, tangent.z);
          sides.push(side);
          ts.push(t);
          orders.push(order);
        }
      }

      for (let i = 0; i < SEGMENTS; i += 1) {
        const a = base + i * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }

      order += 1;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("aTangent", new THREE.Float32BufferAttribute(tangents, 3));
    geo.setAttribute("aSide", new THREE.Float32BufferAttribute(sides, 1));
    geo.setAttribute("aT", new THREE.Float32BufferAttribute(ts, 1));
    geo.setAttribute("aOrder", new THREE.Float32BufferAttribute(orders, 1));
    geo.setIndex(indices);

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      // The ribbon is two-sided by construction; culling would drop half of it
      // wherever a bow turns away from the camera.
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uFlow: { value: 0 },
        uDirection: { value: 0 },
        uIntensity: { value: 0 },
        uFogDensity: { value: FOG_DENSITY },
        uWidth: { value: HALF_WIDTH },
        uBirth: { value: 0 },
        uStream: { value: 0 },
        uKick: { value: 0 },
        uColorIdle: { value: new THREE.Color("#4c51e0") },
        uColorDown: { value: new THREE.Color("#22d3ee") },
        uColorUp: { value: new THREE.Color("#a78bfa") },
        uFlag0: { value: 0 },
        uFlag1: { value: 0 },
        uFlag2: { value: 0 },
        uFlag3: { value: 0 },
        uFlagOk: { value: new THREE.Color("#34d399") },
        uFlagSuspect: { value: new THREE.Color("#fbbf24") },
        uFlagUnknown: { value: new THREE.Color("#64748b") },
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

    uniforms.uTime!.value = clock.t;
    uniforms.uBirth!.value = birth.t;
    uniforms.uStream!.value = beat.stream;
    uniforms.uKick!.value = beat.kick;

    const step = Math.min(delta, 0.05);
    const ease = 1 - Math.exp(-step / 0.3);

    uniforms.uFlow!.value += (drive.flow - uniforms.uFlow!.value) * ease;

    /* Idle floor: before any run `drive.intensity` is 0, which left the resting
       topology dimmer than something spending a WebGL context ought to look.
       The floor peaks at 0.22 while a live run sets 0.35 at its start and 0.45+
       during transfer, so it can never brighten a real reading. */
    const floor = 0.16 + 0.06 * Math.sin(clock.t * 0.21);
    const target = Math.max(drive.intensity, floor);
    uniforms.uIntensity!.value += (target - uniforms.uIntensity!.value) * ease;

    uniforms.uDirection!.value = drive.direction;

    /* Per-link verdict. In practice only the device→router link carries one:
       `bottleneck()` reports a `wifi` hop, and the wireless leg IS that link
       rather than any node, so a node-indexed array could not express the most
       common diagnosis the engine makes. */
    uniforms.uFlag0!.value = drive.linkFlags[0] ?? 0;
    uniforms.uFlag1!.value = drive.linkFlags[1] ?? 0;
    uniforms.uFlag2!.value = drive.linkFlags[2] ?? 0;
    uniforms.uFlag3!.value = drive.linkFlags[3] ?? 0;
  });

  return (
    <mesh frustumCulled={false} renderOrder={1}>
      <primitive object={geometry} attach="geometry" />
      <primitive object={shader} attach="material" />
    </mesh>
  );
}

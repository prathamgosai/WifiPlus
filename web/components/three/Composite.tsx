"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { drive } from "@/store/useTestStore";
import { quality, render } from "./quality";

/**
 * The HDR composite: scene, bloom, tone map, screen.
 * -----------------------------------------------------------------------------
 * Everything in this scene is additive. In an 8-bit framebuffer additive
 * blending has no headroom above 1.0, so a dense cluster of packets clips flat
 * to white — it is a FAKE bloom with the overrange thrown away. Rendering into
 * a half-float target keeps that energy, and a bloom chain over the overrange
 * is what makes an emissive scene read as LIGHT rather than as bright pixels.
 *
 * Hand-rolled rather than pulled from a library: `@react-three/postprocessing`
 * measured 87 KB gzipped on a clean A/B build because it hard-imports `n8ao`,
 * which declares no `sideEffects` and no subpath export and therefore cannot be
 * tree-shaken. This is ~10 KB and depends on nothing.
 *
 * ---- THE ALPHA ROUND-TRIP IS THE WHOLE RISK -------------------------------
 * The canvas is `alpha: true` with `setClearColor(..., 0)` SPECIFICALLY so the
 * page's aurora and grid read through the hero. Get the composite's output
 * alpha wrong and you do not get a worse hero — you get NO hero backdrop at
 * all, a black rectangle where the page used to show through.
 *
 * The plan for this work made a visual spike a hard gate: render to a target,
 * blit it straight back, confirm the aurora survives, and only then write a
 * line of bloom. That gate is a human looking at a screen, and this was written
 * without one. So the check is built into the code instead: the probe at the
 * end of the frame callback reads back a near-corner pixel a few frames after
 * mount and permanently disables the composite for the session if the page has
 * stopped showing through. It is weaker than a pair of eyes — one pixel, and it
 * cannot judge whether the result looks GOOD — but it turns the one failure
 * mode this pass could not rule out into something that fails safe.
 *
 * ---- MEASUREMENT RULE ------------------------------------------------------
 * The chain gets CHEAPER during a throughput phase, not richer. `core/measure.js`
 * times every window with `performance.now()` on the main thread this scene
 * shares, so the frames where the engine is sampling are the frames that must
 * cost least. That inverts the usual instinct and is also the better piece:
 * quiet and precise while it works, blooming on the result.
 */

/**
 * DPR ceiling for the scene target. MANDATORY, not advisory.
 *
 * RGBA16F at 2880x1800 with 4 MSAA samples is roughly 166 MB for the
 * multisample renderbuffer plus 41 MB for the resolve — enough to lose the
 * context outright on a mid-range GPU.
 */
const MAX_RT_DPR = 1.75;

/** Levels in the bloom chain at full quality. */
const BLOOM_LEVELS = 3;

/* ---------------------------------------------------------------------------
   Shaders
   ------------------------------------------------------------------------ */

/**
 * A fullscreen TRIANGLE, not a quad.
 *
 * A quad has a diagonal seam where its two triangles meet, along which the GPU
 * rasterises twice and derivatives are discontinuous. One oversized triangle
 * clipped to the viewport has neither problem and rasterises ~30% fewer
 * fragments.
 */
const TRIANGLE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** Soft-knee luminance threshold: only real highlights enter the bloom. */
const PREFILTER = /* glsl */ `
  precision mediump float;
  uniform sampler2D uScene;
  uniform float uThreshold;
  uniform float uKnee;
  varying vec2 vUv;

  void main() {
    vec3 c = texture2D(uScene, vUv).rgb;
    float l = max(c.r, max(c.g, c.b));

    // Quadratic knee, so a value just under the threshold ramps in rather than
    // switching on. A hard cutoff makes bloom pop as brightness crosses it.
    float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0 * uKnee);
    soft = soft * soft / (4.0 * uKnee + 0.0001);
    float contribution = max(soft, l - uThreshold) / max(l, 0.0001);

    gl_FragColor = vec4(c * contribution, 1.0);
  }
`;

/** Dual-filter Kawase downsample: 5 taps weighted 4/1/1/1/1. */
const DOWNSAMPLE = /* glsl */ `
  precision mediump float;
  uniform sampler2D uSource;
  uniform vec2 uTexel;
  varying vec2 vUv;

  void main() {
    vec4 sum = texture2D(uSource, vUv) * 4.0;
    sum += texture2D(uSource, vUv - uTexel);
    sum += texture2D(uSource, vUv + uTexel);
    sum += texture2D(uSource, vUv + vec2(uTexel.x, -uTexel.y));
    sum += texture2D(uSource, vUv - vec2(uTexel.x, -uTexel.y));
    gl_FragColor = sum / 8.0;
  }
`;

/** Dual-filter Kawase upsample: 8-tap tent. */
const UPSAMPLE = /* glsl */ `
  precision mediump float;
  uniform sampler2D uSource;
  uniform vec2 uTexel;
  varying vec2 vUv;

  void main() {
    vec4 sum = texture2D(uSource, vUv + vec2(-uTexel.x * 2.0, 0.0));
    sum += texture2D(uSource, vUv + vec2(-uTexel.x, uTexel.y)) * 2.0;
    sum += texture2D(uSource, vUv + vec2(0.0, uTexel.y * 2.0));
    sum += texture2D(uSource, vUv + vec2(uTexel.x, uTexel.y)) * 2.0;
    sum += texture2D(uSource, vUv + vec2(uTexel.x * 2.0, 0.0));
    sum += texture2D(uSource, vUv + vec2(uTexel.x, -uTexel.y)) * 2.0;
    sum += texture2D(uSource, vUv + vec2(0.0, -uTexel.y * 2.0));
    sum += texture2D(uSource, vUv + vec2(-uTexel.x, -uTexel.y)) * 2.0;
    gl_FragColor = sum / 12.0;
  }
`;

const COMPOSITE = /* glsl */ `
  precision mediump float;

  uniform sampler2D uScene;
  uniform sampler2D uBloom;
  uniform float uBloomStrength;
  uniform float uVignette;
  uniform float uGrain;
  varying vec2 vUv;

  /*
   * Khronos PBR Neutral, matching three's NeutralToneMapping.
   *
   * The SAME curve the renderer applies on the light tier, which is what keeps
   * the two tiers looking like one scene rather than two grades. ACES was the
   * alternative and desaturates saturated cyan hard toward white, which is most
   * of this palette.
   */
  vec3 neutralToneMap(vec3 color) {
    const float startCompression = 0.76;
    const float desaturation = 0.15;

    float x = min(color.r, min(color.g, color.b));
    float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
    color -= offset;

    float peak = max(color.r, max(color.g, color.b));
    if (peak < startCompression) return color;

    float d = 1.0 - startCompression;
    float newPeak = 1.0 - d * d / (peak + d - startCompression);
    color *= newPeak / peak;

    float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
    return mix(color, vec3(newPeak), g);
  }

  /** Exact sRGB transfer function, not a 2.2 gamma approximation. */
  vec3 toSRGB(vec3 c) {
    vec3 low = c * 12.92;
    vec3 high = 1.055 * pow(max(c, vec3(0.0)), vec3(0.4166666667)) - 0.055;
    return mix(low, high, step(vec3(0.0031308), c));
  }

  void main() {
    vec4 scene = texture2D(uScene, vUv);
    vec3 bloom = texture2D(uBloom, vUv).rgb;

    vec3 color = scene.rgb + bloom * uBloomStrength;

    color = neutralToneMap(color);
    color = toSRGB(color);

    // Vignette, applied after encoding so it reads as a lens rather than as a
    // change in exposure.
    float v = 1.0 - uVignette * pow(length(vUv - 0.5) * 1.42, 2.2);
    color *= clamp(v, 0.0, 1.0);

    /*
     * Interleaved-gradient dither. The dark background with its fog gradient
     * WILL band visibly on an 8-bit panel, and a sub-LSB dither is the standard
     * fix. Deliberately NOT the usual fract(sin(dot(..)) * 43758.5453) hash:
     * every shader here declares mediump, whose guaranteed range is only about
     * 2^14, so that constant overflows on a strict mobile GPU and degrades to a
     * fixed pattern. This form uses only small constants.
     */
    float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    color += (dither - 0.5) * uGrain;

    /*
     * ALPHA IS PASSED THROUGH FROM THE SCENE, NOT SET TO 1.
     *
     * This single line is why the page's aurora still shows through the hero.
     * Writing an opaque alpha here turns the canvas into a black rectangle over
     * the page background.
     */
    gl_FragColor = vec4(color, clamp(scene.a, 0.0, 1.0));
  }
`;

/* ---------------------------------------------------------------------------
   Component
   ------------------------------------------------------------------------ */

/** Set false by the alpha probe if the round-trip is broken on this device. */
let compositeSafe = true;

/**
 * The gate. Decides whether the pass below is mounted AT ALL.
 *
 * The split matters and is not stylistic. A `useFrame` subscriber with positive
 * priority suppresses fiber's automatic render for as long as it EXISTS — fiber
 * checks `!state.internal.priority`, not whether the callback drew anything. So
 * a single component that mounts the subscriber and early-returns when disabled
 * renders nothing at all: a black hero on exactly the devices the fallback was
 * written to protect. The subscriber has to unmount.
 */
export function Composite({ enabled }: { enabled: boolean }) {
  const gl = useThree((state) => state.gl);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [alive, setAlive] = useState(true);

  /* Half-float colour is the entire premise. Without it the honest move is to
     render direct to canvas, NOT to fall back to an 8-bit target — that pays
     every cost of the composite for none of the headroom. */
  useEffect(() => {
    const context = gl.getContext();
    const ok =
      typeof WebGL2RenderingContext !== "undefined" &&
      context instanceof WebGL2RenderingContext &&
      context.getExtension("EXT_color_buffer_half_float") !== null;
    setSupported(ok);
  }, [gl]);

  /* Context loss tears down to direct rendering rather than leaving a black
     hero for the rest of the session. */
  useEffect(() => {
    const canvas = gl.domElement;
    const onLost = () => setAlive(false);
    canvas.addEventListener("webglcontextlost", onLost);
    return () => canvas.removeEventListener("webglcontextlost", onLost);
  }, [gl]);

  const active = enabled && alive && compositeSafe && supported === true;

  /* Materials read this to choose their exposure. Cleared on unmount so a
     fallback never inherits HDR-scale emissive into an 8-bit buffer. */
  useEffect(() => {
    render.hdr = active;
    return () => {
      render.hdr = false;
    };
  }, [active]);

  if (!active) return null;
  return <CompositePass onUnsafe={() => setAlive(false)} />;
}

function CompositePass({ onUnsafe }: { onUnsafe: () => void }) {
  const { gl, scene, camera, size, viewport } = useThree();

  /* Rebuilt on size AND dpr change. Reading only `size` leaves the composite
     silently sampling a stale-resolution target after a monitor switch. */
  const dpr = Math.min(viewport.dpr, MAX_RT_DPR);
  const width = Math.max(1, Math.floor(size.width * dpr));
  const height = Math.max(1, Math.floor(size.height * dpr));

  const targets = useMemo(() => {
    const sceneTarget = new THREE.WebGLRenderTarget(width, height, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      colorSpace: THREE.LinearSRGBColorSpace,
      depthBuffer: true,
      stencilBuffer: false,
      // MSAA IS A PRECONDITION, not a follow-up. `antialias` on the Canvas
      // configures the DEFAULT framebuffer, which stops receiving geometry the
      // moment the scene renders into a target — so without this the scene
      // looks WORSE than doing nothing and the bloom gets blamed.
      samples: 4,
    });

    // Bloom levels get no MSAA: they only ever receive a fullscreen triangle.
    const chain: THREE.WebGLRenderTarget[] = [];
    for (let i = 0; i < BLOOM_LEVELS; i += 1) {
      const scale = 2 ** (i + 1);
      chain.push(
        new THREE.WebGLRenderTarget(
          Math.max(1, Math.floor(width / scale)),
          Math.max(1, Math.floor(height / scale)),
          {
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType,
            colorSpace: THREE.LinearSRGBColorSpace,
            depthBuffer: false,
            stencilBuffer: false,
          },
        ),
      );
    }

    return { sceneTarget, chain };
  }, [width, height]);

  useEffect(
    () => () => {
      targets.sceneTarget.dispose();
      targets.chain.forEach((target) => target.dispose());
    },
    [targets],
  );

  /* ---- Fullscreen pass rig --------------------------------------------- */
  const rig = useMemo(() => {
    // Oversized triangle in clip space, uv spanning 0..2 so the clipped region
    // covers exactly 0..1 of the screen.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));

    const make = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({
        vertexShader: TRIANGLE_VERTEX,
        fragmentShader,
        uniforms,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
        // Without this three injects its own tone mapping on top of the
        // hand-written one in COMPOSITE, and the image is graded twice.
        toneMapped: false,
      });

    const prefilter = make(PREFILTER, {
      uScene: { value: null },
      uThreshold: { value: 0.75 },
      uKnee: { value: 0.35 },
    });
    const down = make(DOWNSAMPLE, {
      uSource: { value: null },
      uTexel: { value: new THREE.Vector2() },
    });
    const up = make(UPSAMPLE, {
      uSource: { value: null },
      uTexel: { value: new THREE.Vector2() },
    });
    const composite = make(COMPOSITE, {
      uScene: { value: null },
      uBloom: { value: null },
      uBloomStrength: { value: 0.85 },
      uVignette: { value: 0.32 },
      uGrain: { value: 1 / 255 },
    });

    // Upsampling accumulates into the level above, so that one blends.
    up.blending = THREE.AdditiveBlending;

    const mesh = new THREE.Mesh(geometry, prefilter);
    mesh.frustumCulled = false;

    const passScene = new THREE.Scene();
    passScene.add(mesh);
    const passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    return { geometry, prefilter, down, up, composite, mesh, passScene, passCamera };
  }, []);

  useEffect(
    () => () => {
      rig.geometry.dispose();
      rig.prefilter.dispose();
      rig.down.dispose();
      rig.up.dispose();
      rig.composite.dispose();
    },
    [rig],
  );

  const frames = useRef(0);
  const probe = useMemo(() => new Uint8Array(4), []);

  /*
   * PRIORITY 1 TAKES OVER RENDERING.
   *
   * Verified in fiber: `if (!state.internal.priority && state.gl.render)
   * state.gl.render(...)`. Any positive-priority subscriber suppresses the
   * automatic render, so this callback owns the frame — which is also why this
   * component must not exist when the composite is disabled. Priority -1 (the
   * shared clock) does NOT suppress it, which is why that one can stay.
   */
  useFrame(() => {
    const { sceneTarget, chain } = targets;

    // ---- 1. Scene into the HDR target ------------------------------------
    gl.setRenderTarget(sceneTarget);
    gl.setClearColor(0x000000, 0);
    gl.clear(true, true, false);
    gl.render(scene, camera);

    /*
     * Cheaper while the engine is measuring. Skipping the top (largest) bloom
     * level is the single biggest saving in the chain, and it is least visible
     * exactly when the packets are moving fastest.
     */
    const measuring = drive.direction !== 0;
    const levels = Math.max(
      1,
      Math.min(chain.length, Math.round(BLOOM_LEVELS * quality.level) - (measuring ? 1 : 0)),
    );

    // ---- 2. Prefilter into the first bloom level -------------------------
    rig.mesh.material = rig.prefilter;
    rig.prefilter.uniforms.uScene!.value = sceneTarget.texture;
    gl.setRenderTarget(chain[0]!);
    gl.clear(true, false, false);
    gl.render(rig.passScene, rig.passCamera);

    // ---- 3. Downsample ---------------------------------------------------
    rig.mesh.material = rig.down;
    for (let i = 1; i < levels; i += 1) {
      const source = chain[i - 1]!;
      const target = chain[i]!;
      rig.down.uniforms.uSource!.value = source.texture;
      (rig.down.uniforms.uTexel!.value as THREE.Vector2).set(1 / source.width, 1 / source.height);
      gl.setRenderTarget(target);
      gl.clear(true, false, false);
      gl.render(rig.passScene, rig.passCamera);
    }

    // ---- 4. Upsample, accumulating back up the chain ---------------------
    rig.mesh.material = rig.up;
    for (let i = levels - 1; i > 0; i -= 1) {
      const source = chain[i]!;
      const target = chain[i - 1]!;
      rig.up.uniforms.uSource!.value = source.texture;
      (rig.up.uniforms.uTexel!.value as THREE.Vector2).set(1 / source.width, 1 / source.height);
      gl.setRenderTarget(target);
      // No clear: the upsample blends additively into what is already there.
      gl.render(rig.passScene, rig.passCamera);
    }

    // ---- 5. Composite to the canvas --------------------------------------
    rig.mesh.material = rig.composite;
    rig.composite.uniforms.uScene!.value = sceneTarget.texture;
    rig.composite.uniforms.uBloom!.value = chain[0]!.texture;
    // Grain off while measuring — cheapest thing to drop, least visible at speed.
    rig.composite.uniforms.uGrain!.value = measuring ? 0 : 1 / 255;

    gl.setRenderTarget(null);
    gl.clear(true, false, false);
    gl.render(rig.passScene, rig.passCamera);

    /* ---- 6. The probe --------------------------------------------------
       A few frames in, read back a near-corner pixel. The scene's content is
       centred and the backdrop plane falls off radially, so this should be
       very nearly transparent. If it comes back opaque, the alpha round-trip is
       broken on this device and the composite must stop — otherwise the page's
       aurora is replaced by a black rectangle.

       Once, not per frame: readPixels is a synchronous GPU stall. */
    frames.current += 1;
    if (frames.current === 24) {
      try {
        const context = gl.getContext();
        context.readPixels(2, 2, 1, 1, context.RGBA, context.UNSIGNED_BYTE, probe);
        if ((probe[3] ?? 0) > 240) {
          compositeSafe = false;
          onUnsafe();
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              "[WifiPlus] Composite disabled: the canvas alpha round-trip came back opaque, " +
                "which would hide the page background behind the hero.",
            );
          }
        }
      } catch {
        // readPixels can throw on a lost context. Not a reason to disable.
      }
    }
  }, 1);

  return null;
}

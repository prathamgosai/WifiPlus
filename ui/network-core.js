/**
 * The WifiPlus Network Core — the signature 3D instrument.
 * -----------------------------------------------------------------------------
 * A purpose-built WebGL scene: three tilted orbital rings around a luminous
 * core, and a field of data particles that flow along real 3D rays between the
 * outer shell and the centre.
 *
 * WHY NOT THREE.JS
 * This is one bespoke scene made of two point clouds and a billboard. Three.js
 * would add roughly 600 KB of transfer and a scene graph, matrix stack, material
 * system and raycaster this page never uses — on a SPEED TEST, where the first
 * paint is the product. The whole renderer below is about 12 KB, ships as a
 * lazily-imported module that never blocks the dial, and disposes cleanly.
 *
 * WHAT THE MOTION MEANS
 * The visualisation is driven by the run, not by a timer:
 *
 *   download   particles travel INWARD, speed scaled by measured throughput
 *   upload     particles travel OUTWARD
 *   latency    a single wave leaves the core and returns, once per probe
 *   unstable   per-particle speed is perturbed, so the flow visibly frays
 *   idle       a slow ambient drift
 *
 * It is a REPRESENTATION of the phase and its intensity. It is not packet-level
 * telemetry, and nothing in the interface claims that it is.
 *
 * BUDGET
 * Quality is chosen from the device, not assumed: particle count, pixel ratio
 * and frame rate all step down on mobile and low-power hardware, and the whole
 * loop stops when the canvas scrolls away or the tab is hidden.
 */

/** @typedef {"high" | "medium" | "lite" | "minimal"} Quality */

/**
 * Per-tier budget. Ring and shell counts move too, because the structure is
 * what costs on a tile-based mobile GPU: it is drawn every frame at full alpha,
 * where the flow particles are mostly transparent.
 */
const TIERS = {
  high: { particles: 1500, ring: 150, shell: 260, dpr: 2, fps: 60 },
  medium: { particles: 620, ring: 96, shell: 150, dpr: 1.5, fps: 45 },
  lite: { particles: 260, ring: 60, shell: 90, dpr: 1, fps: 30 },
  minimal: { particles: 180, ring: 60, shell: 90, dpr: 1, fps: 0 },
};

const MODE = { idle: 0, download: 1, upload: 2, latency: 3 };

const CAM_Z = 8.6;
const FOV = (34 * Math.PI) / 180;

const VERT_STRUCTURE = `
precision mediump float;
const float CAM_Z = 8.6;
attribute vec3 aPos;
attribute vec2 aMeta;      // x: size, y: seed
uniform mat4 uMVP;
uniform mat3 uModel;
uniform float uTime;
uniform float uPointScale;
uniform float uEnergy;
uniform float uAlphaScale;
varying float vAlpha;
void main() {
  vec3 p = uModel * aPos;
  // A slow breath so the structure is never perfectly static, plus a brighter
  // pass that sweeps the ring while a phase is running.
  float sweep = 0.5 + 0.5 * sin(aMeta.y * 6.2831853 - uTime * 1.6);
  vAlpha = (0.20 + 0.34 * sweep) * (0.5 + uEnergy * 0.85) * uAlphaScale;
  vec4 clip = uMVP * vec4(p, 1.0);
  gl_Position = clip;
  gl_PointSize = max(1.0, aMeta.x * uPointScale * (CAM_Z / max(clip.w, 0.001)));
}`;

const VERT_FLOW = `
precision mediump float;
const float CAM_Z = 8.6;
attribute vec3 aDir;
attribute vec3 aParam;     // x: speed, y: phase, z: size
uniform mat4 uMVP;
uniform mat3 uModel;
uniform float uTime;
uniform float uMode;
uniform float uIntensity;  // 0..1, scaled from the measured value
uniform float uNoise;      // 0..1, instability
uniform float uPulseAt;
uniform float uPointScale;
varying float vAlpha;
varying float vTone;
void main() {
  float jitter = fract(sin(aParam.y * 91.73) * 4375.85) - 0.5;
  float speed = aParam.x * (0.30 + uIntensity * 1.05) * (1.0 + uNoise * jitter * 1.7);
  float f = fract(aParam.y + uTime * speed);

  float t;
  if (uMode < 0.5)      { t = f; }
  else if (uMode < 1.5) { t = 1.0 - f; }
  else if (uMode < 2.5) { t = f; }
  else {
    float w = (uTime - uPulseAt) * 1.35 - aParam.y * 0.22;
    float local = clamp(w, 0.0, 2.0);
    t = local < 1.0 ? local : 2.0 - local;
    f = local < 1.0 ? local : 2.0 - local;
  }

  float r = mix(0.74, 2.45, t);
  vec3 p = uModel * (aDir * r);

  // Fade at both ends of the ray so particles arrive and leave instead of
  // popping, and burn brighter the closer they are to the core.
  float edge = smoothstep(0.0, 0.13, f) * smoothstep(1.0, 0.85, f);
  vAlpha = edge * (0.10 + uIntensity * 0.62);
  vTone = uMode > 1.5 && uMode < 2.5 ? 1.0 : 0.0;

  vec4 clip = uMVP * vec4(p, 1.0);
  gl_Position = clip;
  gl_PointSize = max(1.0, aParam.z * uPointScale * (0.55 + (1.0 - t) * 0.85) * (CAM_Z / max(clip.w, 0.001)));
}`;

const FRAG_POINT = `
precision mediump float;
uniform vec3 uColA;
uniform vec3 uColB;
varying float vAlpha;
varying float vTone;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float sq = dot(d, d);
  if (sq > 0.25) discard;
  float a = smoothstep(0.25, 0.0, sq);
  vec3 col = mix(uColA, uColB, vTone);
  float alpha = a * vAlpha;
  gl_FragColor = vec4(col * alpha, alpha);
}`;

const FRAG_STRUCTURE = `
precision mediump float;
uniform vec3 uColA;
varying float vAlpha;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float sq = dot(d, d);
  if (sq > 0.25) discard;
  float a = smoothstep(0.25, 0.0, sq);
  float alpha = a * vAlpha;
  gl_FragColor = vec4(uColA * alpha, alpha);
}`;

const VERT_GLOW = `
precision mediump float;
attribute vec2 aQuad;
uniform mat4 uMVP;
uniform float uSize;
varying vec2 vUv;
void main() {
  vUv = aQuad;
  gl_Position = uMVP * vec4(aQuad * uSize, 0.0, 1.0);
}`;

const FRAG_GLOW = `
precision mediump float;
uniform vec3 uColA;
uniform float uEnergy;
varying vec2 vUv;
void main() {
  float d = length(vUv);
  // Two falloffs: a tight hot centre and a wide halo. One alone reads as a
  // sticker; together they read as something emitting light.
  float core = smoothstep(0.30, 0.0, d);
  float halo = smoothstep(1.0, 0.0, d);
  float a = core * 0.34 + halo * halo * 0.15;
  a *= 0.45 + uEnergy * 0.8;
  gl_FragColor = vec4(uColA * a, a);
}`;

/* -------------------------------------------------------------------------- */
/* Matrix helpers. Only what this scene needs — a perspective, a translate and  */
/* three axis rotations. Everything else a matrix library would ship is dead    */
/* weight on a page whose whole point is being fast.                            */
/* -------------------------------------------------------------------------- */

/** @returns {Float32Array} */
function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (far + near) * nf,
    -1,
    0,
    0,
    2 * far * near * nf,
    0,
  ]);
}

/** In-place `out = a * b` for column-major 4x4. */
function mul4(out, a, b) {
  for (let c = 0; c < 4; c += 1) {
    const b0 = b[c * 4],
      b1 = b[c * 4 + 1],
      b2 = b[c * 4 + 2],
      b3 = b[c * 4 + 3];
    out[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

/** View matrix for a camera on +Z looking at the origin, with a screen offset. */
function view(out, x, y, z) {
  out.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1]);
  return out;
}

/** Rotation about X then Y, as a 3x3 (column-major) — enough for a tilted ring. */
function tilt(out, rx, ry) {
  const cx = Math.cos(rx),
    sx = Math.sin(rx);
  const cy = Math.cos(ry),
    sy = Math.sin(ry);
  // Ry * Rx
  out[0] = cy;
  out[1] = 0;
  out[2] = -sy;
  out[3] = sy * sx;
  out[4] = cx;
  out[5] = cy * sx;
  out[6] = sy * cx;
  out[7] = -sx;
  out[8] = cy * cx;
  return out;
}

const IDENTITY3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

/* -------------------------------------------------------------------------- */

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`shader: ${log}`);
  }
  return shader;
}

function link(gl, vertSrc, fragSrc) {
  const vert = compile(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
  const program = gl.createProgram();
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  // The shaders are owned by the program once linked; deleting the handles here
  // is what stops a re-created renderer leaking one pair per instantiation.
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`program: ${log}`);
  }
  return program;
}

/** #rrggbb or rgb() → normalised triple. */
function toRgb(value, fallback) {
  const text = String(value || "").trim();
  const hex = text.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const rgb = text.match(/^rgba?\(([^)]+)\)/i);
  if (rgb) {
    const parts = rgb[1].split(",").map((p) => parseFloat(p));
    if (parts.length >= 3) return [parts[0] / 255, parts[1] / 255, parts[2] / 255];
  }
  return fallback;
}

/**
 * Pick a budget from what the device actually is. Reduced motion wins outright:
 * a person who asked for less movement gets a single static frame, not a slower
 * animation.
 *
 * @returns {Quality}
 */
export function detectQuality() {
  if (typeof window === "undefined") return "minimal";
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return "minimal";

  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  const narrow = window.innerWidth < 700;
  const saveData = navigator.connection?.saveData === true;

  if (saveData || memory <= 2 || cores <= 2) return "lite";
  if (coarse || narrow || cores <= 4 || memory <= 4) return "medium";
  return "high";
}

/**
 * Build the Network Core.
 *
 * Returns null rather than throwing when WebGL is unavailable, so the caller can
 * fall back to the static field without a try/catch at every call site.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{ quality?: Quality }} [options]
 */
export function createNetworkCore(canvas, options = {}) {
  const quality = options.quality || detectQuality();
  const budget = TIERS[quality] || TIERS.medium;

  /** @type {WebGLRenderingContext | null} */
  const gl = /** @type {any} */ (
    canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: quality === "high" ? "high-performance" : "low-power",
      failIfMajorPerformanceCaveat: false,
    }) || canvas.getContext("experimental-webgl")
  );
  if (!gl) return null;

  let progStructure, progFlow, progGlow;
  try {
    progStructure = link(gl, VERT_STRUCTURE, FRAG_STRUCTURE);
    progFlow = link(gl, VERT_FLOW, FRAG_POINT);
    progGlow = link(gl, VERT_GLOW, FRAG_GLOW);
  } catch {
    return null;
  }

  /* ---- Geometry -------------------------------------------------------- */
  // Three rings and a shell, all in one buffer, drawn as four ranges so each can
  // carry its own model rotation without a uniform array lookup.
  const ringCount = budget.ring;
  const shellCount = budget.shell;
  const structureTotal = ringCount * 3 + shellCount;
  const sPos = new Float32Array(structureTotal * 3);
  const sMeta = new Float32Array(structureTotal * 2);

  const RING_RADII = [1.02, 1.26, 1.52];
  let w = 0;
  for (let r = 0; r < 3; r += 1) {
    const radius = RING_RADII[r];
    for (let i = 0; i < ringCount; i += 1) {
      const a = (i / ringCount) * Math.PI * 2;
      sPos[w * 3] = Math.cos(a) * radius;
      sPos[w * 3 + 1] = 0;
      sPos[w * 3 + 2] = Math.sin(a) * radius;
      sMeta[w * 2] = i % 10 === 0 ? 3.6 : 2.0;
      sMeta[w * 2 + 1] = i / ringCount;
      w += 1;
    }
  }
  // Fibonacci sphere for the core shell: evenly distributed without the pole
  // clustering a naive lat/long loop produces.
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < shellCount; i += 1) {
    const y = 1 - (i / Math.max(1, shellCount - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y)) * 0.6;
    const a = golden * i;
    sPos[w * 3] = Math.cos(a) * radius;
    sPos[w * 3 + 1] = y * 0.6;
    sPos[w * 3 + 2] = Math.sin(a) * radius;
    sMeta[w * 2] = 1.9;
    sMeta[w * 2 + 1] = i / shellCount;
    w += 1;
  }

  const particleCount = budget.particles;
  const fDir = new Float32Array(particleCount * 3);
  const fParam = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i += 1) {
    // Uniform on the sphere, so the flow is not denser at the poles.
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    fDir[i * 3] = s * Math.cos(theta);
    fDir[i * 3 + 1] = u;
    fDir[i * 3 + 2] = s * Math.sin(theta);
    fParam[i * 3] = 0.14 + Math.random() * 0.26;
    fParam[i * 3 + 1] = Math.random();
    fParam[i * 3 + 2] = 1.4 + Math.random() * 2.2;
  }

  const buffers = {
    sPos: gl.createBuffer(),
    sMeta: gl.createBuffer(),
    fDir: gl.createBuffer(),
    fParam: gl.createBuffer(),
    quad: gl.createBuffer(),
  };
  const upload = (buffer, data) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  };
  upload(buffers.sPos, sPos);
  upload(buffers.sMeta, sMeta);
  upload(buffers.fDir, fDir);
  upload(buffers.fParam, fParam);
  upload(buffers.quad, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]));

  const loc = {
    structure: {
      aPos: gl.getAttribLocation(progStructure, "aPos"),
      aMeta: gl.getAttribLocation(progStructure, "aMeta"),
      uMVP: gl.getUniformLocation(progStructure, "uMVP"),
      uModel: gl.getUniformLocation(progStructure, "uModel"),
      uTime: gl.getUniformLocation(progStructure, "uTime"),
      uPointScale: gl.getUniformLocation(progStructure, "uPointScale"),
      uEnergy: gl.getUniformLocation(progStructure, "uEnergy"),
      uAlphaScale: gl.getUniformLocation(progStructure, "uAlphaScale"),
      uColA: gl.getUniformLocation(progStructure, "uColA"),
    },
    flow: {
      aDir: gl.getAttribLocation(progFlow, "aDir"),
      aParam: gl.getAttribLocation(progFlow, "aParam"),
      uMVP: gl.getUniformLocation(progFlow, "uMVP"),
      uModel: gl.getUniformLocation(progFlow, "uModel"),
      uTime: gl.getUniformLocation(progFlow, "uTime"),
      uMode: gl.getUniformLocation(progFlow, "uMode"),
      uIntensity: gl.getUniformLocation(progFlow, "uIntensity"),
      uNoise: gl.getUniformLocation(progFlow, "uNoise"),
      uPulseAt: gl.getUniformLocation(progFlow, "uPulseAt"),
      uPointScale: gl.getUniformLocation(progFlow, "uPointScale"),
      uColA: gl.getUniformLocation(progFlow, "uColA"),
      uColB: gl.getUniformLocation(progFlow, "uColB"),
    },
    glow: {
      aQuad: gl.getAttribLocation(progGlow, "aQuad"),
      uMVP: gl.getUniformLocation(progGlow, "uMVP"),
      uSize: gl.getUniformLocation(progGlow, "uSize"),
      uEnergy: gl.getUniformLocation(progGlow, "uEnergy"),
      uColA: gl.getUniformLocation(progGlow, "uColA"),
    },
  };

  /* ---- State ------------------------------------------------------------ */
  const proj = new Float32Array(16);
  const viewM = new Float32Array(16);
  const mvp = new Float32Array(16);
  const ringM = [new Float32Array(9), new Float32Array(9), new Float32Array(9)];
  const shellM = new Float32Array(9);

  let width = 1;
  let height = 1;
  let dpr = 1;
  // Half the world-space extent visible at z=0, so a focus point given in
  // normalised device coordinates can be turned into a camera offset.
  let halfViewH = 1;
  let halfViewW = 1;
  let running = false;
  let frame = null;
  let disposed = false;
  let startedAt = 0;
  let lastDraw = 0;
  let focusX = 0;
  let focusY = 0;
  let parallaxX = 0;
  let parallaxY = 0;
  let targetParallaxX = 0;
  let targetParallaxY = 0;

  /**
   * While true, the scene yields to the measurement: a low fixed cadence and a
   * fraction of the particle field. It stays ALIVE — the phase colour, the flow
   * direction and the pulses all still read — because a frozen instrument during
   * the one moment it is describing would be worse UX than a slower one. It just
   * stops competing for the CPU and GPU the transfer is using.
   *
   * MEASURED, NOT ASSUMED. Running the real engine with the scene drawing and
   * with it stopped, alternating the order within each pair so that a warm-up
   * trend cancels instead of masquerading as an effect:
   *
   *     pair 1  scene on 58.67  off 74.32   -21.1%
   *     pair 2  scene on 12.77  off 67.57   -81.1%
   *     pair 3  scene on 41.58  off 61.01   -31.9%
   *     pair 4  scene on 62.72  off 62.00    +1.2%
   *                                  mean   -33.2%
   *
   * A third of the reported throughput, spent on decoration. The main thread
   * showed the same contention from the other side: 30fps available during a
   * measured download.
   *
   * The identical experiment with this mode on:
   *
   *     pair 1  scene on 79.07  off 61.28   +29.0%
   *     pair 2  scene on 76.80  off 78.94    -2.7%
   *     pair 3  scene on 68.98  off 81.40   -15.3%
   *     pair 4  scene on 77.55  off 73.43    +5.6%
   *                                  mean    +4.2%
   *
   * Scattered around zero in both directions, which is what no effect looks
   * like on a link this noisy, and no pair anywhere near the -81% or -32%
   * seen before. The main thread recovered to 57fps.
   *
   * These runs were on software-rendered WebGL, which exaggerates the cost.
   * That is not a reason to discount them: software rendering is exactly what
   * a weak mobile GPU or a locked-down desktop falls back to, and those are
   * the users least able to afford the error.
   */
  let measurementMode = false;

  const state = {
    mode: MODE.idle,
    intensity: 0.16,
    targetIntensity: 0.16,
    noise: 0,
    targetNoise: 0,
    energy: 0.15,
    targetEnergy: 0.15,
    pulseAt: -99,
  };

  let colBrand = [0.18, 0.9, 0.96];
  let colUp = [0.55, 0.55, 1];
  // Additive blending can only ever brighten, so on a light background the whole
  // scene disappears. The light theme composites source-over with the theme's
  // own darker inks instead, which is the same scene reading as ink on paper
  // rather than light in a dark room.
  let lightMode = false;

  function readTokens() {
    if (typeof getComputedStyle === "undefined") return;
    const css = getComputedStyle(document.documentElement);
    colBrand = toRgb(css.getPropertyValue("--brand"), colBrand);
    colUp = toRgb(css.getPropertyValue("--up"), colUp);
    const scheme = (css.getPropertyValue("color-scheme") || "").trim();
    lightMode = scheme.includes("light") || document.documentElement.dataset.theme === "light";
  }
  readTokens();

  const minFrameMs = budget.fps > 0 ? 1000 / budget.fps - 1 : 0;

  /**
   * Cadence while a throughput phase is running. Twelve frames a second is
   * still unmistakably motion — the eye reads a flowing field fine at this rate
   * — and it is a fifth of the work of sixty.
   */
  const MEASURE_FPS = 12;
  const measureFrameMs = 1000 / MEASURE_FPS - 1;

  /** Share of the particle field drawn while measuring. */
  const MEASURE_PARTICLE_SHARE = 0.3;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, budget.dpr);
    const nextW = Math.max(1, Math.round(cssW * dpr));
    const nextH = Math.max(1, Math.round(cssH * dpr));
    if (nextW === width && nextH === height) return;
    width = nextW;
    height = nextH;
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
    // 34° vertical field: enough perspective for the rings to read as tilted
    // circles rather than ellipses, without the fisheye of a wider lens.
    const aspect = cssW / cssH;
    perspectiveInto(proj, FOV, aspect, 0.1, 60);
    halfViewH = CAM_Z * Math.tan(FOV / 2);
    halfViewW = halfViewH * aspect;
    if (!running) draw(performance.now());
  }

  function perspectiveInto(out, fovY, aspect, near, far) {
    const p = perspective(fovY, aspect, near, far);
    out.set(p);
    return out;
  }

  /**
   * Where the core sits, in normalised device coordinates. The instrument is
   * not at the centre of the hero, so the scene is offset to sit behind it.
   *
   * @param {number} x -1..1
   * @param {number} y -1..1
   */
  function setFocus(x, y) {
    focusX = x;
    focusY = y;
  }

  function draw(now) {
    if (disposed) return;
    if (!startedAt) startedAt = now;
    const time = (now - startedAt) / 1000;

    // Ease every driven value rather than snapping: a dial that jumps from idle
    // to full flow the instant a phase starts reads as a glitch, not a state.
    state.intensity += (state.targetIntensity - state.intensity) * 0.06;
    state.noise += (state.targetNoise - state.noise) * 0.05;
    state.energy += (state.targetEnergy - state.energy) * 0.05;
    parallaxX += (targetParallaxX - parallaxX) * 0.05;
    parallaxY += (targetParallaxY - parallaxY) * 0.05;

    view(viewM, focusX * halfViewW + parallaxX, focusY * halfViewH + parallaxY, CAM_Z);
    mul4(mvp, proj, viewM);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    // Both branches expect PREMULTIPLIED colour out of the fragment shaders.
    gl.blendFunc(gl.ONE, lightMode ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE);

    // Attribute sizes are authored in CSS pixels at the reference camera
    // distance; the shader scales them by CAM_Z / w for depth. Multiplying by
    // the device ratio here is what keeps a dot the same physical size on a
    // retina panel instead of half of one.
    const pointScale = dpr;

    // ---- Core glow -------------------------------------------------------
    if (!lightMode) {
      gl.useProgram(progGlow);
      gl.uniformMatrix4fv(loc.glow.uMVP, false, mvp);
      gl.uniform1f(loc.glow.uSize, 2.4);
      gl.uniform1f(loc.glow.uEnergy, state.energy);
      gl.uniform3fv(loc.glow.uColA, colBrand);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.quad);
      gl.enableVertexAttribArray(loc.glow.aQuad);
      gl.vertexAttribPointer(loc.glow.aQuad, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disableVertexAttribArray(loc.glow.aQuad);
    }

    // ---- Structure -------------------------------------------------------
    gl.useProgram(progStructure);
    gl.uniformMatrix4fv(loc.structure.uMVP, false, mvp);
    gl.uniform1f(loc.structure.uTime, time);
    gl.uniform1f(loc.structure.uPointScale, pointScale);
    gl.uniform1f(loc.structure.uEnergy, state.energy);
    gl.uniform3fv(loc.structure.uColA, colBrand);
    const inkBoost = lightMode ? 1.5 : 1;

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.sPos);
    gl.enableVertexAttribArray(loc.structure.aPos);
    gl.vertexAttribPointer(loc.structure.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.sMeta);
    gl.enableVertexAttribArray(loc.structure.aMeta);
    gl.vertexAttribPointer(loc.structure.aMeta, 2, gl.FLOAT, false, 0, 0);

    const spin = time * (0.09 + state.energy * 0.16);
    tilt(ringM[0], 1.32, spin);
    tilt(ringM[1], 0.62, -spin * 0.72 + 1.1);
    tilt(ringM[2], 1.94, spin * 0.46 + 2.2);
    tilt(shellM, spin * 0.3, spin * 0.5);

    gl.uniform1f(loc.structure.uAlphaScale, 0.85 * inkBoost);
    for (let r = 0; r < 3; r += 1) {
      gl.uniformMatrix3fv(loc.structure.uModel, false, ringM[r]);
      gl.drawArrays(gl.LINE_LOOP, r * ringCount, ringCount);
    }
    gl.uniform1f(loc.structure.uAlphaScale, 1.0 * inkBoost);
    for (let r = 0; r < 3; r += 1) {
      gl.uniformMatrix3fv(loc.structure.uModel, false, ringM[r]);
      gl.drawArrays(gl.POINTS, r * ringCount, ringCount);
    }
    gl.uniformMatrix3fv(loc.structure.uModel, false, shellM);
    gl.uniform1f(loc.structure.uAlphaScale, 0.7 * inkBoost);
    gl.drawArrays(gl.POINTS, ringCount * 3, shellCount);

    gl.disableVertexAttribArray(loc.structure.aPos);
    gl.disableVertexAttribArray(loc.structure.aMeta);

    // ---- Flow ------------------------------------------------------------
    gl.useProgram(progFlow);
    gl.uniformMatrix4fv(loc.flow.uMVP, false, mvp);
    gl.uniformMatrix3fv(loc.flow.uModel, false, IDENTITY3);
    gl.uniform1f(loc.flow.uTime, time);
    gl.uniform1f(loc.flow.uMode, state.mode);
    gl.uniform1f(loc.flow.uIntensity, state.intensity);
    gl.uniform1f(loc.flow.uNoise, state.noise);
    gl.uniform1f(loc.flow.uPulseAt, state.pulseAt);
    gl.uniform1f(loc.flow.uPointScale, pointScale);
    gl.uniform3fv(loc.flow.uColA, colBrand);
    gl.uniform3fv(loc.flow.uColB, colUp);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.fDir);
    gl.enableVertexAttribArray(loc.flow.aDir);
    gl.vertexAttribPointer(loc.flow.aDir, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.fParam);
    gl.enableVertexAttribArray(loc.flow.aParam);
    gl.vertexAttribPointer(loc.flow.aParam, 3, gl.FLOAT, false, 0, 0);
    const drawn = measurementMode
      ? Math.max(60, Math.floor(particleCount * MEASURE_PARTICLE_SHARE))
      : particleCount;
    gl.drawArrays(gl.POINTS, 0, drawn);
    gl.disableVertexAttribArray(loc.flow.aDir);
    gl.disableVertexAttribArray(loc.flow.aParam);
  }

  function loop(now) {
    if (!running || disposed) return;
    frame = requestAnimationFrame(loop);
    // Frame budget below 60 Hz on the lower tiers: a phone rendering this while
    // its radio is saturated should spend its thermal envelope on the test.
    const budgetMs = measurementMode ? Math.max(minFrameMs, measureFrameMs) : minFrameMs;
    if (budgetMs && now - lastDraw < budgetMs) return;
    lastDraw = now;
    draw(now);
  }

  function start() {
    if (disposed || running) return;
    if (budget.fps === 0) {
      // Reduced motion: one frame, no loop, ever.
      draw(performance.now());
      return;
    }
    running = true;
    lastDraw = 0;
    frame = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
  }

  /**
   * Drive the scene from the run.
   *
   * @param {"idle" | "download" | "upload" | "latency"} phase
   * @param {{ intensity?: number, noise?: number }} [opts] intensity 0..1
   */
  function setPhase(phase, opts = {}) {
    state.mode = MODE[phase] ?? MODE.idle;
    if (typeof opts.intensity === "number") state.targetIntensity = Math.max(0, Math.min(1, opts.intensity));
    if (typeof opts.noise === "number") state.targetNoise = Math.max(0, Math.min(1, opts.noise));
    state.targetEnergy = phase === "idle" ? 0.15 : 0.85;
    if (budget.fps === 0) draw(performance.now());
  }

  /** @param {number} value 0..1 */
  function setIntensity(value) {
    state.targetIntensity = Math.max(0, Math.min(1, value));
  }

  /** @param {number} value 0..1 — how irregular the flow should look. */
  function setNoise(value) {
    state.targetNoise = Math.max(0, Math.min(1, value));
  }

  /** Fire one out-and-back wave. Called per latency probe. */
  function pulse() {
    if (!startedAt) return;
    state.pulseAt = (performance.now() - startedAt) / 1000;
  }

  /** @param {number} x -1..1 @param {number} y -1..1 */
  function setParallax(x, y) {
    targetParallaxX = x * 0.16;
    targetParallaxY = -y * 0.12;
  }

  /**
   * Yield to the measurement, or stop yielding.
   *
   * @param {boolean} on
   */
  function setMeasurementPriority(on) {
    measurementMode = Boolean(on);
  }

  function refreshTheme() {
    readTokens();
    if (!running) draw(performance.now());
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stop();
    Object.values(buffers).forEach((buffer) => gl.deleteBuffer(buffer));
    gl.deleteProgram(progStructure);
    gl.deleteProgram(progFlow);
    gl.deleteProgram(progGlow);
    // Without this the driver keeps the whole context alive until GC decides
    // otherwise, which on a phone means a second context on the next navigation.
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
  }

  resize();

  return {
    quality,
    particleCount,
    resize,
    start,
    stop,
    setPhase,
    setIntensity,
    setNoise,
    setFocus,
    setParallax,
    setMeasurementPriority,
    pulse,
    refreshTheme,
    dispose,
    get running() {
      return running;
    },
  };
}

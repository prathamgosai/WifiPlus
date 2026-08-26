/**
 * Render-tier detection.
 * -----------------------------------------------------------------------------
 * The 3D scene is the most expensive thing this site can draw, and it is drawn
 * behind the one control the page exists for. Deciding what to render is
 * therefore a product decision, not a graphics one: the speed test must start
 * instantly on a five-year-old phone, and a scene that costs that phone its
 * frame budget has made the product worse in exchange for looking better.
 *
 * Three tiers, decided once on the client and never re-evaluated mid-session
 * (a tier that changed under the user would restart the scene):
 *
 *   full   discrete-ish GPU, WebGL2, desktop pointer, motion allowed.
 *          The full instanced particle field.
 *   light  WebGL2 but a mobile/low-core device, or Save-Data.
 *          Same scene, far fewer particles, no post effects, capped DPR.
 *   none   no WebGL, reduced-motion, or a GPU we could not qualify.
 *          Falls back to the existing 2D `NetworkCanvas`, which is already
 *          shipped, already accessible and costs nothing extra to keep.
 *
 * Everything here is a capability check. None of it is a claim about the user's
 * connection — the network is measured, not sniffed.
 */

export type RenderTier = "full" | "light" | "none";

export interface Capability {
  tier: RenderTier;
  /** Device-pixel-ratio ceiling. Above 2 the fill cost squares for no visible gain. */
  dpr: [number, number];
  /** How many packet instances the scene may allocate. */
  packets: number;
  /** Reason the tier was chosen, surfaced in the scene's title attribute for support. */
  reason: string;
}

const OFF: Capability = { tier: "none", dpr: [1, 1], packets: 0, reason: "reduced motion or no WebGL2" };

/**
 * Probes WebGL2 with a throwaway context, then discards it.
 *
 * The context is explicitly released via `WEBGL_lose_context`: browsers cap
 * live WebGL contexts (Chrome at 16), and a probe that leaks one costs the real
 * canvas its slot on a page that later mounts the scene.
 */
function probeWebgl2(): { ok: boolean; renderer: string } {
  if (typeof document === "undefined") return { ok: false, renderer: "" };

  let canvas: HTMLCanvasElement | null = null;
  try {
    canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    if (!gl) return { ok: false, renderer: "" };

    // UNMASKED_RENDERER_WEBGL is gated behind an extension and is increasingly
    // reported as a generic string for fingerprinting reasons. It is treated as
    // a hint only — never as the sole basis for a decision.
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) ?? "") : "";

    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return { ok: true, renderer };
  } catch {
    return { ok: false, renderer: "" };
  } finally {
    canvas?.remove();
  }
}

/** Software rasterisers report themselves. They can run the scene at ~5fps. */
const SOFTWARE = /swiftshader|llvmpipe|software|microsoft basic render/i;

/**
 * Decide the tier for this device. Client-only — calling it during SSR returns
 * `none`, which is also the correct first paint: the server has no GPU to
 * describe and the fallback is what should be in the HTML.
 */
export function detectCapability(): Capability {
  if (typeof window === "undefined") return OFF;

  // Someone who has asked the OS to reduce motion has asked for this exact
  // thing not to happen. No tier below is worth overriding that.
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return { ...OFF, reason: "prefers-reduced-motion" };
  }

  const { ok, renderer } = probeWebgl2();
  if (!ok) return { ...OFF, reason: "no WebGL2" };
  if (SOFTWARE.test(renderer)) return { ...OFF, reason: `software renderer (${renderer})` };

  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };

  // Save-Data is a request to spend less of the user's allowance. The scene is
  // already in the bundle by the time this runs, but the GPU work and the extra
  // battery are still ours to decline.
  if (nav.connection?.saveData) {
    return { tier: "light", dpr: [1, 1.5], packets: 240, reason: "Save-Data requested" };
  }

  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 4;
  // `pointer: coarse` is a far better proxy for "phone" than a UA string, and
  // it degrades correctly on tablets and touch laptops.
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const small = window.matchMedia?.("(max-width: 900px)").matches ?? false;

  if (coarse || small || cores <= 4 || memory <= 4) {
    return { tier: "light", dpr: [1, 1.5], packets: 320, reason: `light tier (${cores} cores, ${memory}GB)` };
  }

  return { tier: "full", dpr: [1, 2], packets: 900, reason: `full tier (${cores} cores, ${memory}GB)` };
}

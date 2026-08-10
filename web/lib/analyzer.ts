import type { AnalyzerResponse, DoctorCategory } from "@/types";
import { site } from "./site";

/**
 * AI router-screenshot analysis.
 * -----------------------------------------------------------------------------
 * The image goes to our own Cloudflare Worker, which holds the Anthropic API
 * key. The key is never in this bundle — anything shipped to the browser is
 * public. See ../../worker/src/index.js.
 */

/** The `accept` attribute is a picker hint, not a guarantee. Re-check here. */
export const ALLOWED_UPLOAD_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * Router admin pages are dense text; downscaling too far makes the mode and
 * channel unreadable. 2000px is within what the model accepts at full fidelity.
 */
const MAX_ANALYSIS_EDGE = 2000;

export const DOCTOR_DEFAULTS: Record<DoctorCategory, string> = {
  security: "Enable WPA3 if available. Disable WPS and use a strong unique password.",
  channels: "Use channels 1, 6, or 11 on 2.4 GHz. Prefer 5 GHz or 6 GHz near the router.",
  placement: "Keep the router central, elevated, and away from thick walls or metal cabinets.",
  performance: "Separate smart home devices from high-speed devices and keep firmware updated.",
};

export const DOCTOR_LABELS: Record<DoctorCategory, string> = {
  security: "Security",
  channels: "Channels",
  placement: "Placement",
  performance: "Performance",
};

export function validateUpload(file: File): string | null {
  if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
    return "Unsupported file. Upload a PNG, JPEG, or WebP screenshot.";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return "Screenshot is too large. Upload an image under 8 MB.";
  }
  return null;
}

/**
 * Draw to a canvas so the upload is re-encoded and downscaled: smaller payloads,
 * and EXIF metadata (which can carry GPS coordinates) is dropped in the process.
 */
function toAnalysisPayload(file: File): Promise<{ media_type: string; data: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_ANALYSIS_EDGE / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas is unavailable in this browser."));
        return;
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/webp", 0.9);
      resolve({ media_type: "image/webp", data: dataUrl.split(",")[1] ?? "" });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image could not be decoded."));
    };
    image.src = url;
  });
}

export async function analyseRouterScreenshot(file: File): Promise<AnalyzerResponse> {
  const payload = await toAnalysisPayload(file);
  const response = await fetch(site.analyzerEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const { error } = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(error || "Analysis failed.");
  }
  return (await response.json()) as AnalyzerResponse;
}

/**
 * Fold findings into per-category copy. Every category resets to its
 * finding-free default so a clean config reads as clean, rather than leaving
 * the previous upload's warning on screen.
 */
export function foldFindings(result: AnalyzerResponse): Record<DoctorCategory, string> {
  const out = { ...DOCTOR_DEFAULTS };
  if (!result.is_router_screenshot) return out;

  const grouped: Record<DoctorCategory, string[]> = {
    security: [],
    channels: [],
    placement: [],
    performance: [],
  };
  for (const finding of result.findings ?? []) {
    if (grouped[finding.category]) grouped[finding.category].push(`${finding.title}: ${finding.detail}`);
  }
  for (const key of Object.keys(grouped) as DoctorCategory[]) {
    const found = grouped[key];
    if (found.length) out[key] = found.join(" ");
  }
  return out;
}

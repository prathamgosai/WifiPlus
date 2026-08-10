import type { QualityScores, SpeedResult } from "@/types";
import { site } from "./site";

/**
 * Renders a 1080×1080 shareable result card on an offscreen canvas and triggers
 * a download. Redrawn for the Liquid Glass palette — deep ink background, a
 * purple→cyan bar, and four translucent metric tiles.
 */
export function downloadResultCard(result: SpeedResult, scores: QualityScores | null): void {
  // Upload is deliberately NOT required. It is null when the uplink was too slow
  // to complete a chunk in the window, and requiring it made the enabled
  // "Result card" button do nothing at all on exactly those runs — the button is
  // enabled on `download !== null`, so the two conditions disagreed.
  if (result.download === null || result.ping === null) return;

  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Background: deep ink with a brand bloom in the top-left, matching the site.
  ctx.fillStyle = "#080b16";
  ctx.fillRect(0, 0, 1080, 1080);

  const bloom = ctx.createRadialGradient(180, 120, 0, 180, 120, 900);
  bloom.addColorStop(0, "rgba(91,95,240,0.36)");
  bloom.addColorStop(0.55, "rgba(34,211,238,0.10)");
  bloom.addColorStop(1, "rgba(5,8,22,0)");
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, 1080, 1080);

  // Brand bar
  const bar = ctx.createLinearGradient(0, 0, 1080, 0);
  bar.addColorStop(0, "#8b5cf6");
  bar.addColorStop(0.5, "#5b5ff0");
  bar.addColorStop(1, "#22d3ee");
  ctx.fillStyle = bar;
  ctx.fillRect(0, 0, 1080, 14);

  const display = '900 64px "SF Pro Display", Manrope, Inter, Segoe UI, sans-serif';
  const body = '600 28px Inter, "Segoe UI", sans-serif';

  ctx.fillStyle = "#ffffff";
  ctx.font = display;
  ctx.fillText("WifiPlus Result", 74, 138);

  ctx.font = body;
  ctx.fillStyle = "rgba(255,255,255,0.62)";
  ctx.fillText("Real browser-measured internet performance", 74, 186);

  const tiles: Array<[label: string, value: string, accent: string]> = [
    ["Download", `${result.download.toFixed(1)} Mbps`, "#22d3ee"],
    // A card is a durable artefact people post publicly, so a metric that was
    // never measured says so rather than showing a number it never had.
    ["Upload", result.upload === null ? "Not measurable" : `${result.upload.toFixed(1)} Mbps`, "#818cf8"],
    ["Ping", `${result.ping} ms`, "#c4b5fd"],
    ["WiFi Health", scores ? `${scores.health}/100` : "—", "#34d399"],
  ];

  tiles.forEach(([label, value, accent], index) => {
    const x = index % 2 === 0 ? 74 : 558;
    const y = index < 2 ? 300 : 566;

    roundRect(ctx, x, y, 448, 226, 28);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = accent;
    ctx.font = '800 26px Inter, "Segoe UI", sans-serif';
    ctx.fillText(label.toUpperCase(), x + 36, y + 62);

    ctx.fillStyle = "#ffffff";
    ctx.font = '900 58px "SF Pro Display", Manrope, Inter, sans-serif';
    ctx.fillText(value, x + 36, y + 146);
  });

  // Secondary readings, so the card carries the full diagnosis.
  ctx.fillStyle = "rgba(255,255,255,0.58)";
  ctx.font = '600 26px Inter, "Segoe UI", sans-serif';
  const secondary = [
    `Jitter ${result.jitter ?? "—"} ms`,
    `Loss ${result.loss ?? "—"}%`,
    `DNS ${result.dns ?? "—"} ms`,
    `Stability ${result.stability ?? "—"}%`,
  ].join("   ·   ");
  ctx.fillText(secondary, 74, 872);

  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillText("Speed test · WiFi analyzer · ISP comparison", 74, 928);

  ctx.fillStyle = "#22d3ee";
  ctx.font = '800 30px Inter, "Segoe UI", sans-serif';
  ctx.fillText(site.url.replace(/^https?:\/\//, ""), 74, 984);

  const link = document.createElement("a");
  link.download = "wifiplus-result-card.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

/** `roundRect` is widely supported but still absent in a few engines. */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Web Share with a clipboard fallback. Returns the message to surface in UI. */
export async function shareResult(result: SpeedResult): Promise<string | null> {
  // A run whose upload could not be measured still measured everything else, so
  // it shares the real figures rather than falling back to a marketing line that
  // reports nothing the user just waited for.
  const up = result.upload === null ? "upload not measurable" : `${result.upload.toFixed(1)} Mbps up`;
  const text =
    result.download !== null
      ? `WifiPlus result: ${result.download.toFixed(1)} Mbps down, ${up}, ${result.ping} ms ping.`
      : "Test your internet speed globally with WifiPlus.";
  const url = location.href.split("#")[0] ?? site.url;

  if (navigator.share) {
    try {
      await navigator.share({ title: "WifiPlus Speed Result", text, url });
      return null;
    } catch {
      /* user dismissed the sheet — fall through to clipboard */
    }
  }
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(`${text} ${url}`);
    return "Share text copied to clipboard.";
  }
  return null;
}

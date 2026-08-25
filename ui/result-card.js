/**
 * Shareable result card.
 * -----------------------------------------------------------------------------
 * The card is the artefact most likely to be seen by someone who never watched
 * the run, which makes it the place where an over-claim does the most damage. So
 * it carries the same badges the page does: a figure that was not measured is an
 * em dash with the reason beside it, never a blank that reads as zero.
 *
 * Drawn at 1200x675 — the aspect every social preview crops to — on an offscreen
 * canvas that is created per export and discarded, so nothing is retained.
 */

import { healthBand, suitability } from "../core/health.js";
import { BADGE_TEXT, MetricState, isMeasured } from "../core/metric-state.js";

const W = 1200;
const H = 675;

const PALETTE = {
  bg0: "#04060a",
  bg1: "#0a1018",
  ink: "#edf1f7",
  ink2: "#a7b2c1",
  ink3: "#6d7a8b",
  line: "rgba(255,255,255,0.10)",
  brand: "#2ee6f6",
  up: "#8b8cff",
  warn: "#ffb454",
  good: "#34e0a1",
  bad: "#ff6b81",
};

const TONE = {
  excellent: PALETTE.good,
  good: PALETTE.brand,
  fair: PALETTE.warn,
  poor: PALETTE.bad,
  unknown: PALETTE.ink3,
};

const SANS = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace";

/**
 * Make sure the two families the card is designed in are actually available
 * before drawing. Without this the first export after a cold load silently falls
 * back to the system font and the card looks nothing like the page.
 */
async function ensureFonts() {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load(`800 44px ${SANS}`),
      document.fonts.load(`700 74px ${MONO}`),
      document.fonts.load(`700 34px ${MONO}`),
    ]);
  } catch {
    /* the fallbacks in the stacks above are the answer */
  }
}

/** @param {CanvasRenderingContext2D} ctx */
function roundRect(ctx, x, y, w, h, r) {
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

/**
 * @param {import("../core/scoring.js").SpeedResult} result
 * @param {object} options
 * @param {number | null} options.score
 * @param {import("../core/measure.js").BufferbloatResult | null} options.bufferbloat
 * @param {Record<string, string>} options.states per-metric lifecycle state
 * @param {string | null} [options.isp]
 * @param {string | null} [options.edge]
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function drawResultCard(result, options) {
  await ensureFonts();

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const { score, bufferbloat, states } = options;
  const band = healthBand(score);
  const accent = TONE[band.tone];

  /* ---- Ground ---------------------------------------------------------- */
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, PALETTE.bg0);
  bg.addColorStop(1, PALETTE.bg1);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // The same two light sources the page uses, so the card looks like it came
  // from the product rather than from a template.
  const halo = ctx.createRadialGradient(300, 340, 20, 300, 340, 420);
  halo.addColorStop(0, "rgba(46,230,246,0.16)");
  halo.addColorStop(1, "rgba(46,230,246,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);

  const halo2 = ctx.createRadialGradient(1050, 90, 10, 1050, 90, 380);
  halo2.addColorStop(0, "rgba(139,140,255,0.12)");
  halo2.addColorStop(1, "rgba(139,140,255,0)");
  ctx.fillStyle = halo2;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, 5);

  /* ---- Header ---------------------------------------------------------- */
  ctx.strokeStyle = PALETTE.brand;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(72, 62, 15, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(72, 62, 7, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();

  ctx.fillStyle = PALETTE.ink;
  ctx.font = `800 26px ${SANS}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("WifiPlus", 98, 71);

  ctx.fillStyle = PALETTE.ink3;
  ctx.font = `600 15px ${SANS}`;
  ctx.textAlign = "right";
  const when = new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  ctx.fillText(when, W - 60, 60);
  const provenance = [options.isp, options.edge].filter(Boolean).join("  ·  ");
  if (provenance) {
    ctx.font = `600 13px ${SANS}`;
    ctx.fillText(provenance, W - 60, 80);
  }
  ctx.textAlign = "left";

  ctx.strokeStyle = PALETTE.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, 104);
  ctx.lineTo(W - 60, 104);
  ctx.stroke();

  /* ---- Health ring ------------------------------------------------------ */
  const cx = 226;
  const cy = 292;
  const radius = 108;

  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  if (typeof score === "number" && Number.isFinite(score)) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 14;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(
      cx,
      cy,
      radius,
      -Math.PI / 2,
      -Math.PI / 2 + (Math.max(0, Math.min(100, score)) / 100) * Math.PI * 2,
    );
    ctx.stroke();
    ctx.lineCap = "butt";
  }

  ctx.textAlign = "center";
  ctx.fillStyle = PALETTE.ink;
  ctx.font = `700 74px ${MONO}`;
  ctx.fillText(typeof score === "number" ? String(Math.round(score)) : "--", cx, cy + 16);
  ctx.fillStyle = PALETTE.ink3;
  ctx.font = `700 14px ${SANS}`;
  ctx.fillText("/ 100", cx, cy + 42);

  ctx.fillStyle = accent;
  ctx.font = `800 20px ${SANS}`;
  ctx.fillText(band.grade.toUpperCase(), cx, cy + 156);
  ctx.fillStyle = PALETTE.ink3;
  ctx.font = `700 12px ${SANS}`;
  ctx.fillText("CONNECTION HEALTH", cx, cy + 180);
  ctx.textAlign = "left";

  /* ---- Metric tiles ------------------------------------------------------ */
  const tile = (key, label, format, color) => ({
    label,
    value: isMeasured(result[key]) ? format(result[key]) : "—",
    state: states[key] ?? MetricState.NOT_STARTED,
    color,
  });

  const tiles = [
    tile("download", "DOWNLOAD", (v) => `${v.toFixed(1)}`, PALETTE.brand),
    tile("upload", "UPLOAD", (v) => `${v.toFixed(1)}`, PALETTE.up),
    tile("ping", "PING", (v) => `${Math.round(v)}`, PALETTE.warn),
    tile("jitter", "JITTER", (v) => `${v.toFixed(1)}`, PALETTE.up),
  ];
  const units = ["Mbps", "Mbps", "ms", "ms"];

  const gridX = 440;
  const gridY = 150;
  const tileW = 340;
  const tileH = 128;
  const gapX = 20;
  const gapY = 18;

  tiles.forEach((item, i) => {
    const x = gridX + (i % 2) * (tileW + gapX);
    const y = gridY + Math.floor(i / 2) * (tileH + gapY);

    ctx.fillStyle = "rgba(255,255,255,0.028)";
    ctx.strokeStyle = PALETTE.line;
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, tileW, tileH, 16);
    ctx.fill();
    ctx.stroke();

    // Colour hairline along the top edge — the same identity cue as the page.
    const edge = ctx.createLinearGradient(x, y, x + tileW, y);
    edge.addColorStop(0, "rgba(0,0,0,0)");
    edge.addColorStop(0.5, item.color);
    edge.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = edge;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(x + 1, y, tileW - 2, 1.5);
    ctx.globalAlpha = 1;

    ctx.fillStyle = PALETTE.ink3;
    ctx.font = `800 12px ${SANS}`;
    ctx.fillText(item.label, x + 22, y + 32);

    // Badge. Reads from the live state map, so a card can never stamp
    // "measured" on an em dash.
    const badgeText = (BADGE_TEXT[item.state] ?? BADGE_TEXT[MetricState.NOT_STARTED]).toUpperCase();
    const measured = item.state === MetricState.MEASURED;
    ctx.font = `800 10px ${SANS}`;
    const bw = ctx.measureText(badgeText).width + 18;
    ctx.fillStyle = measured ? "rgba(52,224,161,0.12)" : "rgba(255,180,84,0.12)";
    roundRect(ctx, x + tileW - bw - 18, y + 18, bw, 20, 10);
    ctx.fill();
    ctx.fillStyle = measured ? PALETTE.good : PALETTE.warn;
    ctx.textAlign = "center";
    ctx.fillText(badgeText, x + tileW - bw / 2 - 18, y + 32);
    ctx.textAlign = "left";

    ctx.fillStyle = PALETTE.ink;
    ctx.font = `700 46px ${MONO}`;
    const valueText = item.value;
    ctx.fillText(valueText, x + 22, y + 92);
    const valueW = ctx.measureText(valueText).width;
    ctx.fillStyle = PALETTE.ink3;
    ctx.font = `600 16px ${SANS}`;
    ctx.fillText(units[i], x + 30 + valueW, y + 92);
  });

  /* ---- Secondary row ------------------------------------------------------ */
  const secondary = [
    ["BUFFERBLOAT", bufferbloat ? `${bufferbloat.grade} · +${bufferbloat.increase}ms` : "—"],
    ["PROBE LOSS", isMeasured(result.loss) ? `${result.loss}%` : "—"],
    ["DNS", isMeasured(result.dns) ? `${Math.round(result.dns)} ms` : "—"],
    ["STABILITY", isMeasured(result.stability) ? `${Math.round(result.stability)}%` : "—"],
  ];

  const secY = gridY + 2 * (tileH + gapY) + 6;
  const secW = (tileW * 2 + gapX) / 4;
  secondary.forEach(([label, value], i) => {
    const x = gridX + i * secW;
    if (i > 0) {
      ctx.strokeStyle = PALETTE.line;
      ctx.beginPath();
      ctx.moveTo(x, secY + 4);
      ctx.lineTo(x, secY + 52);
      ctx.stroke();
    }
    ctx.fillStyle = PALETTE.ink3;
    ctx.font = `800 10px ${SANS}`;
    ctx.fillText(label, x + 16, secY + 20);
    ctx.fillStyle = PALETTE.ink2;
    ctx.font = `700 17px ${MONO}`;
    ctx.fillText(value, x + 16, secY + 46);
  });

  /* ---- Suitability strip --------------------------------------------------- */
  const uses = suitability(result, bufferbloat);
  const labels = { gaming: "Gaming", streaming: "4K", calls: "Calls", work: "Work" };
  const stripY = H - 92;
  let sx = 60;
  ctx.font = `700 14px ${SANS}`;
  for (const use of uses) {
    const level = use.level === "unknown" ? "—" : use.level.charAt(0).toUpperCase() + use.level.slice(1);
    const text = `${labels[use.key] || use.key}  ·  ${level}`;
    const width = ctx.measureText(text).width + 42;
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    ctx.strokeStyle = PALETTE.line;
    roundRect(ctx, sx, stripY, width, 36, 18);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = TONE[use.level] || PALETTE.ink3;
    ctx.beginPath();
    ctx.arc(sx + 18, stripY + 18, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.ink2;
    ctx.fillText(text, sx + 30, stripY + 23);
    sx += width + 10;
  }

  /* ---- Footer -------------------------------------------------------------- */
  ctx.fillStyle = PALETTE.ink3;
  ctx.font = `600 13px ${SANS}`;
  ctx.textAlign = "right";
  ctx.fillText("wifiplus.prathamgosai.in  ·  measured in-browser, end to end", W - 60, stripY + 24);
  ctx.textAlign = "left";

  return canvas;
}

#!/usr/bin/env node
/**
 * Renders og-image.svg to og-image.png at 1200x630.
 *
 *   node scripts/build-og.mjs
 *
 * Why this exists: every page references /og-image.png, but the file was only
 * ever produced by a comment telling someone to run sharp-cli by hand. Nobody
 * did, so every share on X, LinkedIn, WhatsApp, Slack and Facebook rendered a
 * blank card — losing exactly the sharing that earns backlinks. Those platforms
 * will not render an SVG, so the PNG is not optional.
 *
 * It shells out to an installed Chrome or Edge rather than adding an image
 * dependency: the static site has no build step and no node_modules, and a
 * headless screenshot of an SVG at fixed dimensions is exact.
 */

import { execFileSync } from "node:child_process";
import { existsSync, renameSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "og-image.svg");
const TARGET = join(ROOT, "og-image.png");

/** Chromium binaries, in the order we would rather use them. */
const CANDIDATES = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

const browser = CANDIDATES.find((path) => existsSync(path));

if (!browser) {
  console.error("No Chrome or Edge found. Set CHROME_PATH, or generate the PNG another way:");
  console.error("  npx sharp-cli -i og-image.svg -o og-image.png resize 1200 630");
  process.exit(1);
}

if (!existsSync(SOURCE)) {
  console.error(`Missing ${SOURCE}`);
  process.exit(1);
}

// --screenshot writes to the working directory unless given an absolute path;
// --window-size fixes the viewport so the SVG lands at exactly 1200x630 with no
// scrollbar gutter and no device-pixel-ratio surprises.
execFileSync(
  browser,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--default-background-color=00000000",
    "--window-size=1200,630",
    `--screenshot=${TARGET}`,
    `file://${SOURCE.replace(/\\/g, "/")}`,
  ],
  { stdio: "ignore" },
);

if (!existsSync(TARGET)) {
  console.error("Browser ran but produced no file.");
  process.exit(1);
}

const { size } = statSync(TARGET);
console.log(`og-image.png — ${(size / 1024).toFixed(1)} KB at 1200x630`);
if (size < 5_000) {
  console.error("Suspiciously small: the SVG may have failed to render. Open it and check.");
  process.exit(1);
}

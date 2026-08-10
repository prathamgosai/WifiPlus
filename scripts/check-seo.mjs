#!/usr/bin/env node
/**
 * Validates the generated SEO pages.
 *
 *   node scripts/check-seo.mjs
 *
 * Every failure this catches is silent in a browser: a page with a one-sided
 * hreflang, a dangling alternate or malformed JSON-LD renders perfectly and is
 * simply ignored by search engines. Without a check, the first sign of trouble
 * is traffic that never arrives.
 *
 * Run after `node scripts/build-seo.mjs`. Exits non-zero on any problem.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Directories that hold source or another app, not generated pages.
const SKIP = new Set([
  "node_modules", ".git", ".github", "web", "server", "worker",
  "design", "core", "scripts", "seo",
]);

/** @param {string} dir @param {string[]} out */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    // index.html at the repo root is the hand-written shell, not generated.
    else if (entry.name === "index.html" && dir !== ROOT) out.push(full);
  }
  return out;
}

const problems = [];
const pages = walk(ROOT);
/** @type {Map<string, { file: string, lang: string, alts: [string, string][] }>} */
const byCanonical = new Map();

for (const file of pages) {
  const html = readFileSync(file, "utf8");
  const rel = file.slice(ROOT.length + 1).split("\\").join("/");

  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
  const lang = /<html lang="([^"]+)"/.exec(html)?.[1];
  const title = /<title>([^<]+)<\/title>/.exec(html)?.[1];
  const description = /<meta name="description" content="([^"]+)"/.exec(html)?.[1];

  if (!canonical) problems.push(`${rel}: no canonical`);
  if (!lang) problems.push(`${rel}: no <html lang>`);
  if (!title) problems.push(`${rel}: no <title>`);

  // Google truncates around 160 characters; well over that means the snippet is
  // being written by Google instead of by you.
  if (!description) problems.push(`${rel}: no meta description`);
  else if (description.length > 170) problems.push(`${rel}: description ${description.length} chars (>170)`);

  const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!ld) {
    problems.push(`${rel}: no JSON-LD`);
  } else {
    try {
      const graph = JSON.parse(ld)["@graph"];
      if (!Array.isArray(graph) || !graph.length) problems.push(`${rel}: empty JSON-LD @graph`);
    } catch (error) {
      problems.push(`${rel}: JSON-LD does not parse — ${(error instanceof Error && error.message) || error}`);
    }
  }

  const alts = /** @type {[string, string][]} */ (
    [...html.matchAll(/rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]])
  );
  if (canonical && lang) byCanonical.set(canonical, { file: rel, lang, alts });
}

// hreflang must be mutual and self-referencing, or Google discards the cluster.
for (const [url, info] of byCanonical) {
  if (!info.alts.length) continue; // a page with no translations needs none
  if (!info.alts.some(([hl, href]) => href === url && hl === info.lang)) {
    problems.push(`${info.file}: hreflang cluster omits its own URL`);
  }
  for (const [hl, href] of info.alts) {
    if (hl === "x-default") continue;
    const target = byCanonical.get(href);
    if (!target) problems.push(`${info.file}: alternate points at an unknown page — ${href}`);
    else if (!target.alts.some(([, back]) => back === url)) {
      problems.push(`${info.file}: ${href} does not link back (one-sided hreflang is ignored)`);
    }
  }
}

// Everything listed in the sitemap must exist, and vice versa.
const sitemap = readFileSync(join(ROOT, "sitemap.xml"), "utf8");
const listed = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
for (const url of byCanonical.keys()) {
  if (!listed.has(url)) problems.push(`sitemap.xml: missing ${url}`);
}

if (problems.length) {
  console.error(`SEO check failed — ${problems.length} problem(s):\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(`SEO check passed — ${pages.length} generated pages, ${listed.size} sitemap URLs, hreflang reciprocal.`);

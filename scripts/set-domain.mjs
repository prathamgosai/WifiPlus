#!/usr/bin/env node
// Replaces the placeholder domain and Worker URL across every file that carries them.
//
//   node scripts/set-domain.mjs wifiplus.in
//   node scripts/set-domain.mjs wifiplus.in wifiplus-router-analyzer.acme.workers.dev
//
// Missing one reference by hand leaves a canonical tag or CSP entry pointing at a
// domain you don't control, which is worse than not changing it at all — so this
// verifies afterwards that nothing was left behind.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PLACEHOLDER_DOMAIN = "wifiplus.example";
const PLACEHOLDER_WORKER = "wifiplus-router-analyzer.example.workers.dev";

const FILES = [
  // Legacy hand-written build (still the deployed site until you flip to web/).
  "index.html",
  "app.js",
  "robots.txt",
  "sitemap.xml",
  "worker/wrangler.toml",
  // Next.js redesign. Its robots.txt/sitemap.xml already carry the real domain,
  // so in practice only the Worker host is rewritten here.
  "web/lib/site.ts",
  "web/public/_headers",
  "web/public/robots.txt",
  "web/public/sitemap.xml",
];

const [domain, worker] = process.argv.slice(2);

if (!domain) {
  console.error("Usage: node scripts/set-domain.mjs <domain> [worker-host]");
  console.error("Example: node scripts/set-domain.mjs wifiplus.in");
  process.exit(1);
}
// Accept "wifiplus.in", not "https://wifiplus.in/" — the templates supply the
// scheme and trailing slash, so a pasted URL would produce "https://https://…/".
if (/^https?:\/\//i.test(domain) || domain.includes("/")) {
  console.error(`Pass the bare hostname, not a URL. Got: ${domain}`);
  process.exit(1);
}
if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
  console.error(`That does not look like a hostname: ${domain}`);
  process.exit(1);
}

let changedFiles = 0;
let changedRefs = 0;

for (const relative of FILES) {
  const path = join(ROOT, relative);
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    console.warn(`  skipped (not found): ${relative}`);
    continue;
  }

  const before = text;
  // Worker host first: it is a distinct string, but replacing the site domain
  // first would be a no-op on it anyway. Order kept explicit for clarity.
  if (worker) text = text.split(PLACEHOLDER_WORKER).join(worker);
  text = text.split(PLACEHOLDER_DOMAIN).join(domain);

  if (text !== before) {
    const hits =
      before.split(PLACEHOLDER_DOMAIN).length -
      1 +
      (worker ? before.split(PLACEHOLDER_WORKER).length - 1 : 0);
    writeFileSync(path, text);
    console.log(`  ${relative} — ${hits} reference${hits === 1 ? "" : "s"}`);
    changedFiles += 1;
    changedRefs += hits;
  }
}

console.log(`\nUpdated ${changedRefs} references across ${changedFiles} files.`);

// Verify, rather than trust the loop above.
const leftover = [];
for (const relative of FILES) {
  let text;
  try {
    text = readFileSync(join(ROOT, relative), "utf8");
  } catch {
    continue;
  }
  if (text.includes(PLACEHOLDER_DOMAIN)) leftover.push(`${relative} (domain)`);
  if (worker && text.includes(PLACEHOLDER_WORKER)) leftover.push(`${relative} (worker)`);
}

if (leftover.length) {
  console.error(`\nPlaceholders still present in: ${leftover.join(", ")}`);
  process.exit(1);
}

if (!worker) {
  console.log(
    "\nWorker URL left as the placeholder. Once deployed, re-run with it as the\n" +
      "second argument — the router analyzer will not work until then, and the\n" +
      "CSP connect-src will block the request.",
  );
}

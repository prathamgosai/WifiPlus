#!/usr/bin/env node
/**
 * Validates that the service worker precaches everything the app actually needs.
 *
 *   node scripts/check-shell.mjs
 *
 * The failure this catches is invisible until someone is offline. `app.js` is an
 * ES module: the browser loads it from the cache, hits its first `import` of a
 * module nobody precached, and the whole page dies — on the one visit where the
 * cache was supposed to be the point. Online, everything looks perfect, so the
 * bug ships and is discovered by a user on a train.
 *
 * Adding an import to `app.js` and forgetting `sw.js` is a one-line mistake that
 * no test and no type checker sees. This is the thing that sees it.
 *
 * Exits non-zero on any problem.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Entry points the service worker treats as precached app shell. */
const ENTRIES = ["app.js", "landing.js", "boot-check.js"];

/**
 * Every same-origin module reachable from an entry point, followed transitively.
 *
 * @param {string} entry path relative to the repo root
 * @param {Set<string>} seen
 * @returns {Set<string>} absolute-style paths, e.g. "/core/measure.js"
 */
function moduleGraph(entry, seen = new Set()) {
  const abs = join(ROOT, entry);
  if (!existsSync(abs)) return seen;

  const source = readFileSync(abs, "utf8");
  // Static imports and re-exports only. A dynamic import() is loaded on demand
  // and is allowed to be missing from the shell.
  const specifiers = [...source.matchAll(/(?:^|\n)\s*(?:import|export)[^;'"]*from\s*["']([^"']+)["']/g)]
    .map((m) => m[1])
    .filter((s) => s.startsWith("./") || s.startsWith("../"));

  for (const spec of specifiers) {
    const resolved = join(dirname(entry), spec).replace(/\\/g, "/");
    const key = `/${resolved}`;
    if (seen.has(key)) continue;
    seen.add(key);
    moduleGraph(resolved, seen);
  }

  return seen;
}

const sw = readFileSync(join(ROOT, "sw.js"), "utf8");
const shell = new Set([...sw.matchAll(/'(\/[^']*)'/g)].map((m) => m[1]));

/** @type {string[]} */
const problems = [];

for (const entry of ENTRIES) {
  for (const module of moduleGraph(entry)) {
    if (!shell.has(module)) {
      problems.push(
        `${module} is imported by ${entry} but is not in the sw.js APP_SHELL — ` +
          `a cold offline load will fail on that import.`,
      );
    }
  }
  if (!shell.has(`/${entry}`)) {
    problems.push(`/${entry} is not in the sw.js APP_SHELL.`);
  }
}

// A shell entry that no longer exists wastes a cache slot and makes install()
// reject outright: cache.addAll fails atomically on a single 404, so ONE stale
// path means the service worker never installs and nothing is cached at all.
for (const path of shell) {
  if (path === "/" || !path.includes(".")) continue;
  if (!existsSync(join(ROOT, path.slice(1)))) {
    problems.push(`sw.js precaches ${path}, which does not exist — cache.addAll will reject and nothing will be cached.`);
  }
}

if (problems.length) {
  console.error("Service worker shell is out of sync with the code:\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}

console.log(`Service worker shell OK — ${shell.size} precached paths, all present and sufficient.`);

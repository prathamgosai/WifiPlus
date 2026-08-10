/**
 * Registry of self-hosted edge measurement servers — backed by the shared
 * engine in `core/`.
 *
 * The list itself lives in core so the static site at the repo root reads the
 * same one. This module exists only to feed it the two things a Next.js build
 * knows and core cannot: the inlined `NEXT_PUBLIC_` env var, and the discovery
 * URL. Everything below that is core's.
 */
import {
  configureServers,
  distanceKm,
  fetchServerRegistry,
  getConfiguredServers as coreGetConfiguredServers,
  normaliseServers,
} from "@core/servers.js";
import type { SpeedServer } from "@core/servers.js";

export type { SpeedServer };
export { distanceKm, fetchServerRegistry, normaliseServers };

/**
 * `process.env.NEXT_PUBLIC_*` is a literal substitution at build time, so it
 * cannot be read dynamically or moved into core — core has no bundler.
 */
function fromEnv(): SpeedServer[] {
  const raw = process.env.NEXT_PUBLIC_WIFIPLUS_SERVERS;
  if (!raw) return [];
  try {
    return normaliseServers(JSON.parse(raw));
  } catch {
    // A malformed env var costs the self-hosted edges, not the test: the run
    // falls back to Cloudflare exactly as it does with none configured.
    return [];
  }
}

let seeded = false;

/**
 * The servers this run may measure against.
 *
 * Seeding is done once, lazily, rather than at module scope: this file is
 * imported during the static export, where `configureServers` would run in Node
 * and set state that never reaches the browser.
 */
export function getConfiguredServers(): SpeedServer[] {
  if (!seeded) {
    seeded = true;
    const env = fromEnv();
    if (env.length) configureServers(env);
  }
  return coreGetConfiguredServers();
}

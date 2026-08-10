/**
 * Registry of self-hosted edge measurement servers.
 * -----------------------------------------------------------------------------
 * Deliberately framework-agnostic: the static site at the repo root and the
 * Next.js app both read this same registry, so "which edge am I measuring
 * against" has one answer rather than two.
 *
 * Empty by default. With nothing configured the test measures against
 * Cloudflare's edge, which is itself a real 300-city anycast network — so the
 * zero-infrastructure path is a genuine nearest-edge measurement, not a
 * degraded one. Once `server/` is deployed in one or more regions, register
 * them here and the picker will choose the lowest-latency one by measurement.
 *
 * Three ways to populate it, checked in this order:
 *   1. `configureServers([...])` — explicit, for apps that build their own list.
 *   2. `globalThis.WIFIPLUS_SERVERS` — a JSON array on the page, for the static
 *      site, which has no build step and therefore no env-var inlining.
 *   3. `fetchServerRegistry(url)` — GET /api/speedtest/servers on a discovery
 *      host, for deployments that add and remove regions without a redeploy.
 */

/**
 * @typedef {object} SpeedServer
 * @property {string} id
 * @property {string} name
 * @property {string} country
 * @property {string} city
 * @property {string} url Base URL of a deployed `server/`, e.g. https://bom.speed.example.com
 * @property {number} [lat] Coordinates, for showing distance in the UI.
 * @property {number} [lon]
 */

/** @type {SpeedServer[]} */
let registry = [];

/**
 * Accepts only entries that could actually be measured against. A malformed URL
 * in the registry is not a harmless typo: the picker would spend its whole
 * latency budget failing to reach it, and the run would start late for everyone.
 *
 * @param {unknown} value
 * @returns {SpeedServer[]}
 */
export function normaliseServers(value) {
  if (!Array.isArray(value)) return [];

  /** @type {SpeedServer[]} */
  const out = [];
  const seen = new Set();

  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const entry = /** @type {Record<string, unknown>} */ (raw);
    const id = typeof entry.id === "string" ? entry.id : "";
    const url = typeof entry.url === "string" ? entry.url : "";
    if (!id || !url || seen.has(id)) continue;

    // A relative or otherwise unparseable URL cannot be probed from another
    // origin, and an http:// endpoint is blocked outright on an https page —
    // both would silently cost a probe each and never answer.
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") continue;

    seen.add(id);
    out.push({
      id,
      url: url.replace(/\/$/, ""),
      name: typeof entry.name === "string" && entry.name ? entry.name : id,
      country: typeof entry.country === "string" ? entry.country : "",
      city: typeof entry.city === "string" ? entry.city : "",
      ...(typeof entry.lat === "number" ? { lat: entry.lat } : {}),
      ...(typeof entry.lon === "number" ? { lon: entry.lon } : {}),
    });
  }

  return out;
}

/**
 * Replace the registry. Passing a malformed list clears it rather than throwing:
 * a bad config should cost the Cloudflare fallback, not the whole test.
 *
 * @param {unknown} servers
 * @returns {SpeedServer[]} what was actually accepted
 */
export function configureServers(servers) {
  registry = normaliseServers(servers);
  return registry;
}

/**
 * The servers to consider for this run.
 *
 * @returns {SpeedServer[]}
 */
export function getConfiguredServers() {
  if (registry.length) return registry;
  // The static site has no bundler to inline an env var, so it declares the
  // registry on the page instead. Read it lazily: a <script> further down the
  // document may not have run when this module was first evaluated.
  const global = /** @type {{ WIFIPLUS_SERVERS?: unknown }} */ (
    /** @type {unknown} */ (globalThis)
  );
  return normaliseServers(global.WIFIPLUS_SERVERS);
}

/**
 * Load the registry from a discovery host's `/api/speedtest/servers`.
 *
 * Failure is not an error condition — it means "no self-hosted edges are
 * reachable", and the caller falls back to Cloudflare. Bounded so a hung
 * discovery host cannot delay the start of a test.
 *
 * @param {string} url
 * @param {AbortSignal} [signal]
 * @param {number} [timeoutMs]
 * @returns {Promise<SpeedServer[]>}
 */
export async function fetchServerRegistry(url, signal, timeoutMs = 2000) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) return [];
    const body = await res.json();
    // Accept both a bare array and the { servers: [...] } envelope the server
    // route returns, so a hand-written static JSON file works too.
    const list = Array.isArray(body) ? body : body?.servers;
    return configureServers(list);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Great-circle distance in km — for the "distance to server" readout.
 *
 * @param {number} aLat
 * @param {number} aLon
 * @param {number} bLat
 * @param {number} bLon
 * @returns {number}
 */
export function distanceKm(aLat, aLon, bLat, bLon) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
}

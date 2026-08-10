/**
 * Measurement endpoint abstraction.
 * -----------------------------------------------------------------------------
 * The engine doesn't care *which* server it measures against — it needs a
 * download URL, an upload URL and a ping URL. Cloudflare's public edge and a
 * self-hosted WifiPlus edge (`server/`) expose different paths, so each is
 * wrapped as an Endpoint. Cloudflare is the default, so the test works with zero
 * infrastructure.
 *
 * @typedef {object} Endpoint
 * @property {string} name
 * @property {(bytes: number) => string} down URL returning `bytes` of uncached random data.
 * @property {() => string} up URL accepting a binary POST body.
 * @property {() => string} ping Tiny uncached URL for latency probes.
 * @property {(() => string) | null} dns Server-side resolver timing, when the
 *   endpoint offers it. Null on Cloudflare's edge, which has no such route — the
 *   engine then times a DNS-over-HTTPS lookup from the browser instead.
 * @property {(() => string) | null} health Server load, for the picker.
 * @property {(() => string) | null} meta What the edge observes about the client.
 */

/** Path prefix of a current `server/` deployment. */
export const API_PREFIX = "/api/speedtest";

/**
 * Bare paths, as `server/` exposed them before the `/api/speedtest` prefix
 * existed. Still served as aliases, so an edge deployed from an older image
 * keeps working — the picker discovers which form answers rather than assuming.
 */
export const LEGACY_PREFIX = "";

/** @type {Endpoint} */
export const cloudflareEndpoint = {
  name: "Cloudflare",
  down: (bytes) => `https://speed.cloudflare.com/__down?bytes=${bytes}`,
  up: () => "https://speed.cloudflare.com/__up",
  ping: () => "https://speed.cloudflare.com/__down?bytes=0",
  // Cloudflare's public speed endpoints expose no resolver-timing route. The
  // engine falls back to timing a DoH lookup in the browser, which measures the
  // same path the user's own page loads take.
  dns: null,
  health: null,
  meta: () => "https://speed.cloudflare.com/meta",
};

/**
 * Wraps a deployed `server/` instance.
 *
 * @param {string} baseUrl
 * @param {string} [name]
 * @param {string} [prefix] Path prefix the server answers on. Defaults to the
 *   current `/api/speedtest`; pass LEGACY_PREFIX for an older deployment.
 * @returns {Endpoint}
 */
export function customEndpoint(baseUrl, name = "WifiPlus edge", prefix = API_PREFIX) {
  const base = `${baseUrl.replace(/\/$/, "")}${prefix}`;
  return {
    name,
    down: (bytes) => `${base}/download?bytes=${bytes}`,
    up: () => `${base}/upload`,
    ping: () => `${base}/ping`,
    dns: () => `${base}/dns`,
    health: () => `${base}/health`,
    meta: () => `${base}/meta`,
  };
}

/**
 * Lowercase hex from the crypto RNG.
 *
 * @param {number} bytes
 * @returns {string}
 */
export function randomHex(bytes) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Appends a unique cache-buster, choosing `?` or `&` correctly.
 *
 * The caller's token identifies the request (which stream, which attempt) and a
 * random suffix guarantees global uniqueness. Both are needed: the token alone
 * repeats across runs, and a bare random value makes a failing request
 * impossible to trace back to the stream that issued it.
 *
 * @param {string} url
 * @param {string | number} token
 * @returns {string}
 */
export function bust(url, token) {
  return `${url}${url.includes("?") ? "&" : "?"}cb=${token}&r=${randomHex(8)}`;
}

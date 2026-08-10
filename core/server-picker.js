/**
 * Edge selection by measurement.
 * -----------------------------------------------------------------------------
 * "Nearest" is decided by round-trip time, never by a city name in a config
 * file: a server labelled Mumbai that answers in 180ms is further away, in the
 * only sense that matters to a speed test, than one labelled Singapore that
 * answers in 30ms. Geography is a label; latency is a measurement.
 *
 * The picker returns an ORDERED list, not a single winner. A phase that fails
 * against the best edge falls through to the runner-up and finally to
 * Cloudflare, so one sick server degrades the run instead of ending it.
 */

import {
  API_PREFIX,
  LEGACY_PREFIX,
  cloudflareEndpoint,
  customEndpoint,
} from "./endpoints.js";
import { getConfiguredServers } from "./servers.js";

/**
 * @typedef {import("./servers.js").SpeedServer} SpeedServer
 * @typedef {import("./endpoints.js").Endpoint} Endpoint
 */

/**
 * @typedef {object} ServerHealth
 * @property {SpeedServer} server
 * @property {number} latency Median of the probes, ms. Infinity if unreachable.
 * @property {number} load Normalised server load from /health (0 idle, >1 saturated).
 * @property {boolean} reachable
 * @property {string} prefix Path prefix this server actually answered on.
 */

/** Probes per server. The first is discarded — it pays the TLS handshake. */
export const PICKER_PROBES = 3;

/**
 * Deadline for one probe. Short on purpose: this runs before the user sees any
 * number, so an unreachable edge has to be written off quickly rather than
 * accurately. A server that cannot answer a zero-byte ping in 1.2s is not the
 * one to run a throughput test against.
 */
export const PICKER_PROBE_TIMEOUT_MS = 1200;

/**
 * Ceiling on the whole selection phase.
 *
 * Selection is pure overhead — it moves no bytes the user cares about — so it
 * gets a hard budget. Past it the best answer so far wins, and if there is no
 * answer at all the run falls back to Cloudflare. A registry full of dead hosts
 * therefore costs about a second, not the sum of every timeout.
 */
export const PICKER_BUDGET_MS = 2500;

/** A load of 1.0 (fully saturated) is treated as costing this many ms. */
const LOAD_PENALTY_MS = 15;

/**
 * @param {number[]} values
 * @returns {number} Infinity for an empty set, so it sorts last
 */
function median(values) {
  if (!values.length) return Infinity;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Infinity;
}

/**
 * One timed request against a candidate path.
 *
 * @param {string} url
 * @param {AbortSignal} signal
 * @returns {Promise<number | null>} ms, or null when it failed or 404'd
 */
async function timedProbe(url, signal) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), PICKER_PROBE_TIMEOUT_MS);
  const started = performance.now();

  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    // A 404 means this prefix is not the one this server answers on — a routing
    // fact, not a latency measurement, so it must not be timed as one.
    if (!res.ok) return null;
    await res.arrayBuffer();
    return performance.now() - started;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

/**
 * Latency, health and path prefix of one server.
 *
 * The first probe doubles as prefix discovery: current deployments answer on
 * `/api/speedtest/ping`, older ones on `/ping`. Whichever replies is the prefix
 * every later request to this host uses, so an edge deployed from an old image
 * still measures correctly instead of failing every fetch.
 *
 * @param {SpeedServer} server
 * @param {AbortSignal} signal
 * @returns {Promise<ServerHealth>}
 */
async function probeServer(server, signal) {
  const base = server.url.replace(/\/$/, "");
  /** @type {ServerHealth} */
  const dead = { server, latency: Infinity, load: 0, reachable: false, prefix: API_PREFIX };

  /** @type {string | null} */
  let prefix = null;
  /** @type {number[]} */
  const samples = [];

  for (let i = 0; i < PICKER_PROBES; i += 1) {
    if (signal.aborted) return prefix === null ? dead : { ...dead, prefix };

    if (prefix === null) {
      // Discovery round. Try the current prefix, then the legacy one.
      for (const candidate of [API_PREFIX, LEGACY_PREFIX]) {
        const ms = await timedProbe(`${base}${candidate}/ping?cb=${i}-${performance.now()}`, signal);
        if (ms !== null) {
          prefix = candidate;
          // Deliberately NOT recorded as a sample: this request paid for TCP,
          // TLS and possibly a failed attempt on the other prefix first. Timing
          // it would report the handshake as the server's latency.
          break;
        }
      }
      if (prefix === null) return dead;
      continue;
    }

    const ms = await timedProbe(`${base}${prefix}/ping?cb=${i}-${performance.now()}`, signal);
    if (ms !== null) samples.push(ms);
  }

  if (prefix === null || !samples.length) return prefix === null ? dead : { ...dead, prefix };

  // Load is advisory: a server that does not publish /health is simply treated
  // as idle rather than penalised for the omission.
  let load = 0;
  try {
    const res = await fetch(`${base}${prefix}/health?cb=${performance.now()}`, {
      cache: "no-store",
      signal,
    });
    if (res.ok) {
      const value = Number((await res.json())?.load);
      if (Number.isFinite(value) && value >= 0) load = value;
    }
  } catch {
    /* health is optional — absence is not a failure */
  }

  return { server, latency: median(samples), load, reachable: true, prefix };
}

/**
 * Probe every configured server in parallel and rank them.
 *
 * @param {SpeedServer[]} [servers]
 * @param {AbortSignal} [signal]
 * @returns {Promise<ServerHealth[]>} reachable servers, best first
 */
export async function rankServers(servers = getConfiguredServers(), signal) {
  if (!servers.length) return [];

  // Own controller so the budget can cut the phase short without cancelling the
  // caller's test, while an outer abort still propagates inward.
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), PICKER_BUDGET_MS);

  try {
    const results = await Promise.all(servers.map((s) => probeServer(s, controller.signal)));
    return results
      .filter((r) => r.reachable)
      .sort((a, b) => a.latency + a.load * LOAD_PENALTY_MS - (b.latency + b.load * LOAD_PENALTY_MS));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Best single edge, or null when none answered.
 *
 * @param {SpeedServer[]} [servers]
 * @param {AbortSignal} [signal]
 * @returns {Promise<ServerHealth | null>}
 */
export async function discoverBestServer(servers = getConfiguredServers(), signal) {
  const ranked = await rankServers(servers, signal);
  return ranked[0] ?? null;
}

/**
 * @typedef {object} EndpointChoice
 * @property {Endpoint} endpoint The endpoint to measure against.
 * @property {ServerHealth | null} server Null when this is Cloudflare's edge.
 * @property {Endpoint[]} candidates Ordered fallbacks, best first, Cloudflare last.
 * @property {ServerHealth[]} ranked Everything that answered, best first.
 */

/**
 * Resolve what this run should measure against.
 *
 * With no servers configured this returns Cloudflare immediately and makes no
 * network requests at all, so the default experience pays nothing for a feature
 * it isn't using.
 *
 * @param {AbortSignal} [signal]
 * @param {SpeedServer[]} [servers]
 * @returns {Promise<EndpointChoice>}
 */
export async function resolveEndpoint(signal, servers = getConfiguredServers()) {
  if (!servers.length) {
    return {
      endpoint: cloudflareEndpoint,
      server: null,
      candidates: [cloudflareEndpoint],
      ranked: [],
    };
  }

  const ranked = await rankServers(servers, signal);
  const endpoints = ranked.map((r) => customEndpoint(r.server.url, r.server.name, r.prefix));

  // Cloudflare is always the last resort, even when self-hosted edges answered:
  // it is the one endpoint that cannot be taken down by this project's own
  // deploy, so a run can always complete against something.
  const candidates = [...endpoints, cloudflareEndpoint];

  return {
    endpoint: candidates[0] ?? cloudflareEndpoint,
    server: ranked[0] ?? null,
    candidates,
    ranked,
  };
}

/**
 * A human label for whichever edge was chosen.
 *
 * @param {EndpointChoice} choice
 * @returns {string}
 */
export function endpointLabel(choice) {
  const best = choice.server;
  if (!best) return choice.endpoint.name;
  const { city, name } = best.server;
  const where = city ? `${city} — ${name}` : name;
  return `${where} (${Math.round(best.latency)} ms)`;
}

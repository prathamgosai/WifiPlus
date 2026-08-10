/**
 * Edge selection — re-exported from the shared engine in `core/`.
 *
 * The implementation deliberately lives outside this app: the static site at the
 * repo root runs the identical picker. If the two ever ranked servers
 * differently, the same browser on the same link would be told it was measuring
 * against different edges depending on which page it was on.
 *
 * The only local part is the registry, which needs this app's build-time env
 * var — see `./servers`.
 */
import { resolveEndpoint as coreResolveEndpoint, rankServers as coreRankServers } from "@core/server-picker.js";
import type { EndpointChoice, ServerHealth } from "@core/server-picker.js";
import { getConfiguredServers } from "./servers";

export { endpointLabel } from "@core/server-picker.js";
export type { EndpointChoice, ServerHealth };

/** Rank the configured edges by measured latency, best first. */
export function rankServers(signal?: AbortSignal): Promise<ServerHealth[]> {
  return coreRankServers(getConfiguredServers(), signal);
}

/**
 * Resolve what this run should measure against, plus the ordered fallbacks a
 * failing phase drops through.
 */
export function resolveEndpoint(signal?: AbortSignal): Promise<EndpointChoice> {
  return coreResolveEndpoint(signal, getConfiguredServers());
}

/**
 * Measurement endpoints — re-exported from the shared engine in `core/`.
 *
 * The implementation deliberately lives outside this app: the static site at the
 * repo root imports the exact same module from a plain <script type="module">.
 * One definition of an endpoint, two front ends, no drift.
 */
export { bust, cloudflareEndpoint, customEndpoint } from "@core/endpoints.js";
export type { Endpoint } from "@core/endpoints.js";

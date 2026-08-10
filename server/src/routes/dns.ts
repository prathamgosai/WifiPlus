import { Resolver } from "node:dns/promises";
import { performance } from "node:perf_hooks";
import type { FastifyPluginAsync } from "fastify";
import type { Config } from "../config";

/**
 * GET /dns
 *
 * Times a genuine recursive resolution from this edge. The label is random on
 * every request, so no cache anywhere on the path can answer it — what is timed
 * is a real walk to an authoritative nameserver, not a memory lookup.
 *
 * IMPORTANT — what this is NOT. This measures the SERVER's resolver, not the
 * client's. A browser cannot time its own OS resolver: there is no API for it,
 * and every workaround (timing a fetch to a fresh hostname) measures connect
 * and TLS as well as the lookup. So the headline "DNS latency" the app shows
 * stays a client-side DNS-over-HTTPS measurement, which at least runs over the
 * user's own network path. This route exists for operators: it answers "is this
 * edge's own resolution healthy", which is a real question with a real answer,
 * and it is labelled as such rather than being passed off as the user's DNS.
 */

/** Random label under a domain with live authoritative servers. */
function coldName(): string {
  const label = Math.random().toString(36).slice(2, 12);
  return `${label}.cloudflare.com`;
}

/** A lookup that hangs must not hold the request open. */
const LOOKUP_TIMEOUT_MS = 3000;

export const dnsRoutes =
  (config: Config): FastifyPluginAsync =>
  async (app) => {
    app.get("/dns", async (_request, reply) => {
      reply
        .header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        .header("Timing-Allow-Origin", "*");

      const resolver = new Resolver({ timeout: LOOKUP_TIMEOUT_MS, tries: 1 });
      const host = coldName();
      const started = performance.now();

      try {
        // A random label under a live domain resolves to NXDOMAIN. That is a
        // complete, authoritative answer — the full recursive walk happened —
        // so the time it took is exactly the quantity being measured.
        await resolver.resolve4(host);
        return {
          resolved: true,
          ms: Number((performance.now() - started).toFixed(2)),
          host,
          scope: "server",
          region: config.region,
        };
      } catch (error) {
        const ms = Number((performance.now() - started).toFixed(2));
        const code = (error as NodeJS.ErrnoException).code ?? "UNKNOWN";
        // NXDOMAIN is the expected outcome and a successful measurement. Any
        // other code means the resolver did not answer, and reporting the time
        // it took to fail as a DNS latency would be a fabricated reading — a
        // fast refusal would look like a fast resolver.
        const answered = code === "ENOTFOUND" || code === "ENODATA";
        return {
          resolved: answered,
          ms: answered ? ms : null,
          host,
          scope: "server",
          region: config.region,
          ...(answered ? {} : { error: code }),
        };
      } finally {
        resolver.cancel();
      }
    });
  };

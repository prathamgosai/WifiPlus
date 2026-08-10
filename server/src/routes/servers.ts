import type { FastifyPluginAsync } from "fastify";
import type { Config } from "../config";

/**
 * GET /servers
 *
 * The registry of edges a client may measure against. Serving it from the API
 * means regions can be added or drained without shipping a new frontend build —
 * the picker re-reads this list on every run.
 *
 * The list is configuration, not discovery: this server does not probe its peers
 * (that would report ITS latency to them, which tells a browser in another
 * country nothing). The client probes every entry itself and ranks by what it
 * measures. This route only says which servers exist.
 */
export const serverRoutes =
  (config: Config): FastifyPluginAsync =>
  async (app) => {
    app.get("/servers", async (_request, reply) => {
      reply
        .header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        .header("Timing-Allow-Origin", "*");

      // Always advertise self, so a single-region deployment needs no extra
      // configuration to be usable — the one server it knows about is itself.
      const self = {
        id: config.region,
        name: config.serverName,
        country: config.country,
        city: config.city,
        url: config.publicUrl,
        ...(config.lat !== null ? { lat: config.lat } : {}),
        ...(config.lon !== null ? { lon: config.lon } : {}),
      };

      const peers = config.peers.filter((p) => p.id !== self.id);

      return { servers: [self, ...peers] };
    });
  };

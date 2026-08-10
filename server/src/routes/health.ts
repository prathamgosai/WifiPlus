import os from "node:os";
import type { FastifyPluginAsync } from "fastify";
import type { Config } from "../config";

const startedAt = Date.now();

/**
 * GET /health
 *
 * Server-side health the frontend's server picker uses to weight/deselect an
 * overloaded edge: uptime, 1-minute load average relative to core count, and
 * memory pressure. All real OS readings — nothing synthesised.
 */
export const healthRoutes =
  (config: Config): FastifyPluginAsync =>
  async (app) => {
    app.get("/health", async (_request, reply) => {
      const cores = os.cpus().length || 1;
      const load1 = os.loadavg()[0] ?? 0;
      const totalMem = os.totalmem();
      const freeMem = os.freemem();

      reply.header("Cache-Control", "no-store");
      return {
        status: "ok",
        region: config.region,
        server: config.serverName,
        country: config.country,
        city: config.city,
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
        cores,
        // Normalised load: <1 healthy, >1 saturated.
        load: Number((load1 / cores).toFixed(3)),
        memoryUsedPct: Number((((totalMem - freeMem) / totalMem) * 100).toFixed(1)),
        time: new Date().toISOString(),
      };
    });
  };

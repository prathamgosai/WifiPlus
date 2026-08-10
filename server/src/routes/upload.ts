import type { FastifyPluginAsync } from "fastify";
import type { Config } from "../config";

/**
 * POST /upload
 *
 * The client streams a random binary blob; the server drains it, counting bytes
 * WITHOUT buffering the whole body (so a 100 MB upload never sits in memory),
 * times it from first to last byte, and returns the measured throughput. The
 * body content-type parser is what does the draining — see app.ts.
 */
export const uploadRoutes =
  (_config: Config): FastifyPluginAsync =>
  async (app) => {
    app.post<{ Body: { bytes: number; ms: number } }>("/upload", async (request, reply) => {
      const { bytes, ms } = request.body;
      const mbps = ms > 0 ? (bytes * 8) / (ms * 1000) : 0;

      reply
        .header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        .header("Timing-Allow-Origin", "*");

      return { bytes, ms: Number(ms.toFixed(2)), mbps: Number(mbps.toFixed(2)) };
    });
  };

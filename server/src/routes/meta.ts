import type { FastifyPluginAsync } from "fastify";
import type { Config } from "../config";

/**
 * GET /meta
 *
 * What this edge observes about the client's connection: the real source IP
 * (from the socket, or the trusted X-Forwarded-For when behind NGINX/Cloudflare)
 * and the HTTP version actually negotiated. ISP/ASN enrichment is intentionally
 * left to the frontend (Cloudflare's meta endpoint) so this server needs no
 * bundled geo-IP database.
 */
export const metaRoutes =
  (config: Config): FastifyPluginAsync =>
  async (app) => {
    app.get("/meta", async (request, reply) => {
      const ip = request.ip;
      reply.header("Cache-Control", "no-store").header("Timing-Allow-Origin", "*");
      return {
        ip,
        ipVersion: ip.includes(":") ? "IPv6" : "IPv4",
        httpProtocol: `HTTP/${request.raw.httpVersion}`,
        region: config.region,
        server: config.serverName,
        country: config.country,
        city: config.city,
        time: new Date().toISOString(),
      };
    });
  };

import { performance } from "node:perf_hooks";
import Fastify, { type FastifyInstance, type FastifyPluginAsync } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import type { Config } from "./config";
import { healthRoutes } from "./routes/health";
import { metaRoutes } from "./routes/meta";
import { downloadRoutes } from "./routes/download";
import { uploadRoutes } from "./routes/upload";
import { pingRoutes } from "./routes/ping";
import { dnsRoutes } from "./routes/dns";
import { serverRoutes } from "./routes/servers";

/**
 * Canonical path prefix. Everything is served here AND at the bare paths the
 * server originally used, because edges already deployed in the field are
 * addressed by the old shape and a client that discovers the old one must keep
 * working. The client picker probes for whichever answers.
 */
export const API_PREFIX = "/api/speedtest";

/** Measurement routes are exempt from rate limiting — a real test fires many. */
const MEASUREMENT_PATHS = ["/download", "/upload", "/ping", "/ws"];

function isMeasurement(url: string): boolean {
  // Compare the path only: a cache-buster in the query string must not decide
  // whether a download is rate limited.
  const path = url.split("?")[0] ?? "";
  const bare = path.startsWith(API_PREFIX) ? path.slice(API_PREFIX.length) : path;
  return MEASUREMENT_PATHS.some((p) => bare === p || bare.startsWith(`${p}/`));
}

/**
 * Builds the fully-wired Fastify instance without listening. Exported so tests
 * can drive it in-process via `app.inject()` — no port, no real sockets, but
 * the exact same routing and parsing as production.
 */
export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.logLevel },
    trustProxy: config.trustProxy,
    // Cap the upload body so a hostile client can't exhaust memory. The parser
    // below streams rather than buffers, but this is the hard backstop.
    bodyLimit: config.maxUploadBytes,
  });

  // Security headers. CSP/CORP are relaxed because this is a cross-origin
  // measurement API consumed by the separate frontend origin — not an HTML app.
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  await app.register(cors, {
    origin: config.allowedOrigins.length > 0 ? config.allowedOrigins : true,
    methods: ["GET", "POST", "OPTIONS"],
    // Let the browser read the timing headers the download route exposes.
    exposedHeaders: ["Content-Length", "Timing-Allow-Origin"],
    maxAge: 86_400,
  });

  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindowMs,
    // Measurement routes must never be throttled or the test would be wrong.
    allowList: (request) => isMeasurement(request.url),
  });

  await app.register(websocket);

  // Upload sink: drain the body counting bytes and timing first→last byte,
  // WITHOUT buffering it. A catch-all parser covers whatever content-type the
  // browser attaches to a binary POST. No route consumes a JSON request body,
  // so replacing the default parsers is safe.
  app.addContentTypeParser("*", (_request, payload, done) => {
    let bytes = 0;
    let start = 0;
    payload.on("data", (chunk: Buffer) => {
      if (start === 0) start = performance.now();
      bytes += chunk.length;
    });
    payload.on("end", () => {
      const ms = start === 0 ? 0 : performance.now() - start;
      done(null, { bytes, ms });
    });
    payload.on("error", done);
  });

  app.get("/", async () => ({
    service: "wifiplus-speedtest-server",
    region: config.region,
    server: config.serverName,
    apiPrefix: API_PREFIX,
    endpoints: [
      `${API_PREFIX}/servers`,
      `${API_PREFIX}/health`,
      `${API_PREFIX}/meta`,
      `${API_PREFIX}/ping`,
      `${API_PREFIX}/ws/ping`,
      `${API_PREFIX}/download?bytes=N`,
      `${API_PREFIX}/upload`,
      `${API_PREFIX}/dns`,
    ],
  }));

  // One set of route definitions, mounted twice. Registering the same plugins
  // under two prefixes keeps the old and new surfaces from drifting: there is
  // no second implementation to forget to fix.
  const measurementRoutes: FastifyPluginAsync = async (scope) => {
    await scope.register(healthRoutes(config));
    await scope.register(metaRoutes(config));
    await scope.register(downloadRoutes(config));
    await scope.register(uploadRoutes(config));
    await scope.register(pingRoutes);
    await scope.register(dnsRoutes(config));
    await scope.register(serverRoutes(config));
  };

  await app.register(measurementRoutes, { prefix: API_PREFIX });
  await app.register(measurementRoutes);

  return app;
}

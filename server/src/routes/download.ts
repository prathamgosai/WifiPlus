import type { FastifyPluginAsync } from "fastify";
import { downloadStream } from "../payload";
import type { Config } from "../config";

interface DownloadQuery {
  bytes?: string;
  /** Cache-buster the client varies per request; ignored server-side. */
  n?: string;
}

/**
 * GET /download?bytes=N
 *
 * Streams exactly N bytes of uncompressible random data with every caching
 * mechanism disabled, so the client times a real transfer over the wire — no
 * browser cache, no CDN cache, no compression. This is the download primitive.
 */
export const downloadRoutes =
  (config: Config): FastifyPluginAsync =>
  async (app) => {
    app.get<{ Querystring: DownloadQuery }>("/download", async (request, reply) => {
      const requested = Number(request.query.bytes ?? 0);
      const bytes = Number.isFinite(requested)
        ? Math.max(0, Math.min(Math.floor(requested), config.maxDownloadBytes))
        : 0;

      reply
        // `no-transform` is the part that matters for accuracy, not for caching:
        // it tells intermediaries not to re-encode the body. A proxy that gzips
        // this stream would have the client count decompressed bytes and report
        // a decompressor's speed as the link's.
        .header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0, no-transform")
        .header("Pragma", "no-cache")
        .header("Expires", "0")
        // Explicitly identity-encoded so no proxy re-compresses the stream.
        .header("Content-Encoding", "identity")
        .header("Content-Type", "application/octet-stream")
        .header("Content-Length", String(bytes))
        .header("Timing-Allow-Origin", "*")
        .header("X-Content-Type-Options", "nosniff");

      return reply.send(downloadStream(bytes));
    });
  };

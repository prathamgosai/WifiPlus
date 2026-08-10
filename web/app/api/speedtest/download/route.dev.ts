import {
  MAX_DEV_DOWNLOAD_BYTES,
  noStoreHeaders,
  randomStream,
} from "@/lib/dev-measurement";

/** Streaming a real body needs the Node runtime, not the edge one. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/speedtest/download?bytes=N — development only.
 *
 * Streams exactly N bytes of uncompressible random data with caching disabled.
 * See `lib/dev-measurement.ts` for why the resulting Mbps figure is not a
 * measurement of anything on a network.
 */
export function GET(request: Request): Response {
  const requested = Number(new URL(request.url).searchParams.get("bytes") ?? 0);
  const bytes = Number.isFinite(requested)
    ? Math.max(0, Math.min(Math.floor(requested), MAX_DEV_DOWNLOAD_BYTES))
    : 0;

  return new Response(randomStream(bytes), {
    headers: noStoreHeaders({
      "Content-Type": "application/octet-stream",
      "Content-Length": String(bytes),
      // Explicitly identity-encoded so nothing in the path re-compresses the
      // stream and hands the client fewer bytes than it counts.
      "Content-Encoding": "identity",
      "X-Content-Type-Options": "nosniff",
    }),
  });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: noStoreHeaders() });
}

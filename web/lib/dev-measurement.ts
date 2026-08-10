import { randomFillSync } from "node:crypto";

/**
 * Shared pieces for the LOCAL DEVELOPMENT measurement API.
 * -----------------------------------------------------------------------------
 * READ THIS BEFORE TRUSTING A NUMBER FROM THESE ROUTES.
 *
 * These handlers exist so the front end can be developed without running the
 * Fastify edge in `server/`. They are excluded from the production build (see
 * `next.config.mjs` — the files are named `route.dev.ts` and only the dev
 * `pageExtensions` picks them up), and they are not a speed test.
 *
 * A throughput measurement against localhost measures the loopback interface and
 * the Next dev server's ability to schedule I/O. It does not touch a network
 * card, a router, or an ISP. Expect numbers in the thousands of Mbps and treat
 * every one of them as meaningless: what they verify is that the client's byte
 * counting, chunk sizing, retry and failover logic behave, not how fast anything
 * is. For a real measurement, point the registry at a deployed `server/` or let
 * it fall back to Cloudflare's edge.
 */

/** Marks a response as a dev reading, so nothing can mistake it for a result. */
export const DEV_SCOPE = "local-development";

/**
 * Caching disabled at every layer that could otherwise answer from memory. A
 * cached response would be timed as a transfer that never happened.
 */
export function noStoreHeaders(extra: Record<string, string> = {}): Headers {
  return new Headers({
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
    "Timing-Allow-Origin": "*",
    // The static site runs on a different dev port, so it is cross-origin to
    // this one. Wide open is acceptable here and only here: these routes do not
    // exist in a production build.
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...extra,
  });
}

/**
 * One high-entropy block, generated once and streamed in slices.
 *
 * 4 MiB exceeds any deflate window, so a proxy that tries to compress the stream
 * finds nothing to remove and the client receives the number of bytes that left
 * the server. Reusing one buffer keeps memory flat however many requests run.
 */
const BLOCK = 4 * 1024 * 1024;
const source = new Uint8Array(BLOCK);
randomFillSync(source);

/** A stream emitting exactly `total` bytes of uncompressible data. */
export function randomStream(total: number): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= total) {
        controller.close();
        return;
      }
      const remaining = total - sent;
      const slice = remaining >= BLOCK ? source : source.subarray(0, remaining);
      sent += slice.length;
      controller.enqueue(slice);
    },
  });
}

/** Ceiling on a single dev download, so a typo cannot stream forever. */
export const MAX_DEV_DOWNLOAD_BYTES = 256 * 1024 * 1024;

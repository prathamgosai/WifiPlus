import { randomFillSync } from "node:crypto";
import { Readable } from "node:stream";

/**
 * Random payload source for the download test.
 *
 * A single 4 MiB high-entropy buffer is generated once at startup and streamed
 * in slices to reach the requested size. High entropy means the bytes are
 * effectively uncompressible, so an intermediary that tries to gzip them gains
 * nothing — the client receives (near) the same number of bytes that left the
 * server, which is what keeps the measurement honest. Reusing one buffer keeps
 * memory flat regardless of how many 1 GB downloads run concurrently.
 */
const CHUNK = 4 * 1024 * 1024;
const source = Buffer.allocUnsafe(CHUNK);
randomFillSync(source);

/**
 * A readable stream that emits exactly `total` bytes of random data.
 * `highWaterMark` is raised so the stream keeps the socket saturated.
 */
export function downloadStream(total: number): Readable {
  let sent = 0;
  return new Readable({
    highWaterMark: CHUNK,
    read() {
      if (sent >= total) {
        this.push(null);
        return;
      }
      const remaining = total - sent;
      const slice = remaining >= CHUNK ? source : source.subarray(0, remaining);
      sent += slice.length;
      this.push(slice);
    },
  });
}

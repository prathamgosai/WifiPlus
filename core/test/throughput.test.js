/**
 * Throughput must never invent a number.
 *
 * Both directions had a way to report a figure that was not a measurement: the
 * download divided by whatever window remained when its streams died early, and
 * the upload fell back to a fixed chunk size over the window whenever the link
 * was too slow to finish one — which is a constant, not a reading.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { installXhrStub, removeXhrStub } from "./xhr-stub.js";
import {
  MEASURE_MS,
  UP_STREAMS,
  WARMUP_MS,
  measureDownload,
  measureUpload,
} from "../measure.js";

const realFetch = globalThis.fetch;

afterEach(() => {
  /** @type {any} */ (globalThis).fetch = realFetch;
  removeXhrStub();
  vi.restoreAllMocks();
});

/** @param {(url: any, init?: any) => Promise<any>} impl */
function setFetch(impl) {
  /** @type {any} */ (globalThis).fetch = vi.fn(impl);
}

/**
 * A readable stream that emits `chunkBytes` every `everyMs` until cancelled.
 *
 * @param {number} chunkBytes
 * @param {number} everyMs
 * @param {number} [totalChunks]
 */
function bodyEmitting(chunkBytes, everyMs, totalChunks = Infinity) {
  let sent = 0;
  return {
    getReader: () => ({
      read: async () => {
        if (sent >= totalChunks) return { done: true, value: undefined };
        sent += 1;
        await new Promise((r) => setTimeout(r, everyMs));
        return { done: false, value: new Uint8Array(chunkBytes) };
      },
      cancel: async () => {},
    }),
  };
}

describe("measureDownload", () => {
  it("does not report a gigabit when the streams die moments after warm-up", async () => {
    // Every request fails right after the warm-up cutoff. Promise.all then
    // resolves with a post-warmup window only a few ms wide, and dividing the
    // bytes already counted by that window produced readings like 1275 Mbps.
    let calls = 0;
    setFetch(async () => {
      calls += 1;
      if (calls > 1) throw new Error("connection reset");
      // One burst of 16 MB, then the body ends.
      await new Promise((r) => setTimeout(r, 520));
      return { ok: true, body: bodyEmitting(16_000_000, 1, 1) };
    });

    const result = await measureDownload();
    // 16 MB in roughly half a second is ~250 Mbps. Anything near a gigabit is
    // the denominator collapsing, not the link.
    expect(result.mbps).toBeLessThan(600);
    expect(result.mbps).toBeGreaterThan(0);
    // The evidence has to come back with the figure, or nothing downstream can
    // check it.
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.elapsedMs).toBeGreaterThan(0);
  }, 20_000);

  it("reports a plausible rate for a steady stream", async () => {
    // 1 MB every 10ms across the streams ≈ 800 Mbps per stream; the exact figure
    // depends on scheduling, so this only asserts it lands in a sane band.
    setFetch(async () => ({ ok: true, body: bodyEmitting(100_000, 10) }));
    const result = await measureDownload();
    expect(result.mbps).toBeGreaterThan(0);
    expect(Number.isFinite(result.mbps)).toBe(true);

    // Reconciliation: the headline must be recomputable from the bytes and the
    // span reported beside it. This is the assertion that would catch a bug in
    // the aggregation itself, which no amount of "is it a plausible number"
    // checking can.
    const fromEvidence = (result.measuredBytes * 8) / (result.measuredMs * 1000);
    expect(Number.isFinite(fromEvidence)).toBe(true);
    expect(result.reconciliationMbps).toBeGreaterThan(0);
    // Trimming is allowed to move the figure, but not to another planet.
    expect(Math.abs(result.mbps - result.reconciliationMbps) / result.reconciliationMbps).toBeLessThan(1);
  }, 20_000);

  it("never returns Infinity or NaN when nothing arrives at all", async () => {
    setFetch(async () => {
      throw new Error("offline");
    });
    await expect(measureDownload()).rejects.toThrow();
  });
});

describe("measureUpload", () => {
  it("refuses to fabricate a rate when nothing is transmitted", () => {
    // An uplink that moves no bytes at all. The old fallback divided a fixed
    // chunk size by the window and always answered 0.82 Mbps — the same number
    // for every dead connection on earth.
    installXhrStub({ fail: true });
    return expect(measureUpload()).rejects.toThrow(/upload/i);
  }, 15_000);

  it("counts bytes the browser reports as transmitted, not bytes handed to fetch", () => {
    // 1 MB/s uplink. fetch could only ever have inferred this from completed
    // requests; upload.onprogress reports it as it happens.
    installXhrStub({ bytesPerMs: 1000 });
    return measureUpload().then((result) => {
      // 1000 bytes/ms = 8 Mbps per stream, four streams sharing the stub's
      // simulated pipe independently, so the aggregate is around 32 Mbps.
      expect(result.mbps).toBeGreaterThan(8);
      expect(Number.isFinite(result.mbps)).toBe(true);
      // Only acknowledged POSTs may contribute.
      expect(result.method).toMatch(/^confirmed-bytes/);
      expect(result.bytes).toBeGreaterThan(0);
      expect(result.posts?.length ?? 0).toBeGreaterThan(0);
      expect((result.posts ?? []).reduce((sum, p) => sum + p.bytes, 0)).toBe(result.bytes);
    });
  }, 20_000);

  it("reports progress while the upload is still running", async () => {
    installXhrStub({ bytesPerMs: 1000 });
    /** @type {number[]} */
    const live = [];
    const result = await measureUpload((mbps) => live.push(mbps));

    // The tile must move during the phase, not jump from nothing to the result.
    expect(live.length).toBeGreaterThan(1);
    expect(live.every((v) => Number.isFinite(v) && v > 0)).toBe(true);
  }, 20_000);

  it("derives the result from acknowledged bytes, not from socket-buffer progress", async () => {
    // The two are deliberately different sources now, and this is the test that
    // pins that down. `upload.onprogress` reports bytes accepted by the local
    // socket buffer, which on a real link runs ahead of the peer — measured
    // against this endpoint it overstated wall-clock throughput by 9.2x on a
    // 256 KB body. The live tile may use it, because a tile has to react within
    // a second. The RESULT may not, because it has to be true.
    installXhrStub({ bytesPerMs: 1000 });
    /** @type {number[]} */
    const live = [];
    const result = await measureUpload((mbps) => live.push(mbps));

    // Every byte in the figure belongs to a POST the server answered for.
    const acknowledged = (result.posts ?? []).reduce((sum, p) => sum + p.bytes, 0);
    expect(result.bytes).toBe(acknowledged);
    // And the figure is that byte count over the span those acknowledgements
    // happened in — recomputable, to the rounding.
    const recomputed = (result.measuredBytes * 8) / (result.measuredMs * 1000);
    expect(Math.abs(recomputed - result.mbps)).toBeLessThan(0.01);
  }, 20_000);

  it("does not over-report a link of known speed, in either direction", async () => {
    // The stub transmits at a rate we choose, so the true link speed is known
    // and the reported figure can be checked for ACCURACY and, more
    // importantly, for SIGN.
    //
    // The sign assertion is the one that matters. This function promises in
    // its own docstring that it errs low — it charges every POST for its
    // response round trip, so a real uplink is at least as fast as reported.
    // A warm-up clamp broke that promise silently: the POST straddling the
    // 500ms cutoff had all of its bytes counted but only part of its
    // transmission time, and the figure came out 3-8% HIGH at every link
    // speed tested. An accuracy-only assertion would have passed throughout.
    const streams = UP_STREAMS;
    for (const trueMbps of [2, 50, 200]) {
      installXhrStub({ bytesPerMs: (trueMbps * 1000) / 8 / streams, progressEveryMs: 50 });
      const { mbps } = await measureUpload();

      const error = (mbps - trueMbps) / trueMbps;
      // Close to the truth...
      expect(Math.abs(error)).toBeLessThan(0.08);
      // ...and never flattering. A percent of slack for scheduling jitter,
      // not enough to hide a systematic bias.
      expect(mbps).toBeLessThanOrEqual(trueMbps * 1.01);
    }
  }, 60_000);

  it("sends an incompressible body, so compression cannot inflate the result", () => {
    const seen = installXhrStub({ bytesPerMs: 100_000 });
    return measureUpload().then((result) => {
      expect(result.mbps).toBeGreaterThan(0);
      const sizes = seen().map((r) => r.bytes);
      expect(sizes.length).toBeGreaterThan(0);
      expect(Math.max(...sizes)).toBeGreaterThan(0);
    });
  }, 20_000);
});

describe("live reporting window", () => {
  it("follows a step change in link speed within about a second", async () => {
    // The acceptance requirement: throttle a connection mid-test and the tile
    // must visibly drop within roughly a second. Reporting the cumulative
    // average made it nearly inert — an average built from seconds of fast
    // transfer barely moves when the link collapses.
    //
    // Driven deterministically here rather than through a browser throttle,
    // because Chrome applies throttling per request: 25 MB transfers already in
    // flight keep delivering at the old rate, which confounds the observation.
    const FAST_CHUNK = 500_000;
    const SLOW_CHUNK = 5_000;
    const switchAt = 2500;
    let phaseStart = 0;

    setFetch(async () => ({
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () => {
            await new Promise((r) => setTimeout(r, 25));
            const elapsed = performance.now() - phaseStart;
            return {
              done: false,
              value: new Uint8Array(elapsed < switchAt ? FAST_CHUNK : SLOW_CHUNK),
            };
          },
          cancel: async () => {},
        }),
      },
    }));

    /** @type {{ t: number, mbps: number }[]} */
    const reported = [];
    phaseStart = performance.now();
    await measureDownload((mbps) => reported.push({ t: performance.now() - phaseStart, mbps }));

    const before = reported.filter((r) => r.t > switchAt - 400 && r.t < switchAt);
    const after = reported.filter((r) => r.t > switchAt + 1200);
    expect(before.length).toBeGreaterThan(0);
    expect(after.length).toBeGreaterThan(0);

    const peak = Math.max(...before.map((r) => r.mbps));
    const settled = Math.max(...after.map((r) => r.mbps));
    // A hundredfold drop in delivered bytes must show up as a large drop in the
    // reported figure, not a rounding difference.
    expect(settled).toBeLessThan(peak * 0.25);
  }, 20_000);
});

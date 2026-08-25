/**
 * Timing behaviour of the measurement phases, driven against a stubbed `fetch`
 * so a slow link can be simulated deterministically.
 *
 * These pin the two properties that decide how long a real test takes:
 *   1. the latency phase must not scale with the user's latency, and
 *   2. no phase may run meaningfully past its window.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { installXhrStub, removeXhrStub } from "./xhr-stub.js";
import {
  MEASURE_MS,
  UPLOAD_MEASURE_MS,
  PING_BUDGET_MS,
  PING_FLOOR_SAMPLES,
  PING_MIN_SAMPLES,
  PING_SAMPLES,
  PROBE_TIMEOUT_MS,
  LOADED_PROBE_TIMEOUT_MS,
  UP_STREAMS,
  bufferbloatFrom,
  measureLatency,
  measureLoadedLatency,
  measureUpload,
} from "../measure.js";

const realFetch = globalThis.fetch;

afterEach(() => {
  /** @type {any} */ (globalThis).fetch = realFetch;
  removeXhrStub();
  vi.restoreAllMocks();
});

/**
 * Installs a fake `fetch`. Every response is empty; only the delay matters.
 *
 * @param {(index: number) => number} delayFor milliseconds per call
 */
function stubFetch(delayFor) {
  let calls = 0;
  setFetch(async (_url, init) => {
    const index = calls++;
    const delay = delayFor(index);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, delay);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(0), body: null };
  });
  return () => calls;
}

/**
 * The stubs return only the handful of Response fields the engine touches, so
 * they are installed through one deliberately loose cast rather than by faking
 * an entire Response on every call.
 *
 * @param {(url: any, init?: any) => Promise<any>} impl
 */
function setFetch(impl) {
  /** @type {any} */ (globalThis).fetch = vi.fn(impl);
}

describe("measureLatency phase budget", () => {
  it("takes every planned probe on a fast link", async () => {
    stubFetch(() => 1);
    const result = await measureLatency();
    expect(result.samples.length).toBe(PING_SAMPLES - 1); // first is discarded
  });

  it("stops early on a slow link instead of costing 20x the latency", async () => {
    // 300ms round trips: 20 sequential probes would be 6 seconds.
    stubFetch(() => 300);
    const started = Date.now();
    const result = await measureLatency();
    const elapsed = Date.now() - started;

    expect(result.samples.length).toBeGreaterThanOrEqual(PING_MIN_SAMPLES);
    expect(result.samples.length).toBeLessThan(PING_SAMPLES - 1);
    // Budget plus one in-flight probe, with slack for CI scheduling.
    expect(elapsed).toBeLessThan(PING_BUDGET_MS + 1200);
  });

  it("still reports a usable distribution on a brutal link, without hanging", async () => {
    // 900ms round trips: the soft floor of PING_MIN_SAMPLES would cost ~7s, so
    // the hard cap takes over and reports from the few probes that landed.
    stubFetch(() => 900);
    const started = Date.now();
    const result = await measureLatency();
    const elapsed = Date.now() - started;

    expect(result.samples.length).toBeGreaterThanOrEqual(PING_FLOOR_SAMPLES);
    expect(result.ping).toBeGreaterThan(800);
    expect(elapsed).toBeLessThan(5000);
  });

  it("counts a black-holed probe as loss instead of waiting for it forever", async () => {
    // Never resolves: only the per-probe timeout can end this.
    setFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );

    const started = Date.now();
    await expect(measureLatency()).rejects.toThrow("No latency samples");
    // A few probes time out and the phase gives up, rather than hanging.
    expect(Date.now() - started).toBeLessThan(PROBE_TIMEOUT_MS * 4);
  }, 10_000);

  it("reports loss against probes actually sent, not the planned count", async () => {
    // Slow AND failing: an early exit must not be mistaken for packet loss.
    let call = 0;
    setFetch(async () => {
      call += 1;
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (call % 2 === 0) throw new Error("network");
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
    });

    const result = await measureLatency();
    // Roughly half the probes failed; a denominator of 19 would understate it.
    expect(result.loss).toBeGreaterThan(30);
    expect(result.loss).toBeLessThanOrEqual(100);
  });
});

describe("measureUpload window", () => {
  it("bounds the phase even when every post is far slower than the window", async () => {
    // Every POST takes 6 seconds. The old fixed-chunk implementation waited for
    // all four streams and overshot by ~20 seconds. Now the window closes and a
    // bounded grace allows one chunk to land; whether it lands or not, the phase
    // must end promptly and must never report a fabricated figure.
    stubFetch(() => 6000);
    const started = Date.now();

    let result = null;
    let threw = false;
    try {
      result = await measureUpload();
    } catch {
      threw = true;
    }
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(UPLOAD_MEASURE_MS + 6000);
    if (!threw && result) {
      // A real acknowledged post, not a constant divided by the window.
      expect(result.mbps).toBeGreaterThan(0);
      expect(Number.isFinite(result.mbps)).toBe(true);
    }
  }, 20_000);

  it("grows the chunk on a fast link so a quick uplink still saturates", async () => {
    const seen = installXhrStub({ bytesPerMs: 200_000, progressEveryMs: 20 });
    await measureUpload();
    const sizes = seen().map((r) => r.bytes);

    // A link this fast must end up sending far more than the 64 KB floor, or it
    // is being measured in round trips rather than in bandwidth.
    expect(Math.max(...sizes)).toBeGreaterThan(1_000_000);
    // ...but the FIRST request must not already be at the ceiling. One sized
    // from an optimistic guess can occupy the whole window and be aborted,
    // costing the entire measurement rather than one short request.
    expect(sizes[0] ?? 0).toBeLessThan(Math.max(...sizes));
  }, 20_000);

  it("sizes the seeded chunk for one stream's share, not the whole uplink", async () => {
    // UP_STREAMS requests are in flight at once and share the link, so a chunk
    // sized for the FULL measured downlink takes UP_STREAMS times longer than
    // intended. On a slow uplink that overshot the window so nothing completed
    // and the phase failed outright — and the trigger was perverse: a FASTER
    // download produced a bigger seed, so measuring a good downlink is what
    // broke the upload.
    const seen = installXhrStub({ bytesPerMs: 50_000 });
    await measureUpload(undefined, undefined, undefined, 100);
    const sizes = seen().map((r) => r.bytes);

    const wholeLink = (100 / 10) * 125 * 700;
    expect(sizes[0]).toBe(Math.round(wholeLink / UP_STREAMS));
    expect(sizes[0]).toBeLessThan(wholeLink);
  }, 20_000);

  it("still transmits on a slow uplink after a fast download", async () => {
    // The regression: a 13.3 Mbps download seeded chunks a 0.6 Mbps uplink
    // could not finish inside the window, so the phase reported nothing.
    installXhrStub({ bytesPerMs: 75, progressEveryMs: 100 });
    const result = await measureUpload(undefined, undefined, undefined, 13.3);
    expect(result.mbps).toBeGreaterThan(0);
    expect(Number.isFinite(result.mbps)).toBe(true);
  }, 20_000);
});

describe("loaded-latency probing", () => {
  it("allows far longer than an idle probe, because slow IS the measurement", () => {
    // Bufferbloat is latency climbing under load. Applying the idle deadline
    // here timed out the probes on exactly the connections the grade exists to
    // catch, and the panel reported "not measurable" instead of grading them.
    expect(LOADED_PROBE_TIMEOUT_MS).toBeGreaterThan(PROBE_TIMEOUT_MS * 2);
  });

  it("keeps probes that are slow but do return", async () => {
    // 2.5s round trips: far past the idle deadline, well inside the loaded one.
    // Timing these out would discard exactly the links the grade exists to find.
    stubFetch(() => 2500);
    const probes = await measureLoadedLatency();
    expect(probes.length).toBeGreaterThanOrEqual(1);
    expect(Math.min(...probes)).toBeGreaterThan(2000);
  }, 20_000);

  it("grades a saturated link F once enough probes have landed", () => {
    // Separate from the phase above, because grading now needs a real sample
    // count: p95 of two probes is the maximum, not a percentile.
    const bloat = bufferbloatFrom(20, Array.from({ length: 20 }, () => 2500));
    expect(bloat?.grade).toBe("F");
    expect(bloat?.increase).toBeGreaterThan(2000);
  });
});

/**
 * The run sequence, tested for the first time.
 *
 * While this logic lived inside `app.js` and a React hook it could only be
 * checked by opening a browser, so it never was — and the bugs it grew were
 * exactly the ones that hide from a manual click-through: a failing upload
 * discarding five good measurements, a phase reporting against an edge the user
 * was never told about, progress that jumps.
 *
 * These drive the real orchestration against a stubbed `fetch`, so every
 * assertion is about the order and consequences of real calls.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { runMeasurement, PROGRESS } from "../run.js";
import { TestAborted } from "../measure.js";
import { configureServers } from "../servers.js";
import { installXhrStub, removeXhrStub } from "./xhr-stub.js";

const realFetch = globalThis.fetch;

afterEach(() => {
  /** @type {any} */ (globalThis).fetch = realFetch;
  configureServers([]);
  removeXhrStub();
  vi.restoreAllMocks();
});

/**
 * A `fetch` that answers every measurement route plausibly and quickly.
 *
 * @param {{ failUpload?: boolean, failDownload?: boolean, failLatency?: boolean }} [opts]
 */
function stubNetwork(opts = {}) {
  // Upload runs over XHR, because upload.onprogress is the only browser API
  // that reports transmitted bytes. Stubbing the transport keeps tests and
  // production on one code path.
  installXhrStub(opts.failUpload ? { fail: true } : { bytesPerMs: 20_000 });

  /** @type {string[]} */
  const seen = [];
  /** @type {any} */ (globalThis).fetch = vi.fn(async (url, init) => {
    const href = String(url);
    seen.push(`${init?.method ?? "GET"} ${href.split("?")[0]}`);

    if (init?.method === "POST") {
      if (opts.failUpload) throw new Error("upload refused");
      await new Promise((r) => setTimeout(r, 5));
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) };
    }
    if (href.includes("dns-query")) {
      return { ok: true, status: 200, json: async () => ({ Status: 0 }) };
    }
    if (href.includes("bytes=0")) {
      // A latency probe.
      if (opts.failLatency) throw new Error("probe refused");
      await new Promise((r) => setTimeout(r, 2));
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) };
    }
    // A download stream.
    if (opts.failDownload) throw new Error("download refused");
    let chunks = 0;
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(0),
      body: {
        getReader: () => ({
          read: async () => {
            if (chunks >= 40) return { done: true, value: undefined };
            chunks += 1;
            await new Promise((r) => setTimeout(r, 10));
            return { done: false, value: new Uint8Array(200_000) };
          },
          cancel: async () => {},
        }),
      },
    };
  });
  return seen;
}

describe("runMeasurement", () => {
  it("runs the phases in order and finishes with every metric measured", async () => {
    stubNetwork();
    /** @type {string[]} */
    const phases = [];

    const outcome = await runMeasurement({ onPhase: (p) => phases.push(p) });

    expect(phases).toEqual(["select", "latency", "download", "upload", "done"]);
    expect(outcome.result.download).toBeGreaterThan(0);
    expect(outcome.result.upload).toBeGreaterThan(0);
    expect(outcome.result.ping).toBeGreaterThanOrEqual(0);
    expect(outcome.result.stability).not.toBeNull();
    expect(outcome.uploadNote).toBeNull();
  }, 30_000);

  it("keeps the whole run when only the upload fails", async () => {
    // The regression this exists for: a slow uplink threw, and the run threw
    // with it, discarding a download, ping, jitter, loss and DNS figure that
    // were all measured cleanly.
    stubNetwork({ failUpload: true });

    const outcome = await runMeasurement();

    expect(outcome.result.upload).toBeNull();
    expect(outcome.uploadNote).toBeTruthy();
    // Everything else survived.
    expect(outcome.result.download).toBeGreaterThan(0);
    expect(outcome.result.ping).toBeGreaterThanOrEqual(0);
    expect(outcome.result.stability).not.toBeNull();
  }, 30_000);

  it("fails the run when a phase that cannot be missing has no answer", async () => {
    // Download is not optional: without it there is no result worth showing.
    stubNetwork({ failDownload: true });
    await expect(runMeasurement()).rejects.toThrow();
  }, 30_000);

  it("advances progress monotonically to exactly 100", async () => {
    stubNetwork();
    /** @type {number[]} */
    const seen = [];

    const outcome = await runMeasurement({ onProgress: (p) => seen.push(p) });

    expect(outcome.result.download).toBeGreaterThan(0);
    expect(seen[0]).toBe(0);
    expect(seen.at(-1)).toBe(100);
    // A bar that goes backwards reads as the test restarting.
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1] ?? 0);
    }
    // Each phase stays inside its own band, so no phase can fill the bar early.
    expect(Math.max(...seen)).toBeLessThanOrEqual(PROGRESS.upload);
  }, 30_000);

  it("streams metrics during the run rather than only at the end", async () => {
    stubNetwork();
    /** @type {string[]} */
    const keys = [];
    await runMeasurement({
      onMetric: (patch) => keys.push(...Object.keys(patch)),
    });

    // Latency values must appear while the latency phase is still running, or
    // the tiles sit blank for the first quarter of the test.
    expect(keys.indexOf("ping")).toBeLessThan(keys.indexOf("download"));
    expect(keys).toContain("jitter");
    expect(keys).toContain("loss");
    expect(keys).toContain("stability");
  }, 30_000);

  it("names the edge it is measuring against before any number is produced", async () => {
    stubNetwork();
    /** @type {{ at: string, label: string }[]} */
    const events = [];
    let phase = "none";

    await runMeasurement({
      onPhase: (p) => {
        phase = p;
      },
      onEdge: (label) => events.push({ at: phase, label }),
    });

    // A result that does not say where it was measured to is not reproducible.
    expect(events[0]?.at).toBe("select");
    expect(events[0]?.label).toContain("Cloudflare");
  }, 30_000);

  it("propagates cancellation instead of returning a partial result", async () => {
    stubNetwork();
    const controller = new AbortController();

    // Aborted from a callback rather than a timer. A fixed delay raced the run:
    // under a loaded test runner the timer could fire before the first phase had
    // begun or after one had failed on its own, so the rejection was sometimes a
    // phase error rather than a cancellation. Firing on a phase the run reports
    // means the abort always lands mid-run.
    const promise = runMeasurement(
      {
        onPhase: (phase) => {
          if (phase === "latency") controller.abort();
        },
      },
      controller.signal,
    );

    await expect(promise).rejects.toBeInstanceOf(TestAborted);
  }, 30_000);

  it("reports the edge that served the run, not the one chosen at the start", async () => {
    stubNetwork();
    const outcome = await runMeasurement();
    expect(outcome.endpoint.name).toBe("Cloudflare");
    expect(outcome.edgeLabel).toContain("Cloudflare");
  }, 30_000);

  it("reports nothing rather than zero when the latency phase fails outright", async () => {
    // The regression this exists for: the failure path substituted
    // { ping: 0, jitter: 0, loss: 0 } for the readings it never got. Zero is a
    // finite number, so every downstream gate — the badge state, the metric
    // tiles, the exported card — accepted it as a measurement, and an offline
    // browser reported a 0 ms ping with 0% loss and stamped it "measured".
    // A metric that could not be measured has to be null all the way out.
    stubNetwork({ failLatency: true });

    const outcome = await runMeasurement();

    expect(outcome.result.ping).toBeNull();
    expect(outcome.result.jitter).toBeNull();
    expect(outcome.result.loss).toBeNull();
    expect(outcome.latency.samples).toEqual([]);
    // Bufferbloat is the difference between idle and loaded latency, so with
    // no idle figure there is no difference to state.
    expect(outcome.bufferbloat).toBeNull();
    // Stability is a function of the latency spread, which does not exist.
    expect(outcome.result.stability).toBeNull();
    // The phases that did work are unaffected.
    expect(outcome.result.download).toBeGreaterThan(0);
  }, 30_000);
});

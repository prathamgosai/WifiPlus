/**
 * Retry and failover exist to keep a run honest when infrastructure misbehaves,
 * and they are dangerous in exactly one way: a retry in the wrong place turns a
 * measurement into a wish. These tests pin both halves — that transient failures
 * are absorbed, and that the things which must NOT be retried still aren't.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { TestAborted, fetchWithRetry, isRetryableStatus, withFailover } from "../measure.js";
import { API_PREFIX, LEGACY_PREFIX, cloudflareEndpoint, customEndpoint } from "../endpoints.js";
import { configureServers, normaliseServers } from "../servers.js";
import { rankServers, resolveEndpoint } from "../server-picker.js";

const realFetch = globalThis.fetch;

afterEach(() => {
  /** @type {any} */ (globalThis).fetch = realFetch;
  configureServers([]);
  vi.restoreAllMocks();
});

/** @param {(url: any, init?: any) => Promise<any>} impl */
function setFetch(impl) {
  /** @type {any} */ (globalThis).fetch = vi.fn(impl);
}

/** A minimal Response stand-in. */
function reply(status = 200) {
  return { ok: status >= 200 && status < 300, status, arrayBuffer: async () => new ArrayBuffer(0) };
}

describe("isRetryableStatus", () => {
  it("retries overload and timeout, never a permanent refusal", () => {
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(408)).toBe(true);
    // Retrying these wastes the user's time on an answer that cannot change.
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(413)).toBe(false);
    expect(isRetryableStatus(403)).toBe(false);
  });
});

describe("fetchWithRetry", () => {
  it("absorbs a transient 503 rather than losing the stream for the whole window", async () => {
    let calls = 0;
    setFetch(async () => {
      calls += 1;
      return reply(calls < 3 ? 503 : 200);
    });

    const res = await fetchWithRetry((n) => `https://edge.test/download?cb=${n}`, {});
    expect(res.ok).toBe(true);
    expect(calls).toBe(3);
  });

  it("sends a different URL each attempt, so no intermediary can replay the failure", async () => {
    /** @type {string[]} */
    const urls = [];
    setFetch(async (url) => {
      urls.push(url);
      return reply(urls.length < 2 ? 500 : 200);
    });

    await fetchWithRetry((n) => `https://edge.test/download?cb=${n}`, {});
    expect(urls).toHaveLength(2);
    expect(new Set(urls).size).toBe(2);
  });

  it("gives up immediately on a 404, so failover starts without two pointless waits", async () => {
    let calls = 0;
    setFetch(async () => {
      calls += 1;
      return reply(404);
    });

    await expect(fetchWithRetry(() => "https://edge.test/x", {})).rejects.toThrow("HTTP 404");
    expect(calls).toBe(1);
  });

  it("stops on cancellation instead of retrying through it", async () => {
    const controller = new AbortController();
    let calls = 0;
    setFetch(async () => {
      calls += 1;
      controller.abort();
      throw new Error("network");
    });

    await expect(
      fetchWithRetry(() => "https://edge.test/x", {}, controller.signal),
    ).rejects.toBeInstanceOf(TestAborted);
    expect(calls).toBe(1);
  });

  it("treats the closing measurement window as the phase ending, not a failure to retry", async () => {
    // The internal deadline aborts in-flight requests when the window shuts.
    // Retrying there would extend the very window that just expired.
    const internal = new AbortController();
    internal.abort();
    let calls = 0;
    setFetch(async () => {
      calls += 1;
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });

    await expect(
      fetchWithRetry(() => "https://edge.test/x", { signal: internal.signal }),
    ).rejects.toBeInstanceOf(TestAborted);
    expect(calls).toBe(1);
  });
});

describe("withFailover", () => {
  const bad = customEndpoint("https://dead.test", "Dead");
  const good = customEndpoint("https://live.test", "Live");

  it("moves to the next edge and reports which one failed", async () => {
    /** @type {string[]} */
    const failed = [];
    const { value, endpoint } = await withFailover(
      [bad, good],
      async (e) => {
        if (e === bad) throw new Error("HTTP 502");
        return 42;
      },
      undefined,
      (e) => failed.push(e.name),
    );

    expect(value).toBe(42);
    expect(endpoint).toBe(good);
    expect(failed).toEqual(["Dead"]);
  });

  it("does not cascade through every candidate when the user cancels", async () => {
    let attempts = 0;
    await expect(
      withFailover([bad, good, cloudflareEndpoint], async () => {
        attempts += 1;
        throw new TestAborted();
      }),
    ).rejects.toBeInstanceOf(TestAborted);
    // Cancellation is the user's decision, not an endpoint fault: trying the
    // remaining two would ignore the stop button twice over.
    expect(attempts).toBe(1);
  });

  it("surfaces the last failure when nothing works, rather than a generic message", async () => {
    await expect(
      withFailover([bad, good], async (e) => {
        throw new Error(`${e.name} refused`);
      }),
    ).rejects.toThrow("Live refused");
  });
});

describe("server registry", () => {
  it("drops entries that could never be measured against", () => {
    const servers = normaliseServers([
      { id: "ok", url: "https://a.test", name: "A", city: "Mumbai", country: "IN" },
      { id: "dup", url: "https://b.test" },
      { id: "dup", url: "https://c.test" }, // same id twice
      { id: "insecure", url: "http://d.test" }, // blocked outright on an https page
      { id: "broken", url: "not a url" },
      { id: "", url: "https://e.test" },
      null,
    ]);

    // The first "dup" survives; the second, the http:// entry, the unparseable
    // URL, the id-less entry and the null are all gone.
    expect(servers.map((s) => s.id)).toEqual(["ok", "dup"]);
    expect(servers[1]?.url).toBe("https://b.test");
  });

  it("keeps a localhost entry, which is how the edge is developed against", () => {
    expect(normaliseServers([{ id: "dev", url: "http://localhost:8080" }])).toHaveLength(1);
  });

  it("strips a trailing slash so paths never double up", () => {
    expect(normaliseServers([{ id: "a", url: "https://a.test/" }])[0]?.url).toBe("https://a.test");
  });
});

describe("resolveEndpoint", () => {
  it("returns Cloudflare with no registry and without touching the network", async () => {
    // The default install has no self-hosted edges. Selection must therefore
    // cost nothing at all — not one probe, not one millisecond before the run.
    setFetch(async () => {
      throw new Error("the picker must not make requests here");
    });

    const choice = await resolveEndpoint(undefined, []);
    // Asserted on the contract — which edge, addressed how — rather than on
    // object identity across a module boundary, which a test runner that resets
    // its module registry can break without anything being wrong.
    expect(choice.endpoint.name).toBe(cloudflareEndpoint.name);
    expect(choice.endpoint.ping()).toBe(cloudflareEndpoint.ping());
    expect(choice.server).toBeNull();
    expect(choice.candidates).toHaveLength(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("ranks by measured latency, not by the city in the config", async () => {
    setFetch(async (url) => {
      const delay = String(url).includes("far.test") ? 120 : 10;
      await new Promise((r) => setTimeout(r, delay));
      return reply(200);
    });

    const ranked = await rankServers(
      [
        { id: "far", url: "https://far.test", name: "Far", city: "Mumbai", country: "IN" },
        { id: "near", url: "https://near.test", name: "Near", city: "Singapore", country: "SG" },
      ],
      undefined,
    );

    expect(ranked.map((r) => r.server.id)).toEqual(["near", "far"]);
    expect(ranked[0]?.latency).toBeLessThan(ranked[1]?.latency ?? Infinity);
  });

  it("discovers an edge that only answers on the pre-prefix paths", async () => {
    // A server deployed from an older image. Without discovery every request
    // would 404 and the run would fall back to Cloudflare for no real reason.
    setFetch(async (url) => reply(String(url).includes(API_PREFIX) ? 404 : 200));

    const ranked = await rankServers([
      { id: "old", url: "https://old.test", name: "Old", city: "", country: "" },
    ]);
    expect(ranked[0]?.prefix).toBe(LEGACY_PREFIX);
    expect(ranked[0]?.reachable).toBe(true);
  });

  it("puts Cloudflare last so a run can always complete against something", async () => {
    setFetch(async () => reply(200));
    const choice = await resolveEndpoint(undefined, [
      { id: "a", url: "https://a.test", name: "A", city: "", country: "" },
    ]);

    expect(choice.candidates).toHaveLength(2);
    expect(choice.candidates.at(-1)?.name).toBe(cloudflareEndpoint.name);
  });

  it("falls back to Cloudflare when every configured edge is unreachable", async () => {
    setFetch(async () => {
      throw new Error("unreachable");
    });

    const choice = await resolveEndpoint(undefined, [
      { id: "dead", url: "https://dead.test", name: "Dead", city: "", country: "" },
    ]);
    expect(choice.endpoint.name).toBe(cloudflareEndpoint.name);
    expect(choice.server).toBeNull();
  });
});

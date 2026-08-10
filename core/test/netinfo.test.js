/**
 * Edge detection must never hang the caller.
 *
 * The lookup goes to a speed-test domain, which ad blockers, corporate proxies
 * and captive portals block as a matter of routine. Without a deadline the
 * request sits open for as long as the browser allows — minutes — and any UI
 * awaiting it shows "Detecting…" forever with no way to tell a slow network from
 * a broken page.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { detectNetwork, localNetInfo } from "../netinfo.js";

const realFetch = globalThis.fetch;

afterEach(() => {
  /** @type {any} */ (globalThis).fetch = realFetch;
  vi.restoreAllMocks();
});

/** @param {(url: any, init?: any) => Promise<any>} impl */
function setFetch(impl) {
  /** @type {any} */ (globalThis).fetch = vi.fn(impl);
}

describe("localNetInfo", () => {
  it("returns usable facts with no network at all", () => {
    const info = localNetInfo();
    expect(info.browser).toBeTruthy();
    expect(info.os).toBeTruthy();
    expect(["Desktop", "Mobile", "Tablet"]).toContain(info.device);
    // Everything that needs the edge stays null rather than being guessed.
    expect(info.isp).toBeNull();
    expect(info.ip).toBeNull();
    expect(info.colo).toBeNull();
  });
});

describe("detectNetwork", () => {
  it("gives up at the deadline instead of hanging", async () => {
    // Never resolves unless aborted — the blocked-endpoint case.
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
    const info = await detectNetwork(undefined, 150);
    expect(Date.now() - started).toBeLessThan(2000);
    // Locally derived facts survive; network fields stay null.
    expect(info.browser).toBeTruthy();
    expect(info.isp).toBeNull();
  });

  it("resolves rather than throwing when the request fails outright", async () => {
    setFetch(async () => {
      throw new Error("blocked by client");
    });
    const info = await detectNetwork(undefined, 500);
    expect(info.isp).toBeNull();
    expect(info.browser).toBeTruthy();
  });

  it("degrades to local facts on a non-OK response", async () => {
    setFetch(async () => ({ ok: false, status: 403, json: async () => ({}) }));
    const info = await detectNetwork(undefined, 500);
    expect(info.isp).toBeNull();
  });

  it("reads a healthy response, including the object-form colo", async () => {
    setFetch(async () => ({
      ok: true,
      json: async () => ({
        clientIp: "203.0.113.9",
        asn: 9829,
        asOrganization: "Example Telecom",
        city: "Surat",
        country: "IN",
        httpProtocol: "HTTP/2",
        colo: { iata: "BOM", city: "Mumbai" },
      }),
    }));

    const info = await detectNetwork(undefined, 1000);
    expect(info.isp).toBe("Example Telecom");
    expect(info.ip).toBe("203.0.113.9");
    expect(info.ipVersion).toBe("IPv4");
    expect(info.colo).toBe("BOM");
    expect(info.edgeCity).toBe("Mumbai");
    expect(info.httpProtocol).toBe("HTTP/2");
  });

  it("detects IPv6 from the address shape", async () => {
    setFetch(async () => ({
      ok: true,
      json: async () => ({ clientIp: "2405:201:ab:1::1", colo: "BOM" }),
    }));
    expect((await detectNetwork(undefined, 1000)).ipVersion).toBe("IPv6");
  });

  it("honours a caller that aborts before the deadline", async () => {
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

    const controller = new AbortController();
    const pending = detectNetwork(controller.signal, 10_000);
    controller.abort();
    // Resolves to local facts, and does not wait out the 10s deadline.
    await expect(pending).resolves.toMatchObject({ isp: null });
  });
});

import { describe, expect, it } from "vitest";
import { LEGACY_PREFIX, bust, cloudflareEndpoint, customEndpoint } from "../endpoints.js";
import { clamp, pingGrade, qualityScores, requiredBandwidth } from "../scoring.js";
import { downloadDelta, loadHistory, saveHistoryEntry, clearHistory, HISTORY_LIMIT } from "../history.js";
import { decodeResult, encodeResult, resultFromHash, resultLink } from "../permalink.js";
import { parseUserAgent, readColo } from "../netinfo.js";

/** A localStorage stand-in, so history is testable without a browser. */
function memoryStore() {
  /** @type {Map<string, string>} */
  const map = new Map();
  return {
    /** @param {string} key */
    getItem: (key) => map.get(key) ?? null,
    /** @param {string} key @param {string} value */
    setItem: (key, value) => void map.set(key, value),
    /** @param {string} key */
    removeItem: (key) => void map.delete(key),
  };
}

describe("endpoints", () => {
  it("busts caches with the right separator", () => {
    expect(bust("https://x.test/ping", 7)).toMatch(/^https:\/\/x\.test\/ping\?cb=7&r=[0-9a-f]{16}$/);
    expect(bust("https://x.test/d?bytes=10", 7)).toMatch(
      /^https:\/\/x\.test\/d\?bytes=10&cb=7&r=[0-9a-f]{16}$/,
    );
  });

  it("never repeats a URL, so no cache anywhere on the path can answer twice", () => {
    const urls = new Set(Array.from({ length: 500 }, () => bust("https://x.test/ping", 7)));
    expect(urls.size).toBe(500);
  });

  it("builds Cloudflare and self-hosted URLs from the same shape", () => {
    expect(cloudflareEndpoint.down(100)).toContain("bytes=100");
    const mine = customEndpoint("https://edge.test/", "Mumbai");
    expect(mine.down(100)).toBe("https://edge.test/api/speedtest/download?bytes=100");
    expect(mine.up()).toBe("https://edge.test/api/speedtest/upload");
    expect(mine.ping()).toBe("https://edge.test/api/speedtest/ping");
  });

  it("still addresses an edge deployed before the /api/speedtest prefix existed", () => {
    // The picker discovers which form a host answers on. If this shape ever
    // stops being expressible, every already-deployed edge silently 404s and
    // the run falls back to Cloudflare without anyone noticing why.
    const old = customEndpoint("https://edge.test", "Mumbai", LEGACY_PREFIX);
    expect(old.down(100)).toBe("https://edge.test/download?bytes=100");
    expect(old.up()).toBe("https://edge.test/upload");
    expect(old.ping()).toBe("https://edge.test/ping");
  });

  it("exposes a resolver-timing URL only where one exists", () => {
    // Cloudflare's public speed endpoints have no DNS route. Advertising one
    // would send every DNS probe to a 404 and report the 404 as a lookup time.
    expect(cloudflareEndpoint.dns).toBeNull();
    expect(customEndpoint("https://edge.test").dns?.()).toBe("https://edge.test/api/speedtest/dns");
  });
});

describe("qualityScores", () => {
  const complete = { download: 500, upload: 200, ping: 10, jitter: 2, loss: 0, dns: 20, stability: 95 };

  it("returns null while a required input is missing, so nothing is scored from partial data", () => {
    expect(qualityScores({ ...complete, download: null })).toBeNull();
    expect(qualityScores({ ...complete, stability: null })).toBeNull();
  });

  it("tolerates a missing DNS reading, which is optional", () => {
    expect(qualityScores({ ...complete, dns: null })).not.toBeNull();
  });

  it("still scores a run whose upload could not be measured", () => {
    // A slow uplink can genuinely fail to complete a chunk inside the window.
    // Discarding the whole run for it threw away a download, ping, jitter, loss
    // and DNS figure that were all measured cleanly.
    const scores = qualityScores({ ...complete, upload: null });
    expect(scores).not.toBeNull();
    // The two scores that depend on upload say so instead of guessing.
    expect(scores?.video).toBeNull();
    expect(scores?.work).toBeNull();
    // The ones that do not are unaffected.
    expect(scores?.gaming).toBe(qualityScores(complete)?.gaming);
    expect(scores?.streaming).toBe(qualityScores(complete)?.streaming);
    // Health averages only what could be computed, so it never implies a figure
    // that was never measured.
    expect(scores?.health).toBeGreaterThan(0);
  });

  it("keeps every score inside 1-100", () => {
    const awful = qualityScores({ download: 1, upload: 0.5, ping: 900, jitter: 200, loss: 90, dns: 900, stability: 0 });
    const great = qualityScores(complete);
    for (const scores of [awful, great]) {
      expect(scores).not.toBeNull();
      Object.values(scores ?? {}).forEach((value) => {
        if (value === null) return;
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(100);
      });
    }
  });

  it("separates a working connection from a broken one on every score", () => {
    // The old model clamped at 20, so a usable 46/6 link with a 56ms ping scored
    // gaming 20 — the same number a 2 Mbps line with 400ms latency and 20% loss
    // received. A score that returns its floor for both is not measuring
    // anything, so each dimension must now rank them apart.
    const working = qualityScores({ download: 46, upload: 6, ping: 56, jitter: 16, loss: 0, dns: 29, stability: 74 });
    const broken = qualityScores({ download: 2, upload: 0.5, ping: 400, jitter: 90, loss: 20, dns: 300, stability: 5 });

    expect(working).not.toBeNull();
    expect(broken).not.toBeNull();
    for (const key of /** @type {const} */ (["health", "gaming", "streaming", "video", "work", "dns"])) {
      const better = working?.[key];
      const worse = broken?.[key];
      expect(better, `${key} should rank the working link higher`).toBeGreaterThan(worse ?? 0);
    }
  });

  it("orders fibre above mediocre above poor, rather than bunching them", () => {
    const fibre = qualityScores({ download: 500, upload: 200, ping: 8, jitter: 1, loss: 0, dns: 12, stability: 97 });
    const mediocre = qualityScores({ download: 50, upload: 10, ping: 40, jitter: 8, loss: 0, dns: 25, stability: 80 });
    const poor = qualityScores({ download: 8, upload: 1, ping: 180, jitter: 40, loss: 3, dns: 120, stability: 30 });

    expect(fibre?.health).toBeGreaterThan(mediocre?.health ?? 0);
    expect(mediocre?.health).toBeGreaterThan(poor?.health ?? 0);
    // And the gaps are meaningful, not a rounding difference.
    expect((fibre?.health ?? 0) - (poor?.health ?? 0)).toBeGreaterThan(40);
  });

  it("reports health consistent with the scores it summarises", () => {
    // Health used to be its own formula and could contradict the tiles beside
    // it — a poor health next to four healthy sub-scores.
    const scores = qualityScores(complete);
    const parts = [scores?.gaming, scores?.streaming, scores?.video, scores?.work, scores?.dns].filter(
      /** @returns {n is number} */ (n) => typeof n === "number",
    );
    const mean = parts.reduce((a, b) => a + b, 0) / parts.length;
    expect(Math.abs((scores?.health ?? 0) - mean)).toBeLessThanOrEqual(1);
  });

  it("drops only the DNS-dependent scores when DNS could not be measured", () => {
    const scores = qualityScores({ ...complete, dns: null });
    expect(scores?.dns).toBeNull();
    expect(scores?.work).toBeNull();
    // The four that do not need DNS still stand.
    expect(scores?.gaming).toBeGreaterThan(0);
    expect(scores?.streaming).toBeGreaterThan(0);
    expect(scores?.video).toBeGreaterThan(0);
    expect(scores?.health).toBeGreaterThan(0);
  });

  it("scores gaming on latency alone — a fast link with terrible ping still loses", () => {
    const fastButLaggy = qualityScores({ ...complete, download: 2000, ping: 180 });
    const slowButSnappy = qualityScores({ ...complete, download: 40, ping: 6 });
    expect(fastButLaggy?.gaming).toBeLessThan(slowButSnappy?.gaming ?? 0);
  });
});

describe("clamp / calculators", () => {
  it("clamps both ends", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
  });

  it("sizes a plan from household load", () => {
    expect(requiredBandwidth(0, 0, 0, 0).required).toBe(15);
    expect(requiredBandwidth(10, 4, 2, 3).advice).toContain("Mbps");
  });

  it("grades ping against a per-title target", () => {
    expect(pingGrade(10, 20).grade).toBe("A");
    expect(pingGrade(45, 20).grade).toBe("B");
    expect(pingGrade(75, 20).grade).toBe("C");
    expect(pingGrade(500, 20).grade).toBe("D");
  });
});

describe("history", () => {
  it("keeps newest first and caps the list", () => {
    const store = memoryStore();
    for (let i = 0; i < HISTORY_LIMIT + 5; i += 1) {
      saveHistoryEntry({ at: i, download: i, upload: 1, ping: 1 }, store);
    }
    const history = loadHistory(store);
    expect(history).toHaveLength(HISTORY_LIMIT);
    expect(history[0]?.at).toBe(HISTORY_LIMIT + 4);
  });

  it("survives a corrupt stored value instead of throwing on boot", () => {
    const store = memoryStore();
    store.setItem("wifiplus-history", "{not json");
    expect(loadHistory(store)).toEqual([]);
  });

  it("clears", () => {
    const store = memoryStore();
    saveHistoryEntry({ at: 1, download: 10, upload: 1, ping: 1 }, store);
    clearHistory(store);
    expect(loadHistory(store)).toEqual([]);
  });

  it("computes the change against the previous run, and nothing when there is none", () => {
    const now = { at: 2, download: 110, upload: 1, ping: 1 };
    const before = { at: 1, download: 100, upload: 1, ping: 1 };
    expect(downloadDelta(now, before)).toBeCloseTo(10);
    expect(downloadDelta(now, undefined)).toBeNull();
    expect(downloadDelta(now, { ...before, download: 0 })).toBeNull();
  });
});

describe("permalink", () => {
  const result = {
    download: 942.4, upload: 318.2, ping: 7, jitter: 1.2,
    loss: 0, dns: 18, stability: 96, isp: "Jio", edgeCity: "Mumbai", at: 1_750_000_000_000,
  };

  it("round-trips a result through the fragment", () => {
    expect(decodeResult(encodeResult(result))).toEqual(result);
  });

  it("produces a fragment-only link, so nothing reaches a server", () => {
    const link = resultLink(result, "https://wifiplus.test/");
    expect(link.startsWith("https://wifiplus.test/#result=")).toBe(true);
    expect(link).not.toMatch(/\?/);
  });

  it("survives non-ASCII in the ISP or city name", () => {
    const unicode = { ...result, isp: "Telefónica", edgeCity: "São Paulo" };
    expect(decodeResult(encodeResult(unicode))?.edgeCity).toBe("São Paulo");
  });

  it("returns null for a truncated or hand-edited link instead of throwing", () => {
    expect(decodeResult("!!!not-base64!!!")).toBeNull();
    expect(resultFromHash("#result=zzzz")).toBeNull();
    expect(resultFromHash("#nothing-here")).toBeNull();
  });

  it("reads a result out of a real hash", () => {
    expect(resultFromHash(`#result=${encodeResult(result)}`)?.download).toBe(942.4);
  });
});

describe("readColo", () => {
  it("reads the object form Cloudflare actually returns", () => {
    // Verbatim shape from https://speed.cloudflare.com/meta — reading this as a
    // string is what rendered "[object Object]" as the measurement edge.
    const raw = { iata: "BOM", lat: 19.0887, lon: 72.8679, cca2: "IN", region: "Asia Pacific", city: "Mumbai" };
    expect(readColo(raw)).toEqual({ code: "BOM", city: "Mumbai" });
  });

  it("prefers the reported city over the local lookup table", () => {
    expect(readColo({ iata: "BOM", city: "Navi Mumbai" }).city).toBe("Navi Mumbai");
  });

  it("still handles the bare string form, falling back to the table", () => {
    expect(readColo("LHR")).toEqual({ code: "LHR", city: "London" });
    expect(readColo("XYZ")).toEqual({ code: "XYZ", city: null });
  });

  it("returns nulls for a missing or unexpected value rather than an object", () => {
    expect(readColo(null)).toEqual({ code: null, city: null });
    expect(readColo(undefined)).toEqual({ code: null, city: null });
    expect(readColo("")).toEqual({ code: null, city: null });
    expect(readColo(42)).toEqual({ code: null, city: null });
    expect(readColo({ lat: 1 })).toEqual({ code: null, city: null });
  });
});

describe("parseUserAgent", () => {
  it("does not mistake Edge or Chrome for Safari", () => {
    const edge = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 Edg/120";
    const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
    const safari = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
    expect(parseUserAgent(edge).browser).toBe("Edge");
    expect(parseUserAgent(chrome).browser).toBe("Chrome");
    expect(parseUserAgent(safari).browser).toBe("Safari");
    expect(parseUserAgent(safari).os).toBe("macOS");
  });

  it("classifies device form factor", () => {
    expect(parseUserAgent("iPhone").device).toBe("Mobile");
    expect(parseUserAgent("iPad").device).toBe("Tablet");
    expect(parseUserAgent("Windows NT 10.0").device).toBe("Desktop");
  });
});

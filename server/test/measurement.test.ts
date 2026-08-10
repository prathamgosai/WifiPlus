import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";

/**
 * These drive the real Fastify app in-process via `inject()` — same routing,
 * parsing and streaming as production, no port bound. Every assertion checks a
 * genuinely measured quantity (bytes moved, headers set), never a mock.
 */
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(loadConfig({ MAX_DOWNLOAD_BYTES: "10485760", RATE_LIMIT_MAX: "100000" }));
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("GET /health", () => {
  it("reports ok with a normalised load figure", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.load).toBe("number");
    expect(body.cores).toBeGreaterThan(0);
  });
});

describe("GET /download", () => {
  it("streams exactly the requested number of bytes", async () => {
    const res = await app.inject({ method: "GET", url: "/download?bytes=1048576" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-length"]).toBe("1048576");
    expect(res.rawPayload.length).toBe(1048576);
  });

  it("disables caching and compression", async () => {
    const res = await app.inject({ method: "GET", url: "/download?bytes=1024" });
    expect(res.headers["cache-control"]).toContain("no-store");
    expect(res.headers["content-encoding"]).toBe("identity");
  });

  it("clamps an over-large request to the configured ceiling", async () => {
    const res = await app.inject({ method: "GET", url: "/download?bytes=999999999999" });
    expect(res.rawPayload.length).toBe(10485760); // MAX_DOWNLOAD_BYTES from config
  });

  it("treats a missing/garbage size as zero bytes", async () => {
    const res = await app.inject({ method: "GET", url: "/download?bytes=abc" });
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.length).toBe(0);
  });
});

describe("POST /upload", () => {
  it("counts the received bytes without buffering the whole body", async () => {
    const size = 262_144;
    const res = await app.inject({
      method: "POST",
      url: "/upload",
      headers: { "content-type": "application/octet-stream" },
      payload: Buffer.alloc(size),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.bytes).toBe(size);
    expect(typeof body.mbps).toBe("number");
  });
});

describe("GET /ping", () => {
  it("returns an uncached server timestamp", async () => {
    const res = await app.inject({ method: "GET", url: "/ping" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toContain("no-store");
    expect(typeof res.json().t).toBe("number");
  });
});

describe("GET /meta", () => {
  it("reports the observed client IP and negotiated protocol", async () => {
    const res = await app.inject({ method: "GET", url: "/meta" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("ip");
    expect(body.httpProtocol).toMatch(/^HTTP\//);
    expect(["IPv4", "IPv6"]).toContain(body.ipVersion);
  });
});

describe("the /api/speedtest prefix", () => {
  // Both surfaces are the same plugins mounted twice. If that ever becomes two
  // implementations, this is what notices.
  it.each(["/health", "/meta", "/ping", "/download?bytes=1024", "/servers", "/dns"])(
    "serves %s under both the prefixed and the bare path",
    async (path) => {
      const prefixed = await app.inject({ method: "GET", url: `/api/speedtest${path}` });
      const bare = await app.inject({ method: "GET", url: path });
      expect(prefixed.statusCode).toBe(200);
      expect(bare.statusCode).toBe(200);
    },
  );

  it("accepts an upload on the prefixed path", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/speedtest/upload",
      headers: { "content-type": "application/octet-stream" },
      payload: Buffer.alloc(65_536),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().bytes).toBe(65_536);
  });

  it("streams the requested bytes on the prefixed download too", async () => {
    const res = await app.inject({ method: "GET", url: "/api/speedtest/download?bytes=1048576" });
    expect(res.rawPayload.length).toBe(1_048_576);
    expect(res.headers["cache-control"]).toContain("no-store");
  });
});

describe("GET /servers", () => {
  it("always advertises itself, so a one-region deployment needs no config", async () => {
    const res = await app.inject({ method: "GET", url: "/api/speedtest/servers" });
    const { servers } = res.json();
    expect(servers).toHaveLength(1);
    expect(servers[0].id).toBe("local");
    expect(servers[0].url).toMatch(/^http/);
  });

  it("advertises configured peers alongside self, without duplicating self", async () => {
    const peered = await buildApp(
      loadConfig({
        REGION: "bom",
        PUBLIC_URL: "https://bom.speed.example.com",
        PEERS: JSON.stringify([
          { id: "sin", name: "Singapore", country: "SG", city: "Singapore", url: "https://sin.speed.example.com" },
          { id: "bom", name: "Duplicate of self", country: "IN", city: "Mumbai", url: "https://elsewhere.example.com" },
        ]),
      }),
    );
    await peered.ready();

    const { servers } = (await peered.inject({ method: "GET", url: "/api/speedtest/servers" })).json();
    expect(servers.map((s: { id: string }) => s.id)).toEqual(["bom", "sin"]);
    // Self wins: a peer entry claiming this region must not redirect clients
    // away from the server they are already talking to.
    expect(servers[0].url).toBe("https://bom.speed.example.com");
    await peered.close();
  });

  it("survives a malformed PEERS value instead of refusing to start", async () => {
    const broken = await buildApp(loadConfig({ PEERS: "{not json" }));
    await broken.ready();
    const { servers } = (await broken.inject({ method: "GET", url: "/servers" })).json();
    expect(servers).toHaveLength(1);
    await broken.close();
  });
});

describe("GET /dns", () => {
  it("times a genuine cold resolution, and labels whose resolver it measured", async () => {
    const res = await app.inject({ method: "GET", url: "/api/speedtest/dns" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // The label is random, so the answer cannot have come from a cache.
    expect(body.host).toMatch(/^[a-z0-9]+\.cloudflare\.com$/);
    // Never presented as the client's DNS — it is this server's.
    expect(body.scope).toBe("server");
    if (body.resolved) {
      expect(body.ms).toBeGreaterThan(0);
    } else {
      // A resolver that did not answer reports no time at all rather than the
      // time it took to fail.
      expect(body.ms).toBeNull();
    }
  }, 10_000);
});

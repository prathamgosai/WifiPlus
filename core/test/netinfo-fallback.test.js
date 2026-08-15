/**
 * The connection strip must degrade to the truth, not to blanks.
 *
 * `/meta` is not reliably reachable: it answers 403 to non-browser user agents,
 * and privacy extensions block `speed.cloudflare.com` by host. Every one of
 * those cases used to land in `detectNetwork`'s catch and paint "Provider
 * unavailable" over a perfectly working connection. These tests cover the
 * second and third sources that now stand behind it — the edge's own
 * `/cdn-cgi/trace`, and a Team Cymru ASN lookup over DNS-over-HTTPS — and the
 * point past which the honest answer really is "unavailable".
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { detectNetwork, lookupAsn, parseTrace } from "../netinfo.js";

const realFetch = globalThis.fetch;

afterEach(() => {
  /** @type {any} */ (globalThis).fetch = realFetch;
  vi.restoreAllMocks();
});

/** @param {(url: any, init?: any) => Promise<any>} impl */
function setFetch(impl) {
  /** @type {any} */ (globalThis).fetch = vi.fn(impl);
}

/** @param {any} body @param {string} [type] */
const ok = (body, type = "text") => ({
  ok: true,
  status: 200,
  text: async () => (type === "text" ? body : JSON.stringify(body)),
  json: async () => body,
});

const TRACE = ["fl=677f247", "ip=61.0.46.121", "colo=BOM", "loc=IN", "http=http/1.1", "tls=TLSv1.3"].join("\n");

/**
 * Team Cymru's two-step answer, as Cloudflare's DoH JSON returns it.
 * @param {string} data
 */
const cymru = (data) => ({ Status: 0, Answer: [{ data: `"${data}"` }] });

describe("parseTrace", () => {
  it("reads the key=value body the edge returns", () => {
    const parsed = parseTrace(TRACE);
    expect(parsed.ip).toBe("61.0.46.121");
    expect(parsed.colo).toBe("BOM");
    expect(parsed.loc).toBe("IN");
  });

  it("keeps values containing '=' intact rather than truncating them", () => {
    expect(parseTrace("sni=plaintext\nkex=X25519MLKEM768=x").kex).toBe("X25519MLKEM768=x");
  });

  it("ignores blank and malformed lines instead of throwing", () => {
    expect(parseTrace("\nip=1.2.3.4\ngarbage\n")).toEqual({ ip: "1.2.3.4" });
  });
});

describe("lookupAsn", () => {
  it("reads a real ASN and network name out of the two TXT records", () => {
    setFetch(async (url) => {
      // The origin query must reverse the octets, or it resolves nothing.
      if (String(url).includes("121.46.0.61.origin.asn.cymru.com")) {
        return ok(cymru("9829 | 61.0.32.0/20 | IN | apnic | 2000-01-11"), "json");
      }
      if (String(url).includes("AS9829.asn.cymru.com")) {
        return ok(cymru("9829 | IN | apnic | 2000-01-19 | BSNL-NIB - National Internet Backbone, IN"), "json");
      }
      throw new Error(`unexpected query: ${url}`);
    });

    return expect(lookupAsn("61.0.46.121")).resolves.toEqual({
      asn: 9829,
      isp: "BSNL-NIB - National Internet Backbone, IN",
    });
  });

  it("still reports the number when the name lookup fails", async () => {
    setFetch(async (url) =>
      String(url).includes("origin.asn")
        ? ok(cymru("9829 | 61.0.32.0/20 | IN | apnic | 2000-01-11"), "json")
        : { ok: false, status: 502, json: async () => ({}) },
    );
    await expect(lookupAsn("61.0.46.121")).resolves.toEqual({ asn: 9829, isp: null });
  });

  it("declines IPv6 rather than mislabelling a provider", async () => {
    // Cymru wants a nibble-reversed form for v6. Half-implementing that would
    // return someone else's ASN, which is worse than returning nothing.
    setFetch(async () => {
      throw new Error("must not be queried");
    });
    await expect(lookupAsn("2606:4700::1111")).resolves.toBeNull();
  });

  it("returns null when the resolver is unreachable", async () => {
    setFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(lookupAsn("61.0.46.121")).resolves.toBeNull();
  });
});

describe("detectNetwork fallbacks", () => {
  it("prefers /meta when it answers with an address", async () => {
    setFetch(async (url) => {
      if (String(url).includes("/meta")) {
        return ok({ clientIp: "1.2.3.4", asOrganization: "Example ISP", asn: 64500, colo: "LHR" }, "json");
      }
      throw new Error("trace must not be needed");
    });

    const net = await detectNetwork();
    expect(net.ip).toBe("1.2.3.4");
    expect(net.isp).toBe("Example ISP");
    expect(net.asn).toBe(64500);
    expect(net.edgeCity).toBe("London");
  });

  it("falls back to /cdn-cgi/trace and enriches the ASN when /meta is blocked", async () => {
    setFetch(async (url) => {
      const href = String(url);
      // Exactly how an extension blocking the host presents itself to fetch.
      if (href.includes("/meta")) throw new TypeError("Failed to fetch");
      if (href.includes("cdn-cgi/trace")) return ok(TRACE);
      if (href.includes("origin.asn.cymru.com")) {
        return ok(cymru("9829 | 61.0.32.0/20 | IN | apnic | 2000-01-11"), "json");
      }
      if (href.includes("AS9829.asn.cymru.com")) {
        return ok(cymru("9829 | IN | apnic | 2000-01-19 | BSNL-NIB - National Internet Backbone, IN"), "json");
      }
      throw new Error(`unexpected: ${href}`);
    });

    const net = await detectNetwork();
    expect(net.ip).toBe("61.0.46.121");
    expect(net.ipVersion).toBe("IPv4");
    expect(net.asn).toBe(9829);
    expect(net.isp).toBe("BSNL-NIB - National Internet Backbone, IN");
    expect(net.colo).toBe("BOM");
    expect(net.edgeCity).toBe("Mumbai");
    expect(net.httpProtocol).toBe("HTTP/1.1");
    // `loc` is the country the edge sees, not a city — it must not be shown as one.
    expect(net.country).toBe("IN");
    expect(net.city).toBeNull();
  });

  it("falls through when /meta returns 200 but carries no address", async () => {
    // The exact shape of the 403-with-empty-body case, which passed the `ok`
    // check on some paths and produced a strip of nulls.
    setFetch(async (url) =>
      String(url).includes("/meta") ? ok({}, "json") : String(url).includes("trace") ? ok(TRACE) : ok(cymru("9829 | x | IN | apnic | x"), "json"),
    );
    await expect(detectNetwork()).resolves.toMatchObject({ ip: "61.0.46.121" });
  });

  it("reports nothing rather than something when every source is blocked", async () => {
    setFetch(async () => {
      throw new TypeError("Failed to fetch");
    });

    const net = await detectNetwork();
    expect(net.ip).toBeNull();
    expect(net.isp).toBeNull();
    expect(net.asn).toBeNull();
    expect(net.colo).toBeNull();
    // Locally derivable facts still survive — they need no network.
    expect(net.browser).toBeTruthy();
    expect(net.os).toBeTruthy();
  });
});

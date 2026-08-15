/**
 * Real client + edge detection.
 * -----------------------------------------------------------------------------
 * Every field here is observed, never fabricated. The network facts come from
 * Cloudflare's public `meta` endpoint — the same one Cloudflare's own speed test
 * uses — which reports how the connection actually appears at the edge: real
 * client IP, real ASN + ISP name, and the real data centre serving the request.
 * Browser/OS/device are parsed from the user agent the browser sends.
 */

const META_URL = "https://speed.cloudflare.com/meta";

/**
 * Fallback source for the same facts.
 *
 * `/meta` is a JSON convenience route and it is not always reachable: it returns
 * 403 to non-browser user agents, and privacy extensions block the whole
 * `speed.cloudflare.com` host by name. Either way `detectNetwork` fell straight
 * through to its catch and the strip showed "Provider unavailable" on a working
 * connection. `/cdn-cgi/trace` is the edge's own diagnostic, served from every
 * Cloudflare property with `Access-Control-Allow-Origin: *`, and it reports the
 * client IP, the serving colo, the country and the negotiated protocol.
 */
const TRACE_URL = "https://speed.cloudflare.com/cdn-cgi/trace";

/**
 * DNS-over-HTTPS resolver used for the ASN lookup below. Already the resolver
 * the DNS-latency measurement times, so this adds no new host to the CSP.
 */
const DOH_URL = "https://cloudflare-dns.com/dns-query";

/** Deadline for the ASN enrichment. Advisory data must not delay the strip. */
const ASN_TIMEOUT_MS = 2500;

/**
 * Parse the `key=value` lines of a `/cdn-cgi/trace` response.
 *
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseTrace(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of text.split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0) out[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return out;
}

/**
 * Real ASN and network name for an IP, from Team Cymru's public IP-to-ASN
 * service, queried over DNS-over-HTTPS.
 *
 * This is a genuine lookup, not a guess: `<reversed-ip>.origin.asn.cymru.com`
 * returns a TXT record of "ASN | prefix | country | registry | date", and
 * `AS<n>.asn.cymru.com` returns that ASN's registered name. It exists because
 * `/cdn-cgi/trace` reports the address but not who announces it, and the
 * Provider tile has to say something true or say nothing.
 *
 * IPv6 is not attempted — the nibble-reversed form Cymru wants for v6 is a
 * different construction, and returning null is better than half-implementing
 * it and mislabelling someone's provider.
 *
 * @param {string} ip
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ asn: number, isp: string | null } | null>}
 */
export async function lookupAsn(ip, signal) {
  if (!ip || ip.includes(":")) return null;
  const octets = ip.split(".");
  if (octets.length !== 4) return null;

  const controller = new AbortController();
  const onOuterAbort = () => controller.abort();
  signal?.addEventListener("abort", onOuterAbort);
  const timer = setTimeout(() => controller.abort(), ASN_TIMEOUT_MS);

  /**
   * @param {string} name
   * @returns {Promise<string | null>} first TXT record, unquoted
   */
  const txt = async (name) => {
    const res = await fetch(`${DOH_URL}?name=${name}&type=TXT`, {
      headers: { accept: "application/dns-json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = await res.json();
    const data = body?.Answer?.[0]?.data;
    return typeof data === "string" ? data.replace(/"/g, "") : null;
  };

  try {
    const origin = await txt(`${octets.reverse().join(".")}.origin.asn.cymru.com`);
    if (!origin) return null;
    const asn = Number(origin.split("|")[0]?.trim());
    if (!Number.isFinite(asn) || asn <= 0) return null;

    // The name is a nicety on top of the number; a failure here still leaves a
    // real ASN to show.
    const described = await txt(`AS${asn}.asn.cymru.com`).catch(() => null);
    // "9829 | IN | apnic | 2000-01-19 | BSNL-NIB - National Internet Backbone, IN"
    const name = described?.split("|")[4]?.trim() || null;
    return { asn, isp: name };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onOuterAbort);
  }
}

/**
 * Deadline for the edge lookup.
 *
 * Without one, a blocked or slow request leaves the caller awaiting for as long
 * as the browser's own timeout — minutes — and any UI waiting on it sits on
 * "Detecting…" forever with no explanation. Ad blockers and corporate proxies
 * block speed-test domains routinely, so this is a normal case, not an edge one.
 * Six seconds is far beyond a healthy lookup and short enough not to look broken.
 */
export const META_TIMEOUT_MS = 6000;

/**
 * A subset of Cloudflare colo codes → city. Cloudflare has 300+ edges; this
 * covers the busiest so the common case shows a real city, and anything
 * unmapped falls back to the raw code (still real, just less friendly).
 *
 * @type {Record<string, string>}
 */
export const COLO_CITY = {
  BOM: "Mumbai", DEL: "Delhi", MAA: "Chennai", BLR: "Bengaluru", HYD: "Hyderabad", CCU: "Kolkata",
  SIN: "Singapore", HKG: "Hong Kong", NRT: "Tokyo", KIX: "Osaka", ICN: "Seoul", TPE: "Taipei",
  DXB: "Dubai", DOH: "Doha", RUH: "Riyadh", BAH: "Manama", KWI: "Kuwait City", TLV: "Tel Aviv",
  LHR: "London", MAN: "Manchester", CDG: "Paris", FRA: "Frankfurt", AMS: "Amsterdam", MAD: "Madrid",
  MXP: "Milan", ARN: "Stockholm", DUB: "Dublin", ZRH: "Zurich", VIE: "Vienna", WAW: "Warsaw",
  IAD: "Ashburn", EWR: "Newark", ORD: "Chicago", DFW: "Dallas", LAX: "Los Angeles", SJC: "San Jose",
  SEA: "Seattle", MIA: "Miami", ATL: "Atlanta", DEN: "Denver", YYZ: "Toronto", YVR: "Vancouver",
  GRU: "São Paulo", GIG: "Rio de Janeiro", EZE: "Buenos Aires", SCL: "Santiago", BOG: "Bogotá",
  SYD: "Sydney", MEL: "Melbourne", PER: "Perth", AKL: "Auckland",
  JNB: "Johannesburg", CPT: "Cape Town", NBO: "Nairobi", LOS: "Lagos", CAI: "Cairo", CMN: "Casablanca",
};

/**
 * @typedef {object} ClientInfo
 * @property {string} browser
 * @property {string} os
 * @property {"Desktop" | "Mobile" | "Tablet"} device
 */

/**
 * @typedef {ClientInfo & {
 *   ip: string | null,
 *   ipVersion: "IPv4" | "IPv6" | null,
 *   isp: string | null,
 *   asn: number | null,
 *   colo: string | null,
 *   edgeCity: string | null,
 *   city: string | null,
 *   region: string | null,
 *   country: string | null,
 *   httpProtocol: string | null,
 * }} NetInfo
 */

/**
 * Cloudflare reports the serving edge in two different shapes depending on the
 * endpoint: a bare IATA string ("BOM"), or an object carrying the code plus the
 * city it sits in. Reading it as a string produced a literal "[object Object]"
 * on screen. When the object form is present its `city` is authoritative and
 * better than the table above, which is only the fallback for the string form.
 *
 * @param {unknown} raw
 * @returns {{ code: string | null, city: string | null }}
 */
export function readColo(raw) {
  if (typeof raw === "string" && raw) {
    return { code: raw, city: COLO_CITY[raw] ?? null };
  }
  if (raw && typeof raw === "object") {
    const colo = /** @type {{ iata?: unknown, city?: unknown }} */ (raw);
    const code = typeof colo.iata === "string" ? colo.iata : null;
    const city =
      typeof colo.city === "string" && colo.city ? colo.city : code ? (COLO_CITY[code] ?? null) : null;
    return { code, city };
  }
  return { code: null, city: null };
}

/**
 * @param {string} ua
 * @returns {ClientInfo}
 */
export function parseUserAgent(ua) {
  const device = /iPad|Tablet/i.test(ua)
    ? "Tablet"
    : /Mobi|Android|iPhone|iPod/i.test(ua)
      ? "Mobile"
      : "Desktop";

  const os = /Windows NT/i.test(ua)
    ? "Windows"
    : /Mac OS X|Macintosh/i.test(ua)
      ? "macOS"
      : /Android/i.test(ua)
        ? "Android"
        : /iPhone|iPad|iPod/i.test(ua)
          ? "iOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "Unknown";

  // Order matters: Edge and Chrome both contain "Chrome"; Chrome contains "Safari".
  const browser = /Edg\//i.test(ua)
    ? "Edge"
    : /OPR\/|Opera/i.test(ua)
      ? "Opera"
      : /Firefox\//i.test(ua)
        ? "Firefox"
        : /Chrome\//i.test(ua)
          ? "Chrome"
          : /Safari\//i.test(ua)
            ? "Safari"
            : "Browser";

  return { browser, os, device };
}

/**
 * Locally derivable facts — browser, OS, device. No network involved, so a UI
 * can paint these immediately instead of holding the whole strip hostage to a
 * request that may never come back.
 *
 * @returns {NetInfo} network fields null until the lookup resolves
 */
export function localNetInfo() {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  return {
    ip: null,
    ipVersion: null,
    isp: null,
    asn: null,
    colo: null,
    edgeCity: null,
    city: null,
    region: null,
    country: null,
    httpProtocol: null,
    ...parseUserAgent(ua),
  };
}

/**
 * @param {AbortSignal} [signal]
 * @param {number} [timeoutMs]
 * @returns {Promise<NetInfo>} always resolves; network fields stay null on failure
 */
export async function detectNetwork(signal, timeoutMs = META_TIMEOUT_MS) {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;

  /** @type {NetInfo} */
  const base = {
    ip: null,
    ipVersion: null,
    isp: null,
    asn: null,
    colo: null,
    edgeCity: null,
    city: null,
    region: null,
    country: null,
    httpProtocol: null,
    ...parseUserAgent(ua),
  };

  // Own controller so the deadline can cancel the request, while still honouring
  // a caller that aborts first.
  const internal = new AbortController();
  const onOuterAbort = () => internal.abort();
  signal?.addEventListener("abort", onOuterAbort);
  const timer = setTimeout(() => internal.abort(), timeoutMs);

  try {
    // Preferred source: one request, everything enriched, including the ISP name
    // Cloudflare already knows.
    try {
      const res = await fetch(META_URL, { cache: "no-store", signal: internal.signal });
      if (res.ok) {
        const meta = await res.json();
        const ip = meta.clientIp ?? null;
        const colo = readColo(meta.colo);
        // A 200 carrying no address is not a usable answer — fall through to the
        // trace route rather than painting a strip of nulls.
        if (ip) {
          return {
            ...base,
            ip,
            ipVersion: ip.includes(":") ? "IPv6" : "IPv4",
            isp: meta.asOrganization ?? null,
            asn: typeof meta.asn === "number" ? meta.asn : null,
            colo: colo.code,
            edgeCity: colo.city,
            city: meta.city ?? null,
            region: meta.region ?? null,
            country: meta.country ?? null,
            httpProtocol: meta.httpProtocol ?? null,
          };
        }
      }
    } catch {
      /* blocked or refused — the trace route below is the second opinion */
    }

    // The deadline (or the caller) may have fired while the first attempt was
    // in flight, and the catch above cannot tell that apart from a refusal.
    // Without this check the fallback issues a SECOND request against an
    // already-aborted signal, so a deadline meant to bound the whole lookup
    // bounded only its first half — and against an endpoint that never answers,
    // it hung indefinitely.
    if (internal.signal.aborted) return base;

    // Fallback: the edge's own diagnostic. Same facts, minus the ASN, which the
    // Cymru lookup then supplies from DNS.
    const traceRes = await fetch(`${TRACE_URL}?cb=${Date.now()}`, {
      cache: "no-store",
      signal: internal.signal,
    });
    if (!traceRes.ok) return base;
    const trace = parseTrace(await traceRes.text());

    const ip = trace.ip || null;
    if (!ip) return base;
    const colo = readColo(trace.colo);
    const asn = await lookupAsn(ip, internal.signal);

    return {
      ...base,
      ip,
      ipVersion: ip.includes(":") ? "IPv6" : "IPv4",
      isp: asn?.isp ?? null,
      asn: asn?.asn ?? null,
      colo: colo.code,
      edgeCity: colo.city,
      city: null,
      region: null,
      // `loc` is the country the edge sees, which is the only geography this
      // route reports. It is not a city, so it must not be shown as one.
      country: trace.loc || null,
      httpProtocol: trace.http ? trace.http.toUpperCase() : null,
    };
  } catch {
    // Blocked, offline, or past the deadline — return what could be derived
    // locally rather than inventing a provider or hanging the caller.
    return base;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onOuterAbort);
  }
}

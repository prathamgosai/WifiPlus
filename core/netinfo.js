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
    const res = await fetch(META_URL, { cache: "no-store", signal: internal.signal });
    if (!res.ok) return base;
    const meta = await res.json();

    const ip = meta.clientIp ?? null;
    const colo = readColo(meta.colo);

    return {
      ...base,
      ip,
      ipVersion: ip ? (ip.includes(":") ? "IPv6" : "IPv4") : null,
      isp: meta.asOrganization ?? null,
      asn: typeof meta.asn === "number" ? meta.asn : null,
      colo: colo.code,
      edgeCity: colo.city,
      city: meta.city ?? null,
      region: meta.region ?? null,
      country: meta.country ?? null,
      httpProtocol: meta.httpProtocol ?? null,
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

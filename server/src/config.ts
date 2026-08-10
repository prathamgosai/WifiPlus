/**
 * Runtime configuration, read once from the environment. Every deployed region
 * gets the same image with a different REGION/SERVER_NAME, so the frontend's
 * server registry can identify which edge answered.
 */

function num(value: string | undefined, fallback: number): number {
  const n = value === undefined ? NaN : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** One entry of the registry served by /api/speedtest/servers. */
export interface PeerServer {
  id: string;
  name: string;
  country: string;
  city: string;
  url: string;
  lat?: number;
  lon?: number;
}

export interface Config {
  host: string;
  port: number;
  /** Short region id, e.g. "bom", "sin". Reported in /health and /meta. */
  region: string;
  serverName: string;
  country: string;
  city: string;
  /**
   * Externally reachable base URL of THIS server, as a browser would address it.
   * Cannot be derived from the request: behind a proxy the Host header is
   * whatever the proxy passes on, and getting it wrong hands clients a URL that
   * resolves nowhere.
   */
  publicUrl: string;
  /** Sibling edges to advertise alongside this one. */
  peers: PeerServer[];
  lat: number | null;
  lon: number | null;
  /** CORS allow-list. Empty array = reflect any origin (dev only). */
  allowedOrigins: string[];
  /** Hard ceiling on a single download response, in bytes. */
  maxDownloadBytes: number;
  /** Hard ceiling on a single upload body, in bytes. */
  maxUploadBytes: number;
  /** Requests per window per IP for NON-measurement routes. */
  rateLimitMax: number;
  rateLimitWindowMs: number;
  /** Trust X-Forwarded-For (true when behind NGINX / Cloudflare). */
  trustProxy: boolean;
  logLevel: string;
}

/** Optional numeric env var — null rather than 0, which is a real coordinate. */
function optionalNum(value: string | undefined): number | null {
  if (value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Peers come in as a JSON array. A malformed value yields an empty list rather
 * than a crash loop: a typo in one region's env should cost that region's peer
 * advertisement, not the whole edge's ability to serve measurements.
 */
function peerList(value: string | undefined): PeerServer[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is PeerServer =>
        !!p && typeof p === "object" && typeof p.id === "string" && typeof p.url === "string",
    );
  } catch {
    return [];
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = num(env.PORT, 8080);
  return {
    host: env.HOST ?? "0.0.0.0",
    port,
    region: env.REGION ?? "local",
    serverName: env.SERVER_NAME ?? "WifiPlus Edge (local)",
    country: env.COUNTRY ?? "—",
    city: env.CITY ?? "Local",
    // Falls back to the loopback address it is actually listening on, which is
    // right for development and obviously wrong in production — where PUBLIC_URL
    // is set. Advertising a guess derived from the Host header would be wrong in
    // a way that is much harder to notice.
    publicUrl: (env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, ""),
    peers: peerList(env.PEERS),
    lat: optionalNum(env.LAT),
    lon: optionalNum(env.LON),
    allowedOrigins: list(env.ALLOWED_ORIGINS),
    // 1 GiB default ceiling — matches the largest advertised download size.
    maxDownloadBytes: num(env.MAX_DOWNLOAD_BYTES, 1024 * 1024 * 1024),
    maxUploadBytes: num(env.MAX_UPLOAD_BYTES, 512 * 1024 * 1024),
    // Measurement routes are exempt from this; it only guards the metadata
    // routes so a shared server image can't be trivially hammered.
    rateLimitMax: num(env.RATE_LIMIT_MAX, 600),
    rateLimitWindowMs: num(env.RATE_LIMIT_WINDOW_MS, 60_000),
    trustProxy: (env.TRUST_PROXY ?? "true") !== "false",
    logLevel: env.LOG_LEVEL ?? "info",
  };
}

/**
 * Real client + edge detection — re-exported from the shared engine in `core/`.
 *
 * Every field is observed at Cloudflare's edge or parsed from the user agent the
 * browser sends; nothing is fabricated. Shared with the static site so both
 * front ends identify a connection the same way.
 */
export {
  COLO_CITY,
  META_TIMEOUT_MS,
  detectNetwork,
  localNetInfo,
  parseUserAgent,
  readColo,
} from "@core/netinfo.js";
export type { ClientInfo, NetInfo } from "@core/netinfo.js";

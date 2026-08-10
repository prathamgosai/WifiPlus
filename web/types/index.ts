/** Shared domain contracts. Kept free of React so lib/ stays unit-testable. */

export type Region =
  | "North America"
  | "South America"
  | "Europe"
  | "Asia"
  | "Middle East"
  | "Africa"
  | "Australia & Oceania"
  | "Satellite";

export interface Provider {
  name: string;
  country: string;
  /** ISO 3166-1 alpha-2, or "GL" for globally available services. */
  code: string;
  region: Region;
  state: string;
  city: string;
  type: string;
  ownership: string;
  plan: string;
  /** Illustrative sample figures — see the data notice shown in the UI. */
  download: number;
  upload: number;
  ping: number;
  jitter: number;
  loss: number;
  price: number;
  currency: string;
  coverage: number;
  reliability: number;
  uptime: number;
  rating: number;
  dataCap: string;
  gaming: number;
  streaming: number;
  remote: number;
}

export type UsageProfile = "balanced" | "gaming" | "streaming" | "remote" | "enterprise";

export type RankingKey = "world" | "gaming" | "streaming" | "remote" | "value";

export type SortKey = "download" | "upload" | "ping" | "reliability" | "value";

/**
 * Live readings from the measurement engine, and the scores derived from them.
 *
 * Re-exported from `core/scoring.js` rather than restated here. These were
 * hand-copied duplicates, and they had already drifted: when `video` became
 * nullable in core — because upload can genuinely fail to measure on a bad
 * uplink — this copy still promised a number, and the only thing that noticed
 * was the compiler refusing to accept core's own return value. A second
 * declaration of a shared shape is a bug with a delay on it.
 */
export type { SpeedResult, QualityScores } from "@core/scoring.js";

export type TestPhase =
  | "idle"
  | "latency"
  | "download"
  | "upload"
  | "dns"
  | "bufferbloat"
  | "done"
  | "error";

export type DoctorCategory = "security" | "channels" | "placement" | "performance";

export interface DoctorFinding {
  category: DoctorCategory;
  title: string;
  detail: string;
}

export interface AnalyzerResponse {
  is_router_screenshot: boolean;
  findings: DoctorFinding[];
}

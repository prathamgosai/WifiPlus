/**
 * Single source of truth for anything environment-shaped. `scripts/set-domain.mjs`
 * in the repo root rewrites the placeholder host; keep that one string in sync.
 */

export const site = {
  name: "WifiPlus",
  title: "WifiPlus — Free Internet Speed Test, WiFi Analyzer & ISP Comparison",
  shortDescription:
    "Measure real download, upload, ping, jitter and packet loss in your browser. Diagnose WiFi problems and compare ISPs across 24 countries — free, no signup.",
  url: "https://wifiplus.prathamgosai.in",
  author: {
    name: "Pratham Gosai",
    url: "https://prathamgosai.in/",
  },
  repo: "https://github.com/prathamgosai/WifiPlus",
  /** Cloudflare Worker that holds the Anthropic key for router screenshot analysis. */
  analyzerEndpoint: "https://wifiplus-router-analyzer.example.workers.dev",
} as const;

/** Anchor targets used by the navbar, footer and in-page CTAs. */
export const navLinks = [
  { href: "#speed-test", label: "Speed Test" },
  { href: "#features", label: "Platform" },
  { href: "#intelligence", label: "ISP Data" },
  { href: "#compare", label: "Compare" },
  { href: "#pricing", label: "Pricing" },
  { href: "#doctor", label: "AI Doctor" },
] as const;

import type { Provider, UsageProfile } from "@/types";
import { clamp } from "./utils";

/**
 * Weighted 0-100 fit score for a provider against a user's stated needs.
 * Component weights sum to 100 so the number is directly readable as a percentage.
 *
 *   speed 26 · upload 12 · latency 18 · reliability 16 · coverage 8 · value 12 · usage 14
 */
export function scoreProvider(
  provider: Provider,
  usage: UsageProfile = "balanced",
  budget = 999,
  gamingNeed = 5,
  streamingNeed = 5,
): number {
  const speed = clamp((provider.download / 1000) * 26, 0, 26);
  const upload = clamp((provider.upload / 700) * 12, 0, 12);
  const latency = clamp(18 - provider.ping / 3 - provider.jitter / 3, 0, 18);
  const reliability = provider.reliability * 0.16;
  const coverage = provider.coverage * 0.08;
  // Over budget decays gradually rather than disqualifying — a $5 overshoot on a
  // clearly better plan should still surface.
  const value = provider.price <= budget ? 12 : clamp(12 - (provider.price - budget) / 6, 0, 12);

  const usageScore =
    usage === "gaming"
      ? provider.gaming * 0.14
      : usage === "streaming"
        ? provider.streaming * 0.14
        : usage === "remote" || usage === "enterprise"
          ? provider.remote * 0.14
          : (provider.gaming * gamingNeed + provider.streaming * streamingNeed + provider.remote * 5) / 200;

  return Math.round(speed + upload + latency + reliability + coverage + value + usageScore);
}

/**
 * The rest of the scoring model — quality scores, verdicts and the two
 * calculators — is shared with the static site, so it lives in `core/scoring.js`
 * and is re-exported here. `scoreProvider` above stays local because provider
 * matching only exists in this app.
 */
export {
  bufferbloatVerdict,
  healthVerdict,
  pingGrade,
  qualityScores,
  requiredBandwidth,
} from "@core/scoring.js";

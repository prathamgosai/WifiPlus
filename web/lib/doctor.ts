import { bottleneck, diagnosisConfidence, suitability } from "@core/health.js";
import { bufferbloatVerdict } from "@core/scoring.js";
import type { BufferbloatResult } from "@/lib/speedtest";
import type { SpeedResult } from "@/types";

/**
 * The Network Doctor's copy layer.
 * -----------------------------------------------------------------------------
 * The ANALYSIS is not here. `core/health.js` already decides which hop the
 * readings point at (`bottleneck`), what the link is good for (`suitability`)
 * and how much weight the verdict carries (`diagnosisConfidence`), and it is
 * unit-tested alongside the engine. This module only decides what to SAY about
 * a finding that module has already made.
 *
 * Two rules govern everything below.
 *
 * FIRST: a recommendation is labelled as a recommendation. The findings are
 * inferred from measurements by stated rules; the fixes are advice. Presenting
 * advice in the same voice as a reading is how a speed test starts sounding
 * like it can see inside a router.
 *
 * SECOND: confidence is High / Medium / Low, not a percentage. The brief this
 * was built from asked for "CONFIDENCE 87%", and there is no calculation in
 * this codebase that would produce an 87 — `diagnosisConfidence` returns one of
 * three bands based on how many inputs were measured. Rendering a spurious
 * two-significant-figure number next to a real one would make the honest
 * figures on the page look invented too, which costs more than the polish gains.
 */

export type FindingTone = "ok" | "suspect" | "unknown";

export interface DoctorFix {
  /** Imperative, one action. */
  step: string;
  /** Why this step follows from the finding. */
  because: string;
}

export interface Diagnosis {
  /** One sentence, plain language, describing what the run found. */
  headline: string;
  /** The hop the readings point at, or null when nothing is flagged. */
  issue: string | null;
  tone: FindingTone;
  confidence: "High" | "Medium" | "Low";
  /** Why the confidence is what it is. Never a bare label. */
  confidenceReason: string;
  /** What the finding means for everyday use. */
  matters: string;
  fixes: DoctorFix[];
  hops: Array<{ hop: string; flag: FindingTone; note: string }>;
  suitability: Array<{ key: string; level: string; note: string }>;
}

/** Human labels for the hops `core/health.js` reports on. */
export const HOP_LABEL: Record<string, string> = {
  device: "Your device",
  wifi: "WiFi link",
  router: "Router",
  isp: "ISP",
  internet: "Measurement edge",
};

/**
 * Fixes per flagged hop.
 *
 * Every entry is advice a person can act on without buying anything, ordered so
 * the cheapest and most reversible step comes first. "Re-test" closes each list
 * because a fix nobody verified is a guess.
 */
const FIXES: Record<string, DoctorFix[]> = {
  wifi: [
    { step: "Move closer to the router, or remove what is between you and it.", because: "Jitter and probe loss rise with distance and obstruction long before average speed drops." },
    { step: "Switch to the 5 GHz or 6 GHz band if your router offers one.", because: "2.4 GHz is shared with far more neighbouring networks and household devices." },
    { step: "Re-test over Ethernet to confirm the wireless link is the cause.", because: "If the numbers hold up wired, the problem is between your device and the router." },
  ],
  router: [
    { step: "Enable Smart Queue Management (SQM), CAKE or fq_codel on your router.", because: "Bufferbloat is a queue that is allowed to grow too long. SQM keeps it short." },
    { step: "If SQM is unavailable, enable QoS and set it to about 90% of your measured speed.", because: "Leaving headroom stops the queue filling in the first place." },
    { step: "Re-test and compare the bufferbloat grade.", because: "The grade is the direct measurement of whether the change worked." },
  ],
  isp: [
    { step: "Re-test at a different time of day.", because: "Access networks congest at peak hours, and a single run cannot tell a busy hour from a bad line." },
    { step: "Check whether the measured speed matches the plan you pay for.", because: "A line consistently well under its plan is a fault to report, not a setting to tune." },
    { step: "Test over Ethernet before contacting your provider.", because: "A wired result rules out your own network and is the first thing they will ask for." },
  ],
  device: [
    { step: "Close other tabs and downloads, then re-test with this tab in the foreground.", because: "A throttled or backgrounded tab produces numbers about the CPU, not the link." },
  ],
};

const OK_FIXES: DoctorFix[] = [
  { step: "Re-test at a busy hour to see how the line holds up.", because: "A clean result at a quiet time does not prove a line is clean at peak." },
  { step: "Re-test over WiFi from the room you actually work in.", because: "The connection that matters is the one where you use it, not the one beside the router." },
];

const num = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * Turn a completed run into a diagnosis.
 *
 * Returns null while the deciding inputs are missing, so the UI shows its empty
 * state rather than a verdict derived from a partial run.
 */
export function diagnose(
  result: SpeedResult,
  bufferbloat: BufferbloatResult | null,
  context: { degraded?: boolean; edgeLabel?: string | null } = {},
): Diagnosis | null {
  if (!num(result.download) || !num(result.ping)) return null;

  const hops = bottleneck(result, bufferbloat, context) as Diagnosis["hops"];
  const fits = suitability(result, bufferbloat) as Diagnosis["suitability"];
  const { confidence } = diagnosisConfidence(result, bufferbloat);

  // The first flagged hop, in path order. Path order matters: a WiFi problem
  // and a router problem can produce similar symptoms, and the nearer cause is
  // both more likely and cheaper to test.
  const suspect = hops.find((hop) => hop.flag === "suspect") ?? null;

  const fast = result.download >= 100;
  const bloated = bufferbloat ? ["C", "D", "F"].includes(bufferbloat.grade) : false;

  let headline: string;
  let matters: string;

  if (!suspect) {
    headline = fast
      ? `${result.download.toFixed(0)} Mbps down at ${Math.round(result.ping)} ms, and nothing in this run is holding it back.`
      : `${result.download.toFixed(0)} Mbps down at ${Math.round(result.ping)} ms, with no fault visible in the measurements.`;
    matters =
      "Every check this browser can run came back clean. That does not rule out problems it cannot see — WiFi radio conditions, the state of the line, or congestion outside this moment.";
  } else if (suspect.hop === "router" && bloated && bufferbloat) {
    headline = `Your connection is fast, but latency rises ${bufferbloat.increase} ms under load.`;
    matters = bufferbloatVerdict(bufferbloat.increase);
  } else if (suspect.hop === "wifi") {
    headline = "Your speed is fine, but the link to your router is unsteady.";
    matters =
      "Variance and probe loss of this shape are what wireless interference looks like from the browser. It shows up as calls breaking up and games spiking, even while a download runs at full speed.";
  } else if (suspect.hop === "isp") {
    headline = `Baseline latency to the nearest edge is ${Math.round(result.ping)} ms, which is high for a fixed line.`;
    matters =
      "Latency this high before any load is applied points past your own equipment. It slows every page load and every request, independently of how much bandwidth you have.";
  } else {
    headline = "This run was taken under conditions that limit what it can tell you.";
    matters =
      "The measurements are real, but something on this device interfered with them. Re-running in the foreground with other work closed will produce a result worth acting on.";
  }

  const confidenceReason =
    confidence === "High"
      ? "The deciding metric was measured directly this run, in both directions."
      : confidence === "Medium"
        ? "The reading is consistent with more than one cause, so the hop named is the most likely rather than the only one."
        : "This run is missing inputs the verdict depends on. Treat it as a hint, not a finding.";

  return {
    headline,
    issue: suspect ? (HOP_LABEL[suspect.hop] ?? suspect.hop) : null,
    tone: suspect ? "suspect" : "ok",
    confidence,
    confidenceReason,
    matters,
    fixes: suspect ? (FIXES[suspect.hop] ?? OK_FIXES) : OK_FIXES,
    hops,
    suitability: fits,
  };
}

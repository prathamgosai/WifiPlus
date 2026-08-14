/**
 * The measurement run, start to finish — shared by both front ends.
 * -----------------------------------------------------------------------------
 * `measure.js` owns the mathematics of a single phase. This owns the sequence
 * around them: which edge to measure against, what order the phases go in, how
 * a failing endpoint is retried, which metrics are allowed to be missing, and
 * where the progress bar is at any moment.
 *
 * That sequence used to exist twice — once in the static site's `app.js` and
 * once in the Next.js `useSpeedTest` hook — and the duplication was not
 * theoretical. Adding endpoint failover meant writing the same wrapper twice.
 * Making upload nullable meant changing four places, and two of them were
 * missed until a browser threw a TypeError. `measure.js` opens by saying that
 * fixing the math once is "the only way two front ends can stay honestly in
 * sync"; this extends that from the math to the choreography.
 *
 * Nothing here touches the DOM or React. It reports what it is doing through
 * callbacks, so each front end keeps its own wording, its own dial and its own
 * layout while the order of operations stays common.
 */

import {
  TestAborted,
  bufferbloatFrom,
  measureDns,
  measureDownload,
  measureLatency,
  measureLoadedLatency,
  measureUpload,
  stabilityFrom,
  withFailover,
} from "./measure.js";
import { endpointLabel, resolveEndpoint } from "./server-picker.js";

/**
 * @typedef {import("./endpoints.js").Endpoint} Endpoint
 * @typedef {import("./measure.js").LatencyResult} LatencyResult
 * @typedef {import("./measure.js").BufferbloatResult} BufferbloatResult
 * @typedef {import("./scoring.js").SpeedResult} SpeedResult
 */

/**
 * Where the run currently is. Front ends map these to their own copy rather
 * than being handed English, so wording stays a property of the interface.
 *
 * @typedef {"select" | "latency" | "download" | "upload" | "done"} RunPhase
 */

/**
 * Progress boundaries, as percentages of the whole run.
 *
 * Shared so the two bars advance identically. They are weighted by wall-clock
 * cost, not by phase count: the latency phase is bounded at about a second
 * while the download owns a six-second window, so an even three-way split would
 * make the bar sit still and then leap.
 */
export const PROGRESS = { latency: 22, download: 62, upload: 100 };

/**
 * @typedef {object} RunHandlers
 * @property {(phase: RunPhase) => void} [onPhase] Phase changed.
 * @property {(percent: number) => void} [onProgress] 0-100 across the whole run.
 * @property {(patch: Partial<SpeedResult>) => void} [onMetric] Values as they
 *   are measured. Every one is a real reading, never a placeholder.
 * @property {(label: string, endpoint: Endpoint) => void} [onEdge] Which edge is
 *   being measured against, and its human label.
 * @property {(failed: Endpoint, error: Error) => void} [onFallback] An endpoint
 *   failed and the run moved to the next. Worth surfacing: a number measured
 *   against a different server than the one on screen misleads.
 * @property {(done: number, total: number, lastRtt: number | undefined) => void} [onLatencyProbe]
 * @property {(mbps: number, fraction: number) => void} [onDownloadSample]
 * @property {(mbps: number, fraction: number) => void} [onUploadSample]
 * @property {(latency: LatencyResult) => void} [onLatencyDetail] Full
 *   distribution, once the phase completes.
 * @property {(bloat: BufferbloatResult | null) => void} [onBufferbloat] Null
 *   when too few probes survived the saturated link to judge it.
 */

/**
 * @typedef {object} RunOutcome
 * @property {SpeedResult} result
 * @property {LatencyResult} latency
 * @property {BufferbloatResult | null} bufferbloat
 * @property {Endpoint} endpoint The edge that actually served the run, which
 *   after a fallback is not the one selected at the start.
 * @property {string} edgeLabel
 * @property {string | null} uploadNote Why upload is null, when it is. A metric
 *   that could not be measured should be explained, not left as a dash.
 */

/**
 * Run a complete measurement.
 *
 * Throws {@link TestAborted} if the caller cancels, and a plain Error if a phase
 * fails against every available endpoint. A failed UPLOAD is not fatal: it is
 * reported as a null value with a note, because it is a fact about one metric
 * rather than grounds to discard a run in which everything else measured
 * cleanly.
 *
 * @param {RunHandlers} [handlers]
 * @param {AbortSignal} [signal]
 * @returns {Promise<RunOutcome>}
 */
export async function runMeasurement(handlers = {}, signal) {
  const {
    onPhase,
    onProgress,
    onMetric,
    onEdge,
    onFallback,
    onLatencyProbe,
    onDownloadSample,
    onUploadSample,
    onLatencyDetail,
    onBufferbloat,
  } = handlers;

  // ---- Edge selection ------------------------------------------------- 0%
  // "Nearest" is decided by round-trip time, not by a label in a config file.
  // With no self-hosted edges registered this returns Cloudflare without making
  // a single request, so the default path pays nothing for the capability.
  onPhase?.("select");
  onProgress?.(0);
  const choice = await resolveEndpoint(signal);

  /** Ordered fallbacks; the winner of each phase moves to the front. */
  let candidates = choice.candidates;
  /** The endpoint that actually served the most recent phase. */
  let servedBy = choice.endpoint;
  onEdge?.(endpointLabel(choice), choice.endpoint);

  /**
   * Run one phase against the best remaining endpoint, dropping to the next
   * when it fails. Failover is per phase, not per run: a broken upload route
   * must not discard a download that already measured cleanly.
   *
   * @template T
   * @param {(endpoint: Endpoint) => Promise<T>} phase
   * @returns {Promise<T>}
   */
  const runPhase = async (phase) => {
    const { value, endpoint } = await withFailover(candidates, phase, signal, onFallback);
    candidates = [endpoint, ...candidates.filter((c) => c !== endpoint)];
    servedBy = endpoint;
    if (endpoint !== choice.endpoint) onEdge?.(endpoint.name, endpoint);
    return value;
  };

  // ---- Idle latency + DNS, together --------------------------------- 0-22%
  // ---- Idle latency + DNS, together --------------------------------- 0-22%
  onPhase?.("latency");
  const latencyPromise = runPhase((endpoint) =>
    measureLatency(
      (done, all, lastRtt, running) => {
        onProgress?.((done / all) * PROGRESS.latency);
        onLatencyProbe?.(done, all, lastRtt);
        onMetric?.({ ping: running.ping, jitter: running.jitter, loss: running.loss });
      },
      signal,
      endpoint,
    ),
  );
  const dnsPromise = measureDns(signal).catch(() => null);

  const [latencyRes, dnsRes] = await Promise.allSettled([latencyPromise, dnsPromise]);
  const latency = latencyRes.status === "fulfilled" ? latencyRes.value : { ping: null, jitter: null, loss: null, min: 0, max: 0, p95: 0, variance: 0, samples: [] };
  const dns = dnsRes.status === "fulfilled" ? dnsRes.value : null;

  onLatencyDetail?.(latency);
  onMetric?.({ ping: latency.ping, jitter: latency.jitter, loss: latency.loss, dns });

  // ---- Download + latency under load, together --------------------- 22-62%
  onPhase?.("download");
  /** @type {number[]} */
  const throughputSamples = [];

  const downloadPromise = runPhase((endpoint) =>
    measureDownload(
      (mbps, fraction) => {
        onDownloadSample?.(mbps, fraction);
        onMetric?.({ download: round1(mbps) });
        onProgress?.(
          PROGRESS.latency + clamp01(fraction) * (PROGRESS.download - PROGRESS.latency),
        );
      },
      signal,
      endpoint,
      (mbps) => throughputSamples.push(mbps),
    ),
  );
  const loadedProbesPromise = measureLoadedLatency(undefined, signal, servedBy).catch(() => []);

  const [downRes, loadedProbesRes] = await Promise.allSettled([downloadPromise, loadedProbesPromise]);
  if (downRes.status === "rejected") throw downRes.reason;
  const down = downRes.value;
  const loadedProbes = loadedProbesRes.status === "fulfilled" ? loadedProbesRes.value : [];

  onMetric?.({ download: round1(down) });
  const bufferbloat = bufferbloatFrom(latency.ping || 0, loadedProbes);
  onBufferbloat?.(bufferbloat);

  // ---- Upload ------------------------------------------------------ 62-100%
  onPhase?.("upload");
  /** @type {number | null} */
  let upload = null;
  /** @type {string | null} */
  let uploadNote = null;
  try {
    const up = await runPhase((endpoint) =>
      measureUpload(
        (mbps, fraction) => {
          onUploadSample?.(mbps, fraction);
          onMetric?.({ upload: round1(mbps) });
          onProgress?.(
            PROGRESS.download + clamp01(fraction) * (PROGRESS.upload - PROGRESS.download),
          );
        },
        signal,
        endpoint,
        // The download is already known, so the upload starts from a chunk near
        // the right size instead of ramping from the floor inside its window.
        down,
      ),
    );
    upload = round1(up);
  } catch (error) {
    // Cancellation is the user's decision and must propagate. Anything else
    // means this one metric has no honest value, which is not a reason to throw
    // away six that do.
    if (error instanceof TestAborted) throw error;
    uploadNote = /** @type {Error} */ (error).message;
  }
  onMetric?.({ upload });

  // Stability from the observed latency spread — never a random number.
  const stability = stabilityFrom(latency.samples, latency.jitter, latency.loss, throughputSamples);
  onMetric?.({ stability });

  onProgress?.(PROGRESS.upload);
  onPhase?.("done");

  return {
    result: {
      download: round1(down),
      upload,
      ping: latency.ping,
      jitter: latency.jitter,
      loss: latency.loss,
      dns,
      stability,
    },
    latency,
    bufferbloat,
    endpoint: servedBy,
    edgeLabel: servedBy === choice.endpoint ? endpointLabel(choice) : servedBy.name,
    uploadNote,
  };
}

/** @param {number} value @returns {number} */
function round1(value) {
  return Number(value.toFixed(1));
}

/** @param {number} value @returns {number} */
function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

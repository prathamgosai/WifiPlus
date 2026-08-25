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
  UPLOAD_MEASURE_MS,
  UPLOAD_SETTLE_MS,
} from "./measure.js";
import { endpointLabel, resolveEndpoint } from "./server-picker.js";
import { measurementQuality } from "./quality.js";

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
 * @property {(bloat: BufferbloatResult | null) => void} [onUploadBufferbloat]
 *   The same measurement taken while the link is saturated UPSTREAM.
 */

/**
 * @typedef {object} RunOutcome
 * @property {SpeedResult} result
 * @property {LatencyResult} latency
 * @property {BufferbloatResult | null} bufferbloat The worse of the two below.
 * @property {BufferbloatResult | null} downloadBloat Latency added under download load.
 * @property {BufferbloatResult | null} uploadBloat Latency added under upload load.
 * @property {import("./quality.js").QualityReport} quality
 * @property {object} evidence The bytes, spans and sample counts behind the result.
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
 * @param {{ hiddenDuringRun?: boolean, wentOffline?: boolean }} [environment]
 *   Facts about the conditions the run happened under, which the engine cannot
 *   observe for itself from inside a worker. They cannot change a number — only
 *   the confidence attached to it.
 * @returns {Promise<RunOutcome>}
 */
export async function runMeasurement(handlers = {}, signal, environment) {
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
    onUploadBufferbloat,
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
  // A latency phase that FAILED has no readings, and the shape it degrades to
  // is the whole honesty of the run. Substituting zeros — which this did —
  // published ping 0 ms, jitter 0 ms and 0% loss with a measured badge on a
  // connection that was offline, because 0 is a finite number and every gate
  // downstream asks only whether the value is finite. Nulls make the same code
  // paths report unavailable, which is what actually happened.
  const latency =
    latencyRes.status === "fulfilled"
      ? latencyRes.value
      : { ping: null, jitter: null, loss: null, min: null, max: null, p95: null, variance: null, samples: [] };
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
  /** @type {import("./measure.js").ThroughputResult} */
  const down = downRes.value;
  const loadedProbes = loadedProbesRes.status === "fulfilled" ? loadedProbesRes.value : [];

  onMetric?.({ download: round1(down.mbps) });
  // Bufferbloat is the difference between idle and loaded latency, so with no
  // idle figure there is no difference to state.
  const downloadBloat = latency.ping === null ? null : bufferbloatFrom(latency.ping, loadedProbes);
  onBufferbloat?.(downloadBloat);

  // ---- Upload, with latency probed under it ------------------------ 62-100%
  //
  // Latency under UPLOAD load is a separate measurement from latency under
  // download load and frequently the worse of the two: consumer links are
  // asymmetric, so the upstream queue is the one that fills first and the one
  // that breaks a video call while someone is backing up photos. Measuring only
  // the download side reported an A to connections that stutter every time they
  // send. The probe adds no traffic of its own — the upload phase is already
  // saturating the link, which is exactly the condition being measured.
  onPhase?.("upload");
  /** @type {import("./measure.js").ThroughputResult | null} */
  let upload = null;
  /** @type {string | null} */
  let uploadNote = null;
  /** @type {number[]} */
  let uploadLoadedProbes = [];

  // The window covers the upload's own settle pause as well as its measured
  // window, and the probe waits out both before its first sample — otherwise
  // the opening probes measure an idle link and are averaged into a grade about
  // a saturated one.
  // Flipped the moment the upload settles, however it settles. Without it a
  // failed upload — which returns almost instantly — left the probe running out
  // its full window against an idle link, adding eight seconds of dead time to
  // the run AND feeding idle samples into a grade about a saturated one.
  let uploadFinished = false;
  const uploadLoadedPromise = measureLoadedLatency(
    undefined,
    signal,
    servedBy,
    UPLOAD_MEASURE_MS + UPLOAD_SETTLE_MS,
    UPLOAD_SETTLE_MS + 350,
    () => uploadFinished,
  ).catch(() => []);

  try {
    upload = await runPhase((endpoint) =>
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
        down.mbps,
      ),
    );
  } catch (error) {
    // Cancellation is the user's decision and must propagate. Anything else
    // means this one metric has no honest value, which is not a reason to throw
    // away six that do.
    if (error instanceof TestAborted) {
      uploadFinished = true;
      throw error;
    }
    uploadNote = /** @type {Error} */ (error).message;
  } finally {
    uploadFinished = true;
  }

  uploadLoadedProbes = await uploadLoadedPromise;
  const uploadBloat =
    latency.ping === null ? null : bufferbloatFrom(latency.ping, uploadLoadedProbes);
  onUploadBufferbloat?.(uploadBloat);

  onMetric?.({ upload: upload ? round1(upload.mbps) : null });

  // Stability from the observed latency spread — never a random number.
  const stability = stabilityFrom(latency.samples, latency.jitter, latency.loss, throughputSamples);
  onMetric?.({ stability });

  onProgress?.(PROGRESS.upload);
  onPhase?.("done");

  // The grade the run gives itself. Computed here rather than in a front end so
  // both shells report the same confidence from the same evidence, and so a
  // result carried in a link can be re-checked against the record it came with.
  const quality = measurementQuality({
    download: down,
    upload,
    latencySamples: latency.samples.length,
    loadedProbes: loadedProbes.length,
    completed: true,
    endpointChanged: servedBy !== choice.endpoint,
    hiddenDuringRun: environment?.hiddenDuringRun ?? false,
    wentOffline: environment?.wentOffline ?? false,
    // The picker already measured this edge health; carrying it into the
    // grade is what lets a run say "the server was busy" instead of reporting
    // the server capacity as the connection speed.
    ...(typeof choice.ranked?.[0]?.load === "number" ? { serverLoad: choice.ranked[0].load } : {}),
  });

  // The worse of the two grades is the one that describes the connection. A
  // link that holds up while downloading and collapses while uploading is a
  // link that collapses under load, and reporting the download side alone would
  // hand it the grade it earned in the easier direction.
  const bufferbloat = worseBloat(downloadBloat, uploadBloat);

  return {
    result: {
      download: round1(down.mbps),
      upload: upload ? round1(upload.mbps) : null,
      ping: latency.ping,
      jitter: latency.jitter,
      loss: latency.loss,
      dns,
      stability,
    },
    latency,
    bufferbloat,
    downloadBloat,
    uploadBloat,
    quality,
    // The evidence every figure above was derived from, carried out of the
    // engine rather than discarded at its edge. Without it nothing downstream
    // can check the headline, which is the whole reason a result can claim to
    // be verified at all.
    evidence: {
      download: down,
      upload,
      idleProbes: latency.samples.length,
      downloadLoadedProbes: loadedProbes.length,
      uploadLoadedProbes: uploadLoadedProbes.length,
      protocol: down.protocol ?? null,
    },
    endpoint: servedBy,
    edgeLabel: servedBy === choice.endpoint ? endpointLabel(choice) : servedBy.name,
    uploadNote,
  };
}

/**
 * The worse of two bufferbloat grades, or whichever one exists.
 *
 * @param {import("./measure.js").BufferbloatResult | null} a
 * @param {import("./measure.js").BufferbloatResult | null} b
 * @returns {import("./measure.js").BufferbloatResult | null}
 */
function worseBloat(a, b) {
  if (!a) return b;
  if (!b) return a;
  return b.increase > a.increase ? b : a;
}

/** @param {number} value @returns {number} */
function round1(value) {
  return Number(value.toFixed(1));
}

/** @param {number} value @returns {number} */
function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

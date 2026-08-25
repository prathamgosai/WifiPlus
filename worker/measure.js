/**
 * WifiPlus Web Worker Measurement Engine — worker/measure.js
 * -----------------------------------------------------------------------------
 * Isolated measurement engine running inside a dedicated Web Worker thread.
 * Wraps the unified `core/run.js` logic so that heavy network fetches, stream
 * reading, and statistical calculations do not block the main UI thread.
 *
 * EVERYTHING THAT CROSSES postMessage MUST BE STRUCTURED-CLONEABLE.
 *
 * That is not a style note, it is the reason this file exists in its current
 * form. `core/run.js` hands its callbacks live `Endpoint` objects, whose `down`,
 * `up` and `ping` members are FUNCTIONS that build URLs. Functions cannot be
 * structured-cloned, so posting one threw
 *
 *     DataCloneError: (bytes) => `https://speed.cloudflare.com/__down?bytes=…`
 *     could not be cloned
 *
 * synchronously out of `onEdge` — which `runMeasurement` fires during edge
 * selection, before a single byte is measured. The throw propagated into the
 * catch below and was reported to the page as a failed test, so every metric
 * stayed blank on every run. The same trap sat in `onFallback` and in the final
 * `complete` message, whose outcome carries the endpoint that served the run.
 *
 * The fix is one rule, applied at every boundary: post plain data only. An
 * endpoint is reduced to its name, which is the only part of it the UI ever
 * displays, and the outcome is rebuilt field by field rather than forwarded
 * whole — so a field added upstream cannot silently reintroduce the bug.
 */

import { runMeasurement } from "../core/run.js";
import { log, logError } from "../core/test-logger.js";

let currentAbort = null;

/**
 * Conditions the run happened under, which the engine cannot observe from
 * inside a worker. A worker has no `document`, so `visibilityState` is
 * unreachable here and the page has to report it.
 *
 * These never change a measured number. They change how much the run is willing
 * to claim for one — which is the only honest response to a window the browser
 * may have been throttling.
 *
 * @type {{ hiddenDuringRun: boolean, wentOffline: boolean }}
 */
let environment = { hiddenDuringRun: false, wentOffline: false };

/**
 * An endpoint reduced to what can be cloned and what the UI actually shows.
 *
 * @param {{ name?: string } | null | undefined} endpoint
 * @returns {string | null}
 */
const endpointName = (endpoint) => (endpoint && typeof endpoint.name === "string" ? endpoint.name : null);

/**
 * The run outcome as plain data.
 *
 * Rebuilt explicitly rather than spread, because a spread would carry through
 * whatever `core/run.js` adds later — including another live endpoint — and
 * reintroduce the DataCloneError that made every run fail.
 *
 * @param {import("../core/run.js").RunOutcome} outcome
 */
function serialiseOutcome(outcome) {
  const { result, latency, bufferbloat, downloadBloat, uploadBloat, quality, evidence, edgeLabel, uploadNote } =
    outcome;
  return {
    result: {
      download: result.download ?? null,
      upload: result.upload ?? null,
      ping: result.ping ?? null,
      jitter: result.jitter ?? null,
      loss: result.loss ?? null,
      dns: result.dns ?? null,
      stability: result.stability ?? null,
    },
    latency: latency
      ? {
          ping: latency.ping ?? null,
          jitter: latency.jitter ?? null,
          loss: latency.loss ?? null,
          min: latency.min,
          max: latency.max,
          p95: latency.p95,
          variance: latency.variance,
          samples: [...latency.samples],
        }
      : null,
    // Null is a real answer here: too few probes survived the saturated link to
    // grade it. The page must handle it rather than reading `.increase` off it.
    bufferbloat: cloneBloat(bufferbloat),
    // The same measurement taken in each direction. Consumer links are
    // asymmetric, so these routinely disagree, and the one that matters is
    // whichever is worse — `bufferbloat` above already holds that.
    downloadBloat: cloneBloat(downloadBloat),
    uploadBloat: cloneBloat(uploadBloat),
    // The run's own assessment of how much weight its numbers carry. Plain
    // data by construction: arrays of strings and numbers only.
    quality: quality
      ? {
          level: quality.level,
          verdict: quality.verdict,
          reasons: [...quality.reasons],
          passed: [...quality.passed],
          reconcile: { ...quality.reconcile },
        }
      : null,
    // The bytes and spans every figure was derived from. Rebuilt field by field
    // for the same reason the outcome is: a spread would carry through whatever
    // the engine adds later, including something unclonable.
    evidence: evidence
      ? {
          download: cloneThroughput(evidence.download),
          upload: cloneThroughput(evidence.upload),
          idleProbes: evidence.idleProbes,
          downloadLoadedProbes: evidence.downloadLoadedProbes,
          uploadLoadedProbes: evidence.uploadLoadedProbes,
          protocol: evidence.protocol ?? null,
        }
      : null,
    endpointName: endpointName(outcome.endpoint),
    edgeLabel,
    uploadNote: uploadNote ?? null,
  };
}

/**
 * @param {import("../core/measure.js").BufferbloatResult | null | undefined} bloat
 */
function cloneBloat(bloat) {
  return bloat
    ? {
        idle: bloat.idle,
        loaded: bloat.loaded,
        increase: bloat.increase,
        grade: bloat.grade,
        // Which statistic produced the grade, and how many probes backed it.
        // A grade whose basis is invisible is a letter, not a measurement.
        basis: bloat.basis,
        probes: bloat.probes,
      }
    : null;
}

/**
 * @param {import("../core/measure.js").ThroughputResult | null | undefined} t
 */
function cloneThroughput(t) {
  if (!t) return null;
  return {
    mbps: t.mbps,
    bytes: t.bytes,
    elapsedMs: t.elapsedMs,
    measuredBytes: t.measuredBytes,
    measuredMs: t.measuredMs,
    // Capped: a fast link produces hundreds of intervals and the page only ever
    // draws a trace from them. The full set stays in the worker.
    samples: t.samples.slice(0, 400),
    streams: t.streams,
    method: t.method,
    reconciliationMbps: t.reconciliationMbps,
    warmupMs: t.warmupMs,
    protocol: t.protocol ?? null,
    posts: Array.isArray(t.posts) ? t.posts.slice(0, 200).map((p) => ({ ...p })) : undefined,
  };
}

self.onmessage = async (e) => {
  const { type } = e.data;

  if (type === "start") {
    if (currentAbort) currentAbort.abort();
    currentAbort = new AbortController();
    const abort = currentAbort;
    // A fresh run must not inherit the previous run's conditions.
    environment = { hiddenDuringRun: false, wentOffline: false };

    try {
      log("run started");
      const outcome = await runMeasurement(
        {
          onPhase: (phase) => {
            log("phase:", phase);
            self.postMessage({ type: "onPhase", data: phase });
          },
          onProgress: (percent) => self.postMessage({ type: "onProgress", data: percent }),
          onMetric: (patch) => self.postMessage({ type: "onMetric", data: { ...patch } }),
          // Name only — the Endpoint itself holds URL-building functions.
          onEdge: (label, endpoint) => {
            log("edge:", label);
            self.postMessage({ type: "onEdge", data: { label, name: endpointName(endpoint) } });
          },
          onFallback: (endpoint, error) => {
            logError("endpoint fallback", error);
            self.postMessage({
              type: "onFallback",
              data: { name: endpointName(endpoint), error: error?.message ?? "unknown error" },
            });
          },
          onLatencyProbe: (done, all, lastRtt) =>
            self.postMessage({
              type: "onLatencyProbe",
              // `undefined` clones fine, but normalising to null keeps the page's
              // checks to one shape.
              data: { done, all, lastRtt: lastRtt ?? null },
            }),
          onDownloadSample: (mbps, fraction) =>
            self.postMessage({ type: "onDownloadSample", data: { mbps, fraction } }),
          onUploadSample: (mbps, fraction) =>
            self.postMessage({ type: "onUploadSample", data: { mbps, fraction } }),
          onLatencyDetail: (latency) =>
            self.postMessage({
              type: "onLatencyDetail",
              data: {
                ping: latency.ping ?? null,
                jitter: latency.jitter ?? null,
                loss: latency.loss ?? null,
                min: latency.min,
                max: latency.max,
                p95: latency.p95,
                variance: latency.variance,
                samples: [...latency.samples],
              },
            }),
          onBufferbloat: (bloat) =>
            self.postMessage({ type: "onBufferbloat", data: cloneBloat(bloat) }),
          onUploadBufferbloat: (bloat) =>
            self.postMessage({ type: "onUploadBufferbloat", data: cloneBloat(bloat) }),
        },
        abort.signal,
        environment,
      );

      log("run complete", outcome.result);
      self.postMessage({ type: "complete", data: serialiseOutcome(outcome) });
    } catch (error) {
      if (abort.signal.aborted || error?.name === "TestAborted") {
        self.postMessage({ type: "aborted" });
      } else {
        logError("run failed", error);
        self.postMessage({
          type: "error",
          data: { message: error?.message ?? "Unknown measurement error", name: error?.name ?? "Error" },
        });
      }
    } finally {
      if (currentAbort === abort) currentAbort = null;
    }
  } else if (type === "stop") {
    if (currentAbort) {
      currentAbort.abort();
      currentAbort = null;
    }
  } else if (type === "visibility") {
    // Latching, not tracking: once a run has spent ANY time backgrounded, the
    // window it measured is suspect for the rest of the run. Clearing the flag
    // when the tab came back would let a user hide the tab through the whole
    // download and get a clean bill of health by returning at the end.
    if (currentAbort && e.data?.data?.visible === false) {
      environment.hiddenDuringRun = true;
      log("run backgrounded — result will be marked reduced-confidence");
    }
  } else if (type === "offline") {
    if (currentAbort) environment.wentOffline = true;
  }
};

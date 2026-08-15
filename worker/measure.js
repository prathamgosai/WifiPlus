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
  const { result, latency, bufferbloat, edgeLabel, uploadNote } = outcome;
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
    bufferbloat: bufferbloat
      ? {
          idle: bufferbloat.idle,
          loaded: bufferbloat.loaded,
          increase: bufferbloat.increase,
          grade: bufferbloat.grade,
        }
      : null,
    endpointName: endpointName(outcome.endpoint),
    edgeLabel,
    uploadNote: uploadNote ?? null,
  };
}

self.onmessage = async (e) => {
  const { type } = e.data;

  if (type === "start") {
    if (currentAbort) currentAbort.abort();
    currentAbort = new AbortController();
    const abort = currentAbort;

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
            self.postMessage({
              type: "onBufferbloat",
              data: bloat
                ? {
                    idle: bloat.idle,
                    loaded: bloat.loaded,
                    increase: bloat.increase,
                    grade: bloat.grade,
                  }
                : null,
            }),
        },
        abort.signal,
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
    // If we wanted to pause or degrade gracefully on tab switch, handle it here.
    // For now, core/run.js handles its own resilience.
  }
};

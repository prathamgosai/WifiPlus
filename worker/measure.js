/**
 * WifiPlus Web Worker Measurement Engine — worker/measure.js
 * -----------------------------------------------------------------------------
 * Isolated measurement engine running inside a dedicated Web Worker thread.
 * Wraps the unified `core/run.js` logic so that heavy network fetches, stream
 * reading, and statistical calculations do not block the main UI thread.
 */

import { runMeasurement } from "../core/run.js";

let currentAbort = null;

self.onmessage = async (e) => {
  const { type, data } = e.data;

  if (type === "start") {
    if (currentAbort) {
      currentAbort.abort();
    }
    currentAbort = new AbortController();

    try {
      const outcome = await runMeasurement({
        onPhase: (phase) => self.postMessage({ type: "onPhase", data: phase }),
        onProgress: (percent) => self.postMessage({ type: "onProgress", data: percent }),
        onMetric: (patch) => self.postMessage({ type: "onMetric", data: patch }),
        onEdge: (label, endpoint) => self.postMessage({ type: "onEdge", data: { label, endpoint } }),
        onFallback: (endpoint, error) => self.postMessage({ type: "onFallback", data: { endpoint, error: error.message } }),
        onLatencyProbe: (done, all, lastRtt) => self.postMessage({ type: "onLatencyProbe", data: { done, all, lastRtt } }),
        onDownloadSample: (mbps, fraction) => self.postMessage({ type: "onDownloadSample", data: { mbps, fraction } }),
        onUploadSample: (mbps, fraction) => self.postMessage({ type: "onUploadSample", data: { mbps, fraction } }),
        onLatencyDetail: (latDetails) => self.postMessage({ type: "onLatencyDetail", data: latDetails }),
        onBufferbloat: (bloat) => self.postMessage({ type: "onBufferbloat", data: bloat }),
      }, currentAbort.signal, data?.isQuick || false);

      self.postMessage({ type: "complete", data: outcome });
    } catch (error) {
      if (currentAbort.signal.aborted || error.name === "TestAborted") {
        self.postMessage({ type: "aborted" });
      } else {
        self.postMessage({ type: "error", data: { message: error.message, name: error.name } });
      }
    } finally {
      currentAbort = null;
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

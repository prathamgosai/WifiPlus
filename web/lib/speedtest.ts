/**
 * Real network measurement — re-exported from the shared engine in `core/`.
 *
 * Throughput is derived from bytes actually moved over the wire; nothing here is
 * simulated. The implementation lives in `core/measure.js` because the static
 * site at the repo root runs the identical code. When the math changes, it
 * changes once — the two front ends cannot report different numbers.
 *
 * See `core/measure.js` for the measurement windows, warm-up handling and the
 * reasoning behind each constant.
 */
export {
  DOWN_STREAMS,
  MEASURE_MS,
  PING_SAMPLES,
  TestAborted,
  UP_STREAMS,
  WARMUP_MS,
  bpsToMbps,
  bufferbloatFrom,
  gradeBufferbloat,
  measureDns,
  measureDownload,
  measureLatency,
  measureLoadedLatency,
  measureUpload,
  percentile,
  stabilityFrom,
  withFailover,
} from "@core/measure.js";

export type { BufferbloatResult, LatencyResult } from "@core/measure.js";

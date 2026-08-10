/**
 * Real network measurement — the single source of truth for both front ends.
 * -----------------------------------------------------------------------------
 * Throughput is derived from bytes actually moved over the wire. Nothing here is
 * simulated, and nothing here touches the DOM: this module is pure measurement,
 * so it runs identically inside the static site, inside Next.js, and inside a
 * test runner.
 *
 * Both shells import THIS file. Fixing the math once fixes it everywhere — which
 * is the only way two front ends can stay honestly in sync.
 */

import { bust, cloudflareEndpoint, randomHex } from "./endpoints.js";

/** DNS is measured against a DoH resolver regardless of the throughput endpoint. */
const DNS_URL = "https://cloudflare-dns.com/dns-query";

// Tuned for speed: the warm-up ramp is discarded anyway, so a shorter measure
// window still reports the same steady-state rate — it just gets there sooner.
// More parallel streams saturate the shorter window.
// Long enough to be repeatable. At 2500ms the same connection answered 39.7,
// 72.7 and 13.3 Mbps in three consecutive runs — a spread of 142% of the mean.
// Every one of those readings was arithmetically honest and the set was useless.
// A short window samples whatever the link happened to be doing for two seconds;
// this samples enough of it to describe the link instead.
export const MEASURE_MS = 6000; // download window
export const UPLOAD_MEASURE_MS = 4000; // upload window, shorter as uploads ramp slower
export const WARMUP_MS = 500; // ignored while the TCP/QUIC congestion window ramps
export const DOWN_STREAMS = 8; // parallel streams are needed to saturate a fast link
export const UP_STREAMS = 4;
/**
 * Browsers cap concurrent connections per origin at six on HTTP/1.1. Opening
 * eight download streams therefore starves everything else pointed at the same
 * host — including the loaded-latency probe, which then measures the browser's
 * own connection queue instead of the network and reports tens of seconds of
 * "bufferbloat". On HTTP/1.1 we use fewer streams and leave a socket free.
 * HTTP/2 and HTTP/3 multiplex over one connection, so the limit does not apply.
 */
export const H1_MAX_STREAMS = 5;
/**
 * Shortest interval a throughput figure may be derived from.
 *
 * Rate is bytes ÷ time, and immediately after the warm-up cutoff both are near
 * zero: the byte counter has just been rebased and only a millisecond or two has
 * passed. Dividing one chunk by ~3ms yields thousands of Mbps — the origin of
 * absurd readings like 5624 Mbps on a domestic line. Nothing is reported until
 * the window is wide enough for the division to mean something.
 */
export const MIN_SAMPLE_MS = 300;
// 20 probes give a meaningful p95 — but 20 SEQUENTIAL round trips cost 20x your
// latency, which is 0.4s on fibre and 5s on a bad mobile link. The phase is
// therefore capped by time as well: whoever hits their limit first wins, so a
// slow connection stops probing early instead of making the whole test crawl.
export const PING_SAMPLES = 20;
// Soft budget: once there are enough samples to describe a distribution, stop.
export const PING_BUDGET_MS = 1200;
export const PING_MIN_SAMPLES = 6;
// Hard cap: on a link so slow that even the minimum sample count would cost
// several seconds, report from the few probes that did land. Three is the least
// that still yields a median and a jitter figure.
export const PING_MAX_MS = 2000;
export const PING_FLOOR_SAMPLES = 3;
// A probe that black-holes must not hold the phase open. Past this it counts as
// a lost packet, which is exactly what it is.
export const PROBE_TIMEOUT_MS = 1500;
// Absolute wall-clock ceiling for the phase, whatever the sample count.
export const PING_CEILING_MS = 4000;
/**
 * Deadline for a probe taken while the link is saturated.
 *
 * The idle deadline cannot be reused here. Bufferbloat *is* latency climbing
 * into the hundreds or thousands of milliseconds under load — that is the
 * measurement — so timing those probes out at 1500ms discarded precisely the
 * connections the grade exists to identify, and the panel then reported "not
 * measurable" for the worst links rather than grading them F.
 */
export const LOADED_PROBE_TIMEOUT_MS = 6000;
// Four DoH lookups, the first discarded for connection setup, leaving three to
// take a median from.
export const DNS_PROBES = 4;

/**
 * @param {number} bytes
 * @param {number} ms
 * @returns {number} megabits per second
 */
export const bpsToMbps = (bytes, ms) => (bytes * 8) / (ms * 1000);

/**
 * Percentile on an already-sorted ascending array.
 *
 * @param {number[]} sorted
 * @param {number} p
 * @returns {number}
 */
export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0] ?? 0;

  // Linear interpolation between the two neighbouring ranks (the "R-7" method
  // used by NumPy and Excel). The previous `floor(p/100 * n)` index returned the
  // array maximum for every sample count this engine produces — at n = 19,
  // floor(0.95 * 19) = 18, the last element — so "p95" and "max" were always the
  // same number displayed twice, and one slow probe set both.
  const rank = ((p / 100) * (sorted.length - 1));
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  const low = sorted[lower] ?? 0;
  if (lower === upper) return low;
  const high = sorted[upper] ?? low;
  return low + (high - low) * (rank - lower);
}

/**
 * Median of an unsorted array. Returns 0 for empty.
 *
 * @param {number[]} values
 * @returns {number}
 */
function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** Thrown when the caller aborts, so a UI can stay silent instead of erroring. */
export class TestAborted extends Error {
  constructor() {
    super("Test cancelled");
    this.name = "TestAborted";
  }
}

/** @param {AbortSignal} [signal] */
function assertLive(signal) {
  if (signal?.aborted) throw new TestAborted();
}

/** @param {unknown} error */
function rethrowAbort(error) {
  if (error instanceof Error && error.name === "AbortError") throw new TestAborted();
}

/**
 * Abort-aware sleep for short measurement gaps. A plain setTimeout keeps waiting
 * after the user cancels, which makes the UI feel sticky between phases.
 *
 * @param {number} ms
 * @param {AbortSignal} [signal]
 */
function sleep(ms, signal) {
  assertLive(signal);
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const timer = setTimeout(() => {
      cleanup();
      resolve(undefined);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new TestAborted());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * How many times a single throughput request may be re-attempted.
 *
 * A retry here is not optimism — it is the difference between a transient 502
 * from one edge PoP costing a stream for the rest of the window and costing a
 * couple of hundred milliseconds. Deliberately small: a request that fails three
 * times is not transient, and the endpoint-level failover below is the right
 * remedy at that point.
 */
export const MAX_REQUEST_RETRIES = 2;
/** First backoff step; doubles per attempt. */
export const RETRY_BACKOFF_MS = 120;

/**
 * Statuses worth trying again.
 *
 * A 404 or a 413 is a fact about the endpoint that a retry cannot change, so
 * those fail immediately and let failover move to the next server. Only the
 * genuinely transient ones — overload, timeout, restart — are re-attempted.
 *
 * @param {number} status
 * @returns {boolean}
 */
export function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/**
 * Fetch with bounded retries and a fresh cache-buster per attempt.
 *
 * The URL is built per attempt rather than reused: retrying the identical URL
 * risks an intermediary serving the same cached failure back, which would make
 * the retry decorative.
 *
 * Note what does NOT use this — the latency probes. There, a request that fails
 * IS the packet-loss measurement; retrying it would quietly report 0% loss on a
 * link that is dropping packets.
 *
 * @param {(attempt: number) => string} makeUrl
 * @param {RequestInit} init
 * @param {AbortSignal} [signal] the caller's cancellation signal
 * @param {number} [retries]
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(makeUrl, init, signal, retries = MAX_REQUEST_RETRIES) {
  /** @type {Error} */
  let last = new Error("Request failed");

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    assertLive(signal);
    try {
      const res = await fetch(makeUrl(attempt), init);
      if (res.ok) return res;

      // Drain the error body so the connection returns to the pool instead of
      // being torn down — the next attempt then reuses a warm socket.
      await res.arrayBuffer().catch(() => {});
      const error = new Error(`HTTP ${res.status}`);
      if (!isRetryableStatus(res.status)) throw error;
      last = error;
    } catch (error) {
      // The caller cancelled: propagate, never retry.
      if (signal?.aborted) throw new TestAborted();
      // The measurement window closed on an in-flight request. That is the
      // phase ending normally, not a failure to retry around.
      if (init.signal?.aborted) throw new TestAborted();
      if (error instanceof TestAborted) throw error;
      last = /** @type {Error} */ (error);
      // A non-retryable status already threw above; re-throw it unchanged so
      // failover reacts immediately rather than after two pointless waits.
      if (last.message.startsWith("HTTP ") && !isRetryableStatus(Number(last.message.slice(5)))) {
        throw last;
      }
    }

    if (attempt < retries) {
      await sleep(RETRY_BACKOFF_MS * 2 ** attempt, signal);
    }
  }

  throw last;
}

/**
 * Run a phase against the best endpoint, falling through to the next on failure.
 *
 * Failover is per phase, not per run: if the download succeeds against a
 * self-hosted edge but the upload route on it is broken, only the upload moves
 * to the fallback. The alternative — restarting the whole run — would throw away
 * a perfectly good download measurement.
 *
 * @template T
 * @param {import("./endpoints.js").Endpoint[]} candidates ordered, best first
 * @param {(endpoint: import("./endpoints.js").Endpoint) => Promise<T>} phase
 * @param {AbortSignal} [signal]
 * @param {(endpoint: import("./endpoints.js").Endpoint, error: Error) => void} [onFallback]
 *   Called with the endpoint that failed, so a UI can say so rather than
 *   silently reporting a number from somewhere the user was not told about.
 * @returns {Promise<{ value: T, endpoint: import("./endpoints.js").Endpoint }>}
 */
export async function withFailover(candidates, phase, signal, onFallback) {
  const list = candidates.length ? candidates : [cloudflareEndpoint];
  /** @type {Error} */
  let last = new Error("No endpoint available");

  for (const endpoint of list) {
    assertLive(signal);
    try {
      return { value: await phase(endpoint), endpoint };
    } catch (error) {
      // Cancellation is the user's decision, not an endpoint failure — it must
      // never cascade through every remaining candidate.
      if (error instanceof TestAborted) throw error;
      last = /** @type {Error} */ (error);
      onFallback?.(endpoint, last);
    }
  }

  throw last;
}

/**
 * @typedef {object} LatencyResult
 * @property {number} ping Median round trip, ms.
 * @property {number | null} jitter Mean absolute delta of consecutive round
 *   trips, ms. Null when fewer than two probes returned, since variation
 *   between samples is undefined with one sample.
 * @property {number} loss Percentage of probes that never came back.
 * @property {number} min
 * @property {number} max
 * @property {number} p95 The tail users actually feel.
 * @property {number} variance Standard deviation of the samples, ms.
 * @property {number[]} samples Ascending.
 */

/**
 * Latency, jitter and loss from sequential 0-byte requests timed to first byte.
 * A failed probe counts as a lost packet.
 *
 * Reports the whole distribution rather than one number: an average hides the
 * p95 tail, and the tail is what breaks a call.
 *
 * @param {(done: number, total: number, lastRtt: number | undefined,
 *   running: { ping: number | null, jitter: number | null, loss: number | null }) => void} [onSample]
 *   `running` carries the stats computed from the probes that have landed so
 *   far, so a UI can fill ping, jitter and loss during the phase rather than
 *   holding them blank until it ends. Each field is null until there is a
 *   sample behind it — never a zero standing in for "unknown".
 * @param {AbortSignal} [signal]
 * @param {import("./endpoints.js").Endpoint} [endpoint]
 * @returns {Promise<LatencyResult>}
 */
export async function measureLatency(onSample, signal, endpoint = cloudflareEndpoint) {
  /** @type {number[]} */
  const samples = [];
  let failed = 0;
  let attempted = 0;
  const phaseStart = performance.now();

  for (let i = 0; i < PING_SAMPLES; i += 1) {
    assertLive(signal);
    // Two exits, so the phase cost never scales with the user's latency:
    // enough samples and the soft budget spent, or a slow link that has already
    // burned the hard cap and has the bare minimum to report from.
    const spent = performance.now() - phaseStart;
    if (samples.length >= PING_MIN_SAMPLES && spent > PING_BUDGET_MS) break;
    if (samples.length >= PING_FLOOR_SAMPLES && spent > PING_MAX_MS) break;
    // Unconditional ceiling. Without it, a link where every probe times out has
    // no sample count to trigger the exits above and would sit here for
    // PING_SAMPLES x PROBE_TIMEOUT_MS — half a minute of apparently nothing.
    if (spent > PING_CEILING_MS) break;

    const started = performance.now();
    // Per-probe deadline, so one black-holed request cannot stall everything
    // behind it. AbortSignal.timeout is not in older Safari, hence the manual
    // controller.
    const probe = new AbortController();
    const onOuterAbort = () => probe.abort();
    signal?.addEventListener("abort", onOuterAbort);
    const probeTimer = setTimeout(() => probe.abort(), PROBE_TIMEOUT_MS);

    try {
      const res = await fetch(bust(endpoint.ping(), `${i}-${started}`), {
        cache: "no-store",
        signal: probe.signal,
      });
      await res.arrayBuffer();
      // The first request pays TCP + TLS handshake cost and is not
      // representative of steady-state latency, so it is dropped.
      if (i > 0) samples.push(performance.now() - started);
    } catch {
      // Only two things can land here: the caller cancelled the test, or the
      // probe failed/timed out. The first must propagate; the second is a lost
      // packet, which is the measurement, not an error.
      if (signal?.aborted) throw new TestAborted();
      if (i > 0) failed += 1;
    } finally {
      clearTimeout(probeTimer);
      signal?.removeEventListener("abort", onOuterAbort);
    }
    if (i > 0) attempted += 1;
    // Progress is reported against the probes actually planned, so a link that
    // exits early still fills its progress bar instead of stalling at 40%.
    onSample?.(i + 1, PING_SAMPLES, samples[samples.length - 1], runningStats(samples, failed, attempted));
  }

  if (!samples.length) throw new Error("No latency samples");

  // Jitter is the mean absolute delta of CONSECUTIVE round trips (RFC 3550), so
  // it must be computed in arrival order — before sorting for percentiles.
  let jitterSum = 0;
  for (let i = 1; i < samples.length; i += 1) {
    jitterSum += Math.abs((samples[i] ?? 0) - (samples[i - 1] ?? 0));
  }
  // One sample cannot express variation between samples. Reporting 0 there
  // announced the best possible jitter — a flawless connection — on the
  // strength of a single probe. Null says "not enough data", which is the truth.
  const jitter = samples.length > 1 ? jitterSum / (samples.length - 1) : null;

  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance = Math.sqrt(samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length);

  const sorted = [...samples].sort((a, b) => a - b);

  return {
    ping: Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0),
    jitter: jitter === null ? null : Number(jitter.toFixed(1)),
    // Loss is a share of probes actually SENT, not of the planned 20 — otherwise
    // a link that exits the phase early would report phantom packet loss.
    loss: Number(((failed / Math.max(1, attempted)) * 100).toFixed(1)),
    min: Math.round(sorted[0] ?? 0),
    max: Math.round(sorted[sorted.length - 1] ?? 0),
    p95: Math.round(percentile(sorted, 95)),
    variance: Number(variance.toFixed(1)),
    samples: sorted,
  };
}

/**
 * The protocol actually negotiated with the measurement host, read from resource
 * timing for requests already made. Returns null before any request has run.
 *
 * @param {import("./endpoints.js").Endpoint} [endpoint]
 * @returns {string | null} e.g. "http/1.1", "h2", "h3"
 */
export function negotiatedProtocol(endpoint = cloudflareEndpoint) {
  try {
    const host = new URL(endpoint.ping()).host;
    const entries = /** @type {PerformanceResourceTiming[]} */ (
      performance.getEntriesByType("resource")
    );
    // Last match wins: the most recent request reflects the live connection.
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i];
      if (entry && entry.name.includes(host) && entry.nextHopProtocol) {
        return entry.nextHopProtocol;
      }
    }
  } catch {
    /* resource timing unavailable — fall back to the conservative default */
  }
  return null;
}

/**
 * How many download streams may safely run against this endpoint.
 *
 * @param {import("./endpoints.js").Endpoint} [endpoint]
 * @returns {number}
 */
export function safeStreamCount(endpoint = cloudflareEndpoint) {
  const protocol = negotiatedProtocol(endpoint);
  // Unknown protocol is treated as HTTP/1.1: under-using connections costs a
  // little throughput, whereas over-using them corrupts the latency reading.
  return protocol && !protocol.startsWith("http/1") ? DOWN_STREAMS : H1_MAX_STREAMS;
}

/**
 * Stats from the probes that have landed so far. Same maths as the final
 * result, so the number a user watches climbing is the number they end up with.
 *
 * @param {number[]} samples arrival order
 * @param {number} failed
 * @param {number} attempted
 * @returns {{ ping: number | null, jitter: number | null, loss: number | null }}
 */
function runningStats(samples, failed, attempted) {
  const sorted = [...samples].sort((a, b) => a - b);
  let sum = 0;
  for (let i = 1; i < samples.length; i += 1) {
    sum += Math.abs((samples[i] ?? 0) - (samples[i - 1] ?? 0));
  }
  return {
    // Null, not zero, when nothing has come back yet. `?? 0` rendered a
    // confident "0 ms" ping and "0.0%" loss on a machine with no network at
    // all — the tiles filled in with invented values for a second before the
    // phase failed. A metric with no samples behind it has no value, and the
    // UI renders null as "—".
    ping: samples.length ? Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0) : null,
    jitter: samples.length > 1 ? Number((sum / (samples.length - 1)).toFixed(1)) : null,
    loss: attempted > 0 ? Number(((failed / attempted) * 100).toFixed(1)) : null,
  };
}

/**
 * @typedef {object} BufferbloatResult
 * @property {number} idle Idle median latency, ms.
 * @property {number} loaded Median latency while the link is saturated, ms.
 * @property {number} increase How much latency rose under load, ms.
 * @property {"A" | "B" | "C" | "D" | "F"} grade
 */

/**
 * Loaded-latency probing for the bufferbloat grade.
 *
 * Creates NO traffic of its own — it is meant to run CONCURRENTLY with the real
 * download, so the link is already saturated by the test itself. That removes a
 * whole ~3s phase and produces a more honest reading than synthetic load.
 *
 * @param {(latency: number) => void} [onProbe]
 * @param {AbortSignal} [signal]
 * @param {import("./endpoints.js").Endpoint} [endpoint]
 * @returns {Promise<number[]>} raw probe RTTs
 */
export async function measureLoadedLatency(onProbe, signal, endpoint = cloudflareEndpoint) {
  /** @type {number[]} */
  const probes = [];
  const deadline = performance.now() + MEASURE_MS;
  // Let the download streams reach saturation before sampling.
  await sleep(350, signal);

  while (performance.now() < deadline) {
    assertLive(signal);
    const started = performance.now();

    // Bounded, for the same reason the idle probes are: a probe that cannot get
    // a socket would otherwise sit until the download phase ends and then report
    // its whole wait as latency.
    const probe = new AbortController();
    const onOuterAbort = () => probe.abort();
    signal?.addEventListener("abort", onOuterAbort);
    const probeTimer = setTimeout(() => probe.abort(), LOADED_PROBE_TIMEOUT_MS);

    try {
      const res = await fetch(bust(endpoint.ping(), `ll-${started}`), {
        cache: "no-store",
        signal: probe.signal,
      });
      await res.arrayBuffer();
      const rtt = performance.now() - started;
      probes.push(rtt);
      onProbe?.(rtt);
    } catch {
      if (signal?.aborted) throw new TestAborted();
      /* a dropped or timed-out probe under load is itself signal — skip it */
    } finally {
      clearTimeout(probeTimer);
      signal?.removeEventListener("abort", onOuterAbort);
    }

    await sleep(90, signal);
  }
  return probes;
}

/**
 * Fewest usable probes before a bufferbloat grade means anything. Below this the
 * link was either saturated to the point of dropping every probe, or the browser
 * never gave them a socket — neither of which is a latency measurement.
 *
 * Ten rather than three, because the grade is now taken from the p95 of these
 * probes. The p95 of three samples IS the maximum, so a single freak stall would
 * have set the grade outright — the same trap that once made "p95" and "max" the
 * same column in the latency panel. A healthy phase collects roughly sixty
 * probes, so ten is easily met; below it, "not measurable" is the honest answer.
 */
export const MIN_LOADED_PROBES = 10;

/**
 * @param {number} increase ms of added latency under load
 * @returns {BufferbloatResult["grade"]}
 */
export function gradeBufferbloat(increase) {
  // Bands are on the LATENCY ADDED under load, in ms. A grade is a promise about
  // what the connection feels like, so the boundaries are set where behaviour
  // actually changes: under 30ms a call stays smooth, past 300ms it breaks.
  if (increase < 30) return "A";
  if (increase < 75) return "B";
  if (increase < 150) return "C";
  if (increase < 300) return "D";
  return "F";
}

/**
 * Grade bufferbloat from the idle median vs the probes taken under load.
 *
 * @param {number} idleMedian
 * @param {number[]} loadedSamples
 * @returns {BufferbloatResult | null} null when too few probes landed to judge
 */
export function bufferbloatFrom(idleMedian, loadedSamples) {
  // Too few probes survived to describe anything. Reporting a grade from one or
  // two stragglers is how a browser connection queue got presented to a user as
  // "+35534 ms under load, grade F" — a number about Chrome, not their router.
  if (loadedSamples.length < MIN_LOADED_PROBES) return null;

  // The TAIL under load, not the middle of it. Bufferbloat is felt when a
  // packet lands behind a full queue, which is a p95 event — taking the median
  // of the loaded probes averages those spikes away and reports a comfortable
  // number for a link that stutters every few seconds.
  const sorted = [...loadedSamples].sort((a, b) => a - b);
  const loaded = percentile(sorted, 95);
  const increase = Math.max(0, Math.round(loaded - idleMedian));
  return {
    idle: Math.round(idleMedian),
    loaded: Math.round(loaded),
    increase,
    grade: gradeBufferbloat(increase),
  };
}

/**
 * Width of the window the LIVE tile reports over.
 *
 * The live figure and the final figure answer different questions and are
 * computed differently on purpose. The final one is the rate the link sustained,
 * a trimmed mean over the whole phase, and it must be stable. The live one is
 * what the link is doing right now, and it must react — throttle a connection
 * mid-test and the tile has to follow within about a second.
 *
 * Reporting the cumulative average for both made the tile almost inert: clamping
 * a real 88.8 Mbps connection to 1 Mbps moved the displayed number to 87.1 over
 * three full seconds, because three seconds of near-zero throughput barely shift
 * an average already built from six seconds of fast transfer.
 */
export const LIVE_WINDOW_MS = 1000;

/**
 * A rolling byte log that answers "what is the rate over the last second".
 *
 * @param {number} startAt origin of the timeline the caller stamps events on.
 *   Callers pass PHASE-RELATIVE times, so this is 0 — handing it an absolute
 *   performance.now() made every span negative and the live tile never updated
 *   at all.
 * @returns {(now: number, bytes: number) => number | null} null until the window
 *   is wide enough to divide by
 */
function createLiveRate(startAt) {
  /** @type {{ t: number, bytes: number }[]} */
  const events = [];
  let head = 0;

  return (now, bytes) => {
    events.push({ t: now, bytes });

    // Early in the phase the window is not yet a full second wide, so it spans
    // whatever has elapsed — dividing by a second that has not happened would
    // under-report while the tile is still filling in.
    const span = Math.min(LIVE_WINDOW_MS, now - startAt);
    if (span < MIN_SAMPLE_MS) return null;

    const from = now - span;
    while (head < events.length && (events[head]?.t ?? 0) < from) head += 1;
    // Compact occasionally so a fast link cannot grow this without bound.
    if (head > 4096) {
      events.splice(0, head);
      head = 0;
    }

    let sum = 0;
    for (let i = head; i < events.length; i += 1) sum += events[i]?.bytes ?? 0;
    return bpsToMbps(sum, span);
  };
}

/**
 * Counts bytes across parallel streams for a fixed wall-clock window, then
 * divides only the post-warmup bytes by the post-warmup time.
 *
 * @param {(mbps: number, fraction: number) => void} [onProgress]
 * @param {AbortSignal} [signal]
 * @param {import("./endpoints.js").Endpoint} [endpoint]
 * @param {(mbps: number) => void} [onSample] one per closed interval, for the
 *   stability score — the raw distribution of throughput over the phase.
 * @returns {Promise<number>} Mbps
 */
export async function measureDownload(onProgress, signal, endpoint = cloudflareEndpoint, onSample) {
  // Capped so a concurrent latency probe can still get a socket on HTTP/1.1.
  const streams = safeStreamCount(endpoint);
  const t0 = performance.now();
  let total = 0;
  let warmupBytes = 0;
  let warmupDone = false;
  let stop = false;

  /**
   * Bytes per BUCKET_MS interval after warm-up. One average over the whole
   * window is at the mercy of whatever happened during it — a single stall or a
   * burst moves the result by tens of Mbps. Per-interval samples let the
   * outliers be trimmed and the typical rate reported.
   *
   * @type {number[]}
   */
  const buckets = [];
  let bucketBytes = 0;
  let bucketStart = 0;
  const liveRate = createLiveRate(0);

  // Cancelling the requests as well as the readers means eight streams don't
  // keep pulling bytes — and burning the user's data — after the window closes.
  const internal = new AbortController();
  const stopAll = () => {
    stop = true;
    internal.abort();
  };
  const timer = setTimeout(stopAll, MEASURE_MS);
  signal?.addEventListener("abort", stopAll);

  /** @param {number} id */
  const stream = async (id) => {
    let seq = 0;
    while (!stop) {
      // An error page is bytes too. Counting them measured how fast the edge
      // could serve a 404, which is neither the payload asked for nor a rate
      // anyone would recognise as their download speed — so a non-OK response
      // never reaches the byte counter. A transient one is retried; a permanent
      // one throws, and the caller's failover moves to the next endpoint.
      const res = await fetchWithRetry(
        (attempt) => bust(endpoint.down(25_000_000), `${id}-${seq++}-${attempt}`),
        { cache: "no-store", signal: internal.signal },
        signal,
      );
      if (!res.body) break;
      const reader = res.body.getReader();
      while (!stop) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        const elapsed = performance.now() - t0;
        if (!warmupDone && elapsed >= WARMUP_MS) {
          warmupBytes = total;
          warmupDone = true;
        }
        if (warmupDone) {
          if (!bucketStart) bucketStart = elapsed;
          bucketBytes += value.length;
          // Close a bucket every BUCKET_MS and start the next one.
          if (elapsed - bucketStart >= BUCKET_MS) {
            const interval = bpsToMbps(bucketBytes, elapsed - bucketStart);
            buckets.push(interval);
            // Per-interval throughput, published so the stability score can be
            // computed from how much the rate actually varied. Only the
            // download's samples are exported: mixing them with the upload's
            // would compute variation across two different rates, so an
            // ordinary asymmetric line would score as wildly unstable.
            onSample?.(interval);
            bucketBytes = 0;
            bucketStart = elapsed;
          }
        }

        // The live tile reports the last second, so it tracks the link rather
        // than averaging over the phase so far.
        const live = liveRate(elapsed, value.length);
        if (warmupDone && live !== null) onProgress?.(live, elapsed / MEASURE_MS);
      }
      reader.cancel().catch(() => {});
    }
  };

  try {
    await Promise.all(Array.from({ length: streams }, (_, i) => stream(i).catch(() => {})));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stopAll);
  }

  assertLive(signal);
  const elapsed = performance.now() - t0;

  // Nothing arrived. Better to fail the run than to divide zero by something and
  // present the answer as a speed.
  if (!total) throw new Error("No download data received");

  // The same near-zero-denominator trap the live path guards against, which the
  // final figure was missing: if every stream dies just after the warm-up
  // cutoff, the post-warmup window can be a couple of milliseconds wide and the
  // bytes already counted divide out to a fictional gigabit. When the window is
  // too narrow to divide by, fall back to the whole-run average, which is always
  // defensible even if it includes the ramp.
  const measured = elapsed - WARMUP_MS;
  // Discarding the warm-up is only valid if something arrived after it. When the
  // last chunk lands on the cutoff itself, `warmupBytes` equals `total`, and the
  // post-warmup window then holds real elapsed time and zero bytes — which
  // divides to a confident 0.0 Mbps for a link that had just delivered 16 MB.
  // Zero is not a measurement of anything here; it is the same collapsed
  // division as the near-zero denominator below, seen from the other side.
  const postWarmupBytes = total - warmupBytes;
  if (!warmupDone || measured < MIN_SAMPLE_MS || postWarmupBytes <= 0) {
    if (elapsed < MIN_SAMPLE_MS) throw new Error("Download ended too quickly to measure");
    return bpsToMbps(total, elapsed);
  }

  // Prefer the trimmed mean of the interval samples; fall back to the flat
  // average when the window was too short to produce enough of them.
  const trimmed = trimmedMean(buckets);
  return trimmed ?? bpsToMbps(total - warmupBytes, measured);
}

/** Width of one throughput sample. */
export const BUCKET_MS = 250;
/** Fewest samples worth trimming; below this the flat average is used. */
export const MIN_BUCKETS = 6;

/**
 * Mean of the middle 60% of samples.
 *
 * Trimming both ends removes the two things that made repeated runs disagree: a
 * momentary stall dragging the average down, and an early burst out of cache or
 * a fast first congestion window pulling it up. What is left is the rate the
 * link actually sustained.
 *
 * @param {number[]} samples
 * @returns {number | null} null when there are too few to trim meaningfully
 */
export function trimmedMean(samples) {
  if (samples.length < MIN_BUCKETS) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const drop = Math.floor(sorted.length * 0.2);
  const kept = sorted.slice(drop, sorted.length - drop);
  if (!kept.length) return null;
  return kept.reduce((a, b) => a + b, 0) / kept.length;
}

/**
 * `crypto.getRandomValues` refuses more than 65,536 bytes per call, so a large
 * buffer has to be filled a chunk at a time.
 *
 * Getting this wrong is invisible and expensive. The previous version
 * randomised only the first 64 KB and left the remaining 99.2% of an 8 MB body
 * as zeros, which gzips to 0.92% of its size: any hop that compressed the
 * request would have moved about 73 KB while the client counted a full 8 MB and
 * reported the difference as uplink speed — a 109x overstatement. Random bytes
 * are incompressible, so the number of bytes counted is the number that
 * travelled.
 *
 * @param {number} bytes
 * @returns {Uint8Array}
 */
export function randomPayload(bytes) {
  const MAX_PER_CALL = 65_536;
  const buffer = new Uint8Array(bytes);
  for (let offset = 0; offset < bytes; offset += MAX_PER_CALL) {
    crypto.getRandomValues(buffer.subarray(offset, Math.min(offset + MAX_PER_CALL, bytes)));
  }
  return buffer;
}

/**
 * Bytes actually handed to the network for one upload, as the browser reports
 * them.
 *
 * `fetch` cannot do this: it resolves when the response arrives and says
 * nothing about progress, which is why the previous implementation had to infer
 * throughput from completed POSTs and attribute their bytes back across time.
 * `XMLHttpRequest.upload.onprogress` reports transmitted bytes as they go, so
 * the upload can be counted the same way the download already is — a shared
 * byte counter stamped on every event — instead of reconstructed afterwards.
 *
 * Honest caveat, and the reason the ramp is still discarded: `loaded` counts
 * bytes accepted by the OS socket buffer, which at the start of a request can
 * run ahead of bytes actually on the wire. Over a multi-second window with the
 * opening samples trimmed, that head start is irrelevant; for a single short
 * request it would not be.
 *
 * @param {string} url
 * @param {Uint8Array} body
 * @param {(delta: number) => void} onBytes bytes since the previous event
 * @param {AbortSignal} signal
 * @returns {Promise<void>} resolves when the server has accepted the body
 */
function uploadWithProgress(url, body, onBytes, signal) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let last = 0;

    const onAbort = () => xhr.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => signal.removeEventListener("abort", onAbort);

    xhr.upload.onprogress = (event) => {
      // Deltas, not totals: several streams share one counter, so each must
      // contribute only what it moved since it last reported.
      const delta = event.loaded - last;
      last = event.loaded;
      if (delta > 0) onBytes(delta);
    };
    xhr.onload = () => {
      cleanup();
      // A rejected upload still fires onload. Without a status check a 413, a
      // 500 or a captive-portal redirect would count its whole request buffer
      // as successfully transferred, so a server refusing the data would report
      // the fastest uplink the client could produce.
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`HTTP ${xhr.status}`));
    };
    xhr.onerror = () => {
      cleanup();
      reject(new Error("Upload failed"));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new TestAborted());
    };

    xhr.open("POST", url, true);
    // Deliberately no Content-Type. "application/octet-stream" is not a
    // CORS-safelisted value, so setting it turns every upload into a preflight
    // OPTIONS followed by the POST — a wasted round trip per request, inside the
    // window being measured. Sending a raw view leaves the header unset, which
    // keeps each upload a simple request. The endpoint does not inspect it.
    //
    // A view over an ArrayBuffer is a valid XHR body; the DOM typings model the
    // accepted union more narrowly than the specification does.
    xhr.send(/** @type {XMLHttpRequestBodyInit} */ (/** @type {unknown} */ (body)));
  });
}

/**
 * Upload throughput, counted from bytes the browser reports as transmitted.
 *
 * @param {(mbps: number, fraction: number) => void} [onProgress]
 * @param {AbortSignal} [signal]
 * @param {import("./endpoints.js").Endpoint} [endpoint]
 * @param {number} [downMbps] measured download, used to seed the first chunk
 * @returns {Promise<number>} Mbps
 */
export async function measureUpload(onProgress, signal, endpoint = cloudflareEndpoint, downMbps = 0) {
  // Chunk size adapts to the link. A fixed 4 MB chunk was the single worst
  // stall in the whole test: on a 5 Mbps uplink one chunk takes ~6s, four
  // streams put 16 MB in flight, and because a POST cannot be interrupted
  // between bytes the run overshot its 2.5s window by twenty seconds. Starting
  // small keeps every POST short enough to react to the deadline, and doubling
  // on fast round trips still saturates a gigabit uplink within the window.
  // 64 KB rather than 256 KB: at 1 Mbps a 256 KB chunk needs two seconds and
  // never finished inside the window, which is how every slow uplink ended up
  // reporting the same fabricated 0.8 Mbps. 64 KB completes in about half a
  // second there, and the doubling below still reaches a saturating chunk size
  // on a fast link within the same window.
  const MIN_CHUNK = 64_000;
  const MAX_CHUNK = 8_000_000;
  const TARGET_POST_MS = 700;
  // Time for the router's queue to drain after the download phase.
  const SETTLE_MS = 400;
  // If not one chunk has completed when the window closes, allow a little
  // longer rather than giving up: one real chunk beats a fabricated rate. Kept
  // short, because this extension is time the user spends watching a spinner.
  const GRACE_MS = 2000;

  const payload = randomPayload(MAX_CHUNK);

  // The download that just finished leaves the router's queue full, and an
  // upload started into that measures the tail of the download rather than the
  // uplink: instrumenting a real run showed 64 KB posts taking 621ms where the
  // same posts took 86ms on a settled link. A brief pause costs a fraction of a
  // second and is the difference between measuring the uplink and measuring
  // congestion this test caused itself.
  //
  // Deliberately a fixed wait, and deliberately short. An adaptive version that
  // probed until the uplink stopped improving was built and then removed: a
  // sweep of settle delays on a real link measured 40.8 Mbps with no extra wait
  // against 0.4 Mbps after waiting two seconds more, so waiting longer was not
  // merely useless but actively worse. The probes also pushed more data at an
  // endpoint that turned out to throttle sustained uploads, making the very
  // problem worse that they were meant to diagnose.
  await sleep(SETTLE_MS, signal);

  const t0 = performance.now();

  // Seed the chunk from what the download already told us instead of starting
  // blind at the floor. Uplinks are typically a fraction of the downlink, so a
  // tenth is a deliberately conservative first guess; the controller corrects
  // within a request or two.
  //
  // Divided by the stream count, because UP_STREAMS requests are in flight at
  // once and they share the uplink — each gets its share, not all of it. Sizing
  // every chunk for the whole link made each request take UP_STREAMS times
  // longer than intended, and on a slow uplink that overshot the window so
  // nothing completed and the phase failed outright. The trigger was perverse:
  // a FASTER download produced a bigger seed, so measuring a good downlink is
  // what broke the upload.
  const seed = downMbps > 0 ? ((downMbps / 10) * 125 * TARGET_POST_MS) / UP_STREAMS : 0;
  let chunk = Math.min(MAX_CHUNK, Math.max(MIN_CHUNK, Math.round(seed) || MIN_CHUNK));

  // Bytes transmitted, accumulated exactly as the download accumulates received
  // bytes: one counter, stamped on every progress event, bucketed by wall clock.
  // Upload and download now share an estimator instead of each having their own.
  let total = 0;
  let warmupBytes = 0;
  let warmupDone = false;
  /** @type {number[]} */
  const buckets = [];
  let bucketBytes = 0;
  let bucketStart = 0;
  /** Set once any byte has been reported, so a dead uplink is distinguishable. */
  let sawBytes = false;
  const liveRate = createLiveRate(0);

  const internal = new AbortController();
  const stopAll = () => internal.abort();
  signal?.addEventListener("abort", stopAll);
  const timer = setTimeout(stopAll, UPLOAD_MEASURE_MS);

  /** @param {number} delta bytes since this stream last reported */
  const countBytes = (delta) => {
    sawBytes = true;
    total += delta;
    const elapsed = performance.now() - t0;
    if (!warmupDone && elapsed >= WARMUP_MS) {
      warmupBytes = total;
      warmupDone = true;
    }
    if (!warmupDone) return;

    if (!bucketStart) bucketStart = elapsed;
    bucketBytes += delta;
    if (elapsed - bucketStart >= BUCKET_MS) {
      buckets.push(bpsToMbps(bucketBytes, elapsed - bucketStart));
      bucketBytes = 0;
      bucketStart = elapsed;
    }

    const live = liveRate(elapsed, delta);
    if (live !== null) onProgress?.(live, elapsed / UPLOAD_MEASURE_MS);
  };

  const stream = async () => {
    while (!internal.signal.aborted) {
      const size = chunk;
      const started = performance.now();
      await uploadWithProgress(
        bust(endpoint.up(), `${started}`),
        payload.subarray(0, size),
        countBytes,
        internal.signal,
      );
      // Steer the next request toward TARGET_POST_MS using the rate just
      // observed. A proportional step converges in one move; the doubling it
      // replaced overshot to an 8 MB request taking 2.5s, which put most of the
      // window inside a single upload.
      const took = Math.max(1, performance.now() - started);
      chunk = Math.min(MAX_CHUNK, Math.max(MIN_CHUNK, Math.round((size / took) * TARGET_POST_MS)));
    }
  };

  try {
    await Promise.all(Array.from({ length: UP_STREAMS }, () => stream().catch(() => {})));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stopAll);
  }

  assertLive(signal);

  // Nothing was transmitted at all. There is no honest number to report: an
  // earlier version divided a fixed chunk size by the window, which answered
  // 0.82 Mbps for every slow uplink regardless of its actual speed.
  if (!sawBytes || !total) {
    throw new Error("Upload too slow to measure — no data completed in time");
  }

  const elapsed = performance.now() - t0;
  const measured = elapsed - WARMUP_MS;
  const postWarmupBytes = total - warmupBytes;

  // Discarding the warm-up is only valid if something moved after it. When the
  // uplink is slow enough that everything landed inside the warm-up, the
  // post-warmup window holds real elapsed time and no bytes, which divides to a
  // confident 0.0 Mbps for a link that did transmit.
  if (!warmupDone || measured < MIN_SAMPLE_MS || postWarmupBytes <= 0) {
    if (elapsed < MIN_SAMPLE_MS) throw new Error("Upload ended too quickly to measure");
    return bpsToMbps(total, elapsed);
  }

  // Trimmed mean of the interval samples, falling back to the flat rate when the
  // window was too short to produce enough of them.
  const trimmed = trimmedMean(buckets);
  return trimmed ?? bpsToMbps(postWarmupBytes, measured);
}

/**
 * Cold-cache lookup against a DNS-over-HTTPS resolver. The random label
 * guarantees a real recursive resolution rather than a cached answer.
 *
 * @param {AbortSignal} [signal]
 * @returns {Promise<number | null>} median ms, or null if every probe failed
 */
export async function measureDns(signal) {
  /** @type {number[]} */
  const samples = [];

  for (let i = 0; i < DNS_PROBES; i += 1) {
    assertLive(signal);
    // crypto, not Math.random: the label only has to be unique, but keeping
    // every byte in a measurement path cryptographically sourced means an audit
    // for Math.random anywhere near a measurement returns nothing at all.
    const host = `${randomHex(8)}.cloudflare.com`;

    // Bounded like every other probe: a resolver that never answers must not
    // hold the phase open.
    const probe = new AbortController();
    const onOuterAbort = () => probe.abort();
    signal?.addEventListener("abort", onOuterAbort);
    const probeTimer = setTimeout(() => probe.abort(), PROBE_TIMEOUT_MS);

    const started = performance.now();
    try {
      const res = await fetch(`${DNS_URL}?name=${host}&type=A`, {
        headers: { accept: "application/dns-json" },
        cache: "no-store",
        signal: probe.signal,
      });

      // A refusal is not a resolution. Without this check, a filtering proxy
      // answering 403 had the time it took to refuse recorded as the user's DNS
      // speed — a fast rejection looked like a fast resolver.
      if (!res.ok) throw new Error(`DNS query failed with HTTP ${res.status}`);

      // A captive portal can answer 200 with an HTML interstitial. A genuine
      // DNS-over-HTTPS reply always carries a numeric Status field.
      const body = await res.json();
      if (typeof body?.Status !== "number") throw new Error("Not a DNS response");

      // The first probe pays TLS and connection setup to a host nothing else on
      // the page has contacted, so it measures the handshake rather than the
      // lookup. The latency phase discards its first sample for the same reason.
      if (i > 0) samples.push(performance.now() - started);
    } catch {
      if (signal?.aborted) throw new TestAborted();
      /* a failed lookup is excluded rather than timed */
    } finally {
      clearTimeout(probeTimer);
      signal?.removeEventListener("abort", onOuterAbort);
    }
  }

  if (!samples.length) return null;
  return Math.round(median(samples));
}

/**
 * Stability from the observed latency spread — never a random number.
 *
 * @param {number[]} samples
 * @param {number | null} jitter null when too few probes to know
 * @param {number} loss
 * @param {number[]} [throughputSamples] per-interval download Mbps
 * @returns {number | null} 0-100, or null when jitter is unknown
 */
export function stabilityFrom(samples, jitter, loss, throughputSamples = []) {
  // Stability is a function of jitter; without one there is nothing to compute,
  // and defaulting jitter to zero would score an unmeasured link as perfect.
  if (!samples.length || jitter === null) return null;

  // EXACT FORMULA, so the number is auditable:
  //
  //   stability = 100 − throughputPenalty − jitterPenalty − lossPenalty
  //               clamped to 0…100
  //
  //   throughputPenalty = min(40, (stddev(mbps) / mean(mbps)) × 100)
  //       The coefficient of variation of the per-interval throughput samples.
  //       Dimensionless, so a 500 Mbps line wobbling by 50 Mbps scores the same
  //       as a 5 Mbps line wobbling by 0.5 — which is the point, since a user
  //       feels proportional variation, not absolute.
  //   jitterPenalty     = min(30, (jitter / ping) × 100)
  //       Also a ratio: 20ms of jitter is unremarkable on a 200ms satellite link
  //       and terrible on a 5ms fibre one.
  //   lossPenalty       = min(30, loss% × 4)
  //
  // Each is capped so no single dimension can zero the score alone. An earlier
  // model multiplied jitter by 3 with no ceiling, so an ordinary mobile link
  // with 35ms of jitter scored 0 — indistinguishable from a dead connection. A
  // score has to keep discriminating at the bad end or it says nothing.
  //
  // Throughput variation was previously absent entirely: the tile sits beside
  // Download and Upload and is read as "is my speed steady", but the figure was
  // computed from latency spread alone and a link whose throughput swung wildly
  // at constant latency scored perfectly.
  const throughputPenalty = coefficientOfVariation(throughputSamples) * 100;

  const ping = median(samples);
  const jitterRatio = ping > 0 ? (jitter / ping) * 100 : jitter;

  const penalties =
    Math.min(40, throughputPenalty) + Math.min(30, jitterRatio) + Math.min(30, loss * 4);

  return Math.round(Math.max(0, Math.min(100, 100 - penalties)));
}

/**
 * Standard deviation over the mean. Returns 0 when there is too little to judge,
 * so an unmeasured dimension costs nothing rather than being penalised blindly.
 *
 * @param {number[]} values
 * @returns {number}
 */
export function coefficientOfVariation(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean <= 0) return 0;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

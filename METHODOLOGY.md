# WifiPlus Internet Measurement Methodology

WifiPlus provides honest, browser-native internet measurement. Every metric is computed strictly from live network transfers, high-precision performance timers (`performance.now()`), and empirical sample statistics. This document explains what each number means, how it is derived, and what browser technical boundaries exist.

---

## 1. Zero Synthetic Data Policy

WifiPlus strictly prohibits synthetic data generation, artificial interpolation into unmeasured time ranges, and `Math.random()` anywhere inside the measurement engine. 

- **Isolation**: measurement runs inside a dedicated Web Worker (`worker/measure.js`), so stream reading and statistics never block the UI thread. Only structured-cloneable plain data crosses `postMessage` — posting a live endpoint object threw a `DataCloneError` before any byte moved, and failed every run.
- **Rendering**: the main thread draws the values the engine reports, as it reports them. The gauge needle and the throughput graph are animated between measured samples for smoothness; no metric value is ever extrapolated past the latest measurement, and no tile is ever filled from a timer.
- **Validation**: `NaN`, `Infinity`, negative and null values are rejected before display. A tile shows an em dash and a state badge rather than a number the engine did not produce.

---

## 2. Metric states

Every card carries an explicit state, derived in `core/metric-state.js` from the value behind it — never written by hand into the markup. A card can only read **measured** when a finite, non-negative number exists for it.

- **`not tested`** — no run has produced this metric yet.
- **`measuring`** — the phase that produces it is in flight. The tile may already show a live reading; it is not the run's answer until the phase ends.
- **`measured`** — a real value, validated against `NaN`, `Infinity` and negatives.
- **`unavailable`** — the phase completed and produced nothing usable (a blocked resolver, too few surviving probes).
- **`failed`** — the phase errored.

`unavailable` and `failed` are deliberately distinct: the first says the measurement cannot be made here, the second says it broke, and only the second is worth retrying.

---

## 3. Metric-by-Metric Breakdown

All windows and thresholds below are the exported constants in `core/measure.js`; the numbers here and the numbers in the code are the same numbers.

### Download Throughput (Mbps)
- **Endpoint**: `GET /download?bytes=N` on a self-hosted edge, or Cloudflare's `__down?bytes=N` by default. Every request carries a unique cache-buster (`cb` plus a `crypto`-sourced random suffix), so nothing is served from cache.
- **Concurrency**: `DOWN_STREAMS` = 8 parallel streams, reduced to `H1_MAX_STREAMS` = 5 when the negotiated protocol is HTTP/1.1 — read from resource timing, not assumed. Over-opening connections on HTTP/1.1 corrupts the concurrent latency probes.
- **Window**: `MEASURE_MS` = 6000 ms, with the first `WARMUP_MS` = 500 ms discarded while the congestion window ramps.
- **Final value**: bytes are binned into `BUCKET_MS` = 250 ms intervals and reduced by `trimmedMean` — the mean of the middle 60% of bins, requiring at least `MIN_BUCKETS` = 6. Trimming both tails removes a momentary stall dragging the figure down and an early burst pulling it up. Below 6 bins the flat rate over the post-warm-up window is used.
- **Live value**: computed over a rolling `LIVE_WINDOW_MS` = 1000 ms so the tile tracks a change in link speed within about a second. The live figure and the final figure answer different questions and are computed differently on purpose.

### Upload Throughput (Mbps)
- **Payload**: incompressible bytes from `crypto.getRandomValues()`, filled in full rather than only the first chunk — a partially-zeroed buffer compresses on any intermediate hop, and the client would count bytes that never travelled.
- **Concurrency and window**: `UP_STREAMS` = 4 over `UPLOAD_MEASURE_MS` = 4000 ms. The chunk size is seeded from the already-measured download rate, so a fast uplink saturates inside the window instead of ramping from the floor.
- **Accounting**: throughput is the bytes a request actually completed over elapsed time, not time since request initiation.
- **Failure is not fatal**: a run whose upload fails reports `upload: null` with a note naming the reason, and keeps the six metrics that measured cleanly.

### Idle Latency (Ping and Jitter)
- **Ping**: up to `PING_SAMPLES` = 20 sequential zero-byte requests, each bounded by `PROBE_TIMEOUT_MS` = 1500 ms. The first is discarded — it pays TCP and TLS setup. Timed with `performance.now()` around the fetch. The headline figure is the **median**; min, max, p95 and standard deviation are all reported.
- **Adaptive budget**: the phase exits early once it has `PING_MIN_SAMPLES` = 6 samples past `PING_BUDGET_MS` = 1200 ms, so its cost does not scale with the user's latency, and stops unconditionally at `PING_CEILING_MS` = 4000 ms.
- **Jitter**: mean absolute deviation between **consecutive** round trips (RFC 3550), computed in arrival order before sorting for percentiles. With fewer than two samples it is reported as unavailable, not as zero — one probe cannot express variation between probes.

### Packet Loss (%) — application-level
- **What is measured**: the share of latency probes that failed or timed out, out of the probes **actually sent** — not out of the planned 20, so a phase that exits early cannot report phantom loss.
- **What is NOT measured**: true ICMP packet loss. A browser cannot observe it, and TCP hides it by retransmitting. There is no WebRTC datagram channel in the shipped engine. The card is labelled *App-level Packet Loss* for exactly this reason, and the figure should be read as a probe failure rate.

### DNS Latency (ms)
- **Method**: `DNS_PROBES` = 4 lookups of a freshly randomised label (`<random>.cloudflare.com`) over DNS-over-HTTPS, forcing real recursive resolution rather than a cached answer. The first is discarded for handshake cost; the median of the rest is reported.
- **Validation**: a non-2xx response, or a 200 without a numeric DNS `Status` field (a captive-portal interstitial), is rejected rather than timed — otherwise a fast refusal reads as a fast resolver.
- **Limitation**: this times the DoH resolver, **not** the resolver the operating system is configured to use. A browser cannot query that one, nor read `domainLookupStart` for a cross-origin host with the precision this needs. If every probe fails the metric is reported as unavailable.

### Loaded Latency and Bufferbloat
- **Method**: latency probes run **concurrently with the real download**, spaced 90 ms apart across the download window and bounded at `LOADED_PROBE_TIMEOUT_MS` = 6000 ms each. The link is saturated by the test itself, so no synthetic load is generated and no extra phase is spent.
- **Statistic**: the **p95** of the loaded probes against the idle median. Bufferbloat is felt when a packet lands behind a full queue, which is a tail event; the median of the loaded probes averages those spikes away.
- **Sufficiency**: fewer than `MIN_LOADED_PROBES` = 10 usable probes yields no grade at all, rather than one derived from stragglers.
- **Grades**, on latency *added* under load: **A** under 30 ms, **B** under 75 ms, **C** under 150 ms, **D** under 300 ms, **F** at or above 300 ms.

### Connection Stability Score (%)
Exactly as implemented in `stabilityFrom`:

```
stability = clamp(100 - throughputPenalty - jitterPenalty - lossPenalty, 0, 100)

throughputPenalty = min(40, coefficientOfVariation(download bins) x 100)
jitterPenalty     = min(30, (jitter / median ping) x 100)
lossPenalty       = min(30, loss% x 4)
```

The throughput and jitter terms are ratios, not absolutes: a 500 Mbps line wobbling by 50 Mbps scores the same as a 5 Mbps line wobbling by 0.5, and 20 ms of jitter is unremarkable on a 200 ms satellite link but poor on a 5 ms fibre one. Each term is capped so no single dimension can zero the score alone. If jitter is unknown the score is **unavailable** — defaulting it to zero would grade an unmeasured link as perfect.

---

## 4. Honest Browser Limitation Footnote

> This measures the whole path from this browser, over your WiFi or cable, through your router and your ISP, to the nearest measurement edge — end to end. No web page can isolate the WiFi hop on its own. To find out whether WiFi is your bottleneck, run this once over WiFi and once on an Ethernet cable to the same router and compare.

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
- **Final value**: bytes are binned into `BUCKET_MS` = 250 ms intervals and reduced by `timeWeightedTrimmedMean` — total bytes over total time across the middle 60% **of the phase's duration**, requiring at least `MIN_BUCKETS` = 6 bins. Trimming both tails removes a momentary stall dragging the figure down and an early burst pulling it up. Below 6 bins the flat rate over the post-warm-up window is used.

  The weighting is by time, not by bin count, and the difference is not cosmetic. A bin closes on the first chunk to arrive at or after 250 ms, so a bin is *at least* 250 ms and can be far longer — a two-second stall wakes the reader once and becomes a single 2,000 ms bin. Averaging bins by count gives that stall the same weight as any 250 ms of healthy transfer. Worked through: four seconds at 100 Mbps produces sixteen bins; a two-second stall adds one more. The link moved 50 MB in six seconds, which is 66.7 Mbps. The unweighted mean of those seventeen samples is **100.0 Mbps** — the stall is trimmed away as an outlier entirely. Weighted by time it is 77.8 Mbps. The error only ever flattered, and it flattered worst exactly the unstable connections a speed test exists to expose.
- **Compression check**: each response's decoded byte count is compared against the `Content-Length` it advertised. If decoded bytes exceed it, something on the path re-encoded the payload and the counter is measuring a decompressor rather than a link; the run says so rather than reporting the inflated figure as speed.
- **Live value**: computed over a rolling `LIVE_WINDOW_MS` = 1000 ms so the tile tracks a change in link speed within about a second. The live figure and the final figure answer different questions and are computed differently on purpose.

### Upload Throughput (Mbps)
- **Payload**: incompressible bytes from `crypto.getRandomValues()`, filled in full rather than only the first chunk — a partially-zeroed buffer compresses on any intermediate hop, and the client would count bytes that never travelled.
- **Concurrency and window**: `UP_STREAMS` = 4 over `UPLOAD_MEASURE_MS` = 8000 ms, after a `UPLOAD_SETTLE_MS` = 400 ms pause for the download's queue to drain. The chunk size is seeded from the already-measured download rate and steered toward 700 ms per request, so a fast uplink saturates inside the window instead of ramping from the floor.
- **Accounting — bytes the server acknowledged.** A POST's bytes are counted only once the server has answered 2xx for it. The reported figure is those bytes over the span in which they were acknowledged.

  This is **not** derived from `XMLHttpRequest.upload.onprogress`, which reports bytes accepted by the local socket buffer rather than bytes the peer has. Measured against the default endpoint, one 1 MB POST fired its first progress event at t = 181 ms with 196,608 bytes already reported "loaded" — a fifth of the body attributed to zero elapsed time. Across body sizes the progress-derived rate overstated the wall-clock rate by 1.26x at 4 MB, 1.44x at 1 MB and 9.2x at 256 KB.

  Running both methods against the same link, back to back, three times:

  | | run 1 | run 2 | run 3 | spread |
  |---|---|---|---|---|
  | progress-derived | 41.06 | 24.32 | 11.11 Mbps | 117% of mean |
  | acknowledged bytes | 12.68 | 20.88 | 14.46 Mbps | 51% of mean |

  The first method reported 3.24x the throughput the link demonstrably sustained on one run and *under*-reported on another, so it was never a correctable bias — it was noise. The acknowledged-byte figure is both honest and materially more repeatable.
- **Direction of error**: the figure charges every POST for its response round trip, so a real uplink is at least this fast and never slower. On a measurement people use to judge what they pay for, an error that under-reports is the only kind worth having. This is asserted by a test that drives a link of known speed and fails if the reported figure exceeds it.
- **Live tile**: still driven by `onprogress`, because a tile has to react within a second. It is explicitly not the recorded result, and the two are computed from different sources on purpose.
- **Failure is not fatal**: a run whose upload fails reports `upload: null` with a note naming the reason, and keeps the metrics that measured cleanly.

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
- **Both directions are measured.** Probes run concurrently with the real download *and* concurrently with the real upload, spaced 60 ms apart and bounded at `LOADED_PROBE_TIMEOUT_MS` = 6000 ms each. The link is saturated by the test itself, so no synthetic load is generated and no extra phase is spent. The reported grade is the **worse of the two**: consumer links are asymmetric, the upstream queue is usually the one that fills first, and grading only the download side hands an A to connections that stutter every time they send.

  Measured on one ordinary link: **82 ms idle, 351 ms under download load, 772 ms under upload load** — every probe succeeding, none refused or timed out. Reporting only the download side would have understated the delay this connection actually inflicts by more than a factor of two.
- **The probe never samples an idle link.** Each direction waits for its transfer to saturate before its first sample, and the upload's wait also covers that phase's own settle pause. A probe that fires during the pause measures an idle link while being pooled into a grade about a saturated one, which biases the grade *better* — the one direction an error here must not point. The probe also stops the moment its phase ends, so an upload that fails in milliseconds does not leave probes running against an unloaded link.
- **Every probe is status-checked.** A reply is not an answer: an edge shedding load with 429s, a 502 from a proxy or a captive portal answering instantly would otherwise all be timed as excellent round trips — and because the fetch resolved, the same run would report 0% probe loss. The failure mode is perverse without this check, because the sicker the server, the better the latency it appears to deliver.
- **Statistic**: the **p95** of the loaded probes against the idle median, when there are at least `MIN_LOADED_PROBES` = 10 of them. Bufferbloat is felt when a packet lands behind a full queue, which is a tail event; the median of the loaded probes averages those spikes away.
- **Small samples**: a saturated uplink makes its own probes slow, so few fit in any sane window. Between `MIN_LOADED_PROBES_MEDIAN` = 5 and 10 probes the grade is taken from the **median** instead, and the result records which statistic was used and how many probes backed it. The p95 is never lowered to meet a small sample — the p95 of five samples *is* the maximum, which is the trap the threshold exists to prevent. Below 5 probes there is no grade.
- **Known asymmetry**: the loaded p95 is compared against the idle *median*, not the idle p95. This is deliberate. With `PING_MIN_SAMPLES` = 6, an idle p95 is effectively the idle maximum, and subtracting that would hand an A to a genuinely bloated link.
- **Grades**, on latency *added* under load: **A** under 30 ms, **B** under 75 ms, **C** under 150 ms, **D** under 300 ms, **F** at or above 300 ms.

### Measurement Quality and the Verified / Partial / Incomplete verdict

Arithmetic honesty is not the same as trustworthiness. A run taken in a backgrounded tab, or against an edge that failed over halfway through, or from four latency probes, is exactly as arithmetically honest as a clean one and means far less. `core/quality.js` grades every run on two independent axes and the result carries the grade.

**Reconciliation.** Each throughput phase reports its headline figure *and* an independently computed flat bytes-over-time rate. They are not expected to be equal — the statistical one deliberately excludes the congestion-window ramp — but a gap beyond `RECONCILE_TOLERANCE` = 35% means the two calculations are describing different things, and the run says so rather than picking one. On healthy runs the observed gap sits between 4% and 22%.

**Sufficiency and conditions.** Sample counts are checked against the same constants the statistics need. Four environmental facts cap the grade regardless of how good the arithmetic looks:

- the tab was backgrounded during measurement, where the browser throttles timers and network
- the device lost its connection mid-run
- a phase failed over to a different edge, so not every figure describes the same path
- the measurement server reported itself under load, which can limit throughput before the connection does

**The verdict.**

- **Verified** — every check passed. Every figure reconciled against the bytes and probes behind it, and the conditions allow the reading to stand.
- **Partial** — the run completed and the figures are real, but at least one check did not pass. The reasons are listed individually rather than summarised.
- **Incomplete** — the run did not produce a measurement that can be relied on. Nothing in it should be read as a connection speed.

The word "verified" is earned rather than decorative, and the panel shows the checks that *passed* as well as the ones that did not, so a reader can disagree with any of them.

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

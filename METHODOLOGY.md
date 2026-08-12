# WifiPlus Internet Measurement Methodology

WifiPlus provides honest, browser-native internet measurement. Every metric is computed strictly from live network transfers, high-precision performance timers (`performance.now()`), and empirical sample statistics. This document explains what each number means, how it is derived, and what browser technical boundaries exist.

---

## 1. Zero Synthetic Data Policy

WifiPlus strictly prohibits synthetic data generation, artificial interpolation into unmeasured time ranges, and `Math.random()` anywhere inside the measurement engine. 

- **Snapshots**: Measurement runs inside an isolated Web Worker (`worker/measure.js`) at 10 Hz.
- **Rendering**: The main UI thread renders via `requestAnimationFrame`, interpolating strictly between ALREADY-measured snapshots for visual smoothness. No value is ever extrapolated past the latest worker measurement.

---

## 2. Badging: Measured vs. Estimated

Every card in the interface displays an explicit badging indicator:
- **`measured`**: Direct observation of network state without proxy distortion (e.g. streaming download chunks, WebRTC UDP datagram loss, direct `PerformanceResourceTiming` latency).
- **`estimated`**: Metrics derived from proxy signals or fallbacks (e.g., client POST progress events before TCP ACK confirmation, DNS latency measured via DoH or server-side recursive lookup, or timeout-based HTTP probe failure rates).

---

## 3. Metric-by-Metric Breakdown

### Download Throughput (Mbps)
- **Endpoint**: `GET /download?bytes=N` (with `Cache-Control: no-store, no-transform` and `Content-Encoding: identity`).
- **Adaptive Concurrency**: Starts with 1 stream. Every 500 ms, adds an extra stream if aggregate throughput improves by > 10%. Capped at 8 streams over HTTP/2, 6 over HTTP/3, and up to 16 for speeds exceeding 500 Mbps.
- **Payload Tiering**: Probes link speed to select payloads (100 KB to 250 MB) ensuring each stream transfers data for 4–6 seconds.
- **Windowing & Percentiles**: Bytes are binned into 100 ms intervals. Warm-up periods (first 1000 ms or until 3-bin derivative < 5%) are discarded to eliminate TCP/QUIC slow-start distortion. The final reported value is the **90th percentile (p90)** of 100 ms bin throughputs.

### Upload Throughput (Mbps)
- **Payload**: Pre-generated incompressible byte buffer using `crypto.getRandomValues()` in 64 KB chunks, reused across streams to prevent CPU bottlenecks.
- **Transport**: `fetch()` with `ReadableStream` body and `duplex: 'half'` (Chromium 105+), falling back to `XMLHttpRequest.upload.onprogress`.
- **Mitigation of Socket Buffering**: Socket buffers inflate early progress events. Streams send >= 8 MB payloads, discard the first 1500 ms, and prioritize server-measured timing (`Server-Timing` headers) over client progress.

### Idle Latency (Ping & Jitter)
- **Ping**: 25 sequential requests over an established keep-alive connection, spaced 100 ms apart. Discards the first 3 warm-up probes. Measures `PerformanceResourceTiming: responseStart - requestStart`. Reported headline is the **median RTT**.
- **Jitter**: Computed as the **mean absolute consecutive deviation** ($\text{mean}(|L_i - L_{i-1}|)$). RFC 3550 smoothed jitter is also logged in the JSON output. Requires >= 10 valid probes; otherwise, reported as Unavailable.

### Packet Loss (%)
- **WebRTC Channel**: Opens an `RTCPeerConnection` with an unreliable, unordered DataChannel (`{ ordered: false, maxRetransmits: 0 }`). Sends 1000 x 200-byte datagrams at 100/s over 10 s while server echoes sequence numbers back. Loss = `1 - (unique received / sent)`.
- **Fallback**: If WebRTC is blocked by a corporate firewall or VPN, falls back to HTTP probe failure rate, relabeled as **Probe failure rate** and badged **estimated**.

### DNS Latency (ms)
- **Uncached Wildcard Probes**: Generates fresh unique subdomains (`<uuid>.probe.domain.com`) to force full recursive resolution through the local DNS resolver, timing `domainLookupEnd - domainLookupStart`.
- **Fallback**: If wildcard timing is unavailable in the browser environment, measures Cloudflare DNS-over-HTTPS (DoH) or server-side resolver timing, marked **estimated**.

### Loaded Latency & Bufferbloat
- **Bufferbloat Measurement**: Idle ping probes are executed during download saturation and upload saturation phases.
- **Grades**: Evaluates latency increase over idle baseline:
  - **A+**: < 5 ms increase
  - **A**: < 20 ms increase
  - **B**: < 50 ms increase
  - **C**: < 100 ms increase
  - **D**: < 200 ms increase
  - **F**: >= 200 ms increase

### Connection Stability Score (%)
- **Formula**:
  $$\text{CV}_{\text{down}} = \frac{\text{stddev}(\text{down bins})}{\text{mean}(\text{down bins})}, \quad \text{CV}_{\text{up}} = \frac{\text{stddev}(\text{up bins})}{\text{mean}(\text{up bins})}$$
  $$\text{jitter}_{\text{norm}} = \text{clamp}\left(\frac{\text{jitter}_{\text{ms}}}{30}, 0, 1\right), \quad \text{loss}_{\text{norm}} = \text{clamp}\left(\frac{\text{loss}_{\%}}{5}, 0, 1\right)$$
  $$\text{Stability} = 100 \times \left(1 - \text{clamp}(0.30\,\text{CV}_{\text{down}} + 0.20\,\text{CV}_{\text{up}} + 0.25\,\text{jitter}_{\text{norm}} + 0.25\,\text{loss}_{\text{norm}}, 0, 1)\right)$$
- If any input is unavailable, weights are automatically renormalized across active metrics.

---

## 4. Honest Browser Limitation Footnote

> This measures the whole path from this browser, over your WiFi or cable, through your router and your ISP, to the nearest measurement edge — end to end. No web page can isolate the WiFi hop on its own. To find out whether WiFi is your bottleneck, run this once over WiFi and once on an Ethernet cable to the same router and compare.

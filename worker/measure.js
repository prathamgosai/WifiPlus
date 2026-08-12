/**
 * WifiPlus Web Worker Measurement Engine — worker/measure.js
 * -----------------------------------------------------------------------------
 * Isolated measurement engine running inside a dedicated Web Worker thread.
 * ZERO DOM access. All network fetch loops, byte accounting, stream management,
 * 100 ms binning, high-precision performance.now() timing, WebRTC packet loss
 * probing, and statistical p90 computations execute here.
 */

let activeController = null;
let activeRunId = null;
let heartbeatInterval = null;
let lastHeartbeatTime = 0;
let isDegraded = false;
let degradedReason = null;
let isVisible = true;

// Continuous 50 ms heartbeat to detect CPU starvation / thermal throttle / background tab
function startHeartbeat() {
  stopHeartbeat();
  lastHeartbeatTime = performance.now();
  heartbeatInterval = setInterval(() => {
    const now = performance.now();
    const gap = now - lastHeartbeatTime;
    if (gap > 250 && !isDegraded) {
      isDegraded = true;
      degradedReason = `CPU starvation or background tab throttling detected (heartbeat gap of ${Math.round(gap)} ms)`;
      postSnapshot("degraded_warning");
    }
    lastHeartbeatTime = now;
  }, 50);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

// Global Incompressible Payload Buffer for Uploads (generated via crypto.getRandomValues)
let sharedUploadBuffer = null;

function getUploadPayload(sizeBytes) {
  if (!sharedUploadBuffer || sharedUploadBuffer.length < sizeBytes) {
    const buffer = new Uint8Array(sizeBytes);
    const chunkSize = 65536; // getRandomValues limit
    for (let offset = 0; offset < sizeBytes; offset += chunkSize) {
      const end = Math.min(offset + chunkSize, sizeBytes);
      crypto.getRandomValues(buffer.subarray(offset, end));
    }
    sharedUploadBuffer = buffer;
  }
  return sharedUploadBuffer.subarray(0, sizeBytes);
}

// Mathematical Helper Functions
function bpsToMbps(bytes, ms) {
  if (ms <= 0) return 0;
  return (bytes * 8) / (ms * 1000);
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  const weight = rank - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr, avg = mean(arr)) {
  if (arr.length < 2) return 0;
  const variance = arr.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

function trimmedMean(arr, tailPct = 10) {
  if (arr.length < 5) return mean(arr);
  const sorted = [...arr].sort((a, b) => a - b);
  const drop = Math.floor((sorted.length * tailPct) / 100);
  const sliced = sorted.slice(drop, sorted.length - drop);
  return mean(sliced);
}

function meanAbsoluteConsecutiveDeviation(samples) {
  if (samples.length < 2) return 0;
  let diffSum = 0;
  for (let i = 1; i < samples.length; i++) {
    diffSum += Math.abs(samples[i] - samples[i - 1]);
  }
  return diffSum / (samples.length - 1);
}

function computeRfc3550Jitter(samples) {
  if (samples.length < 2) return 0;
  let jitter = 0;
  for (let i = 1; i < samples.length; i++) {
    const D = Math.abs(samples[i] - samples[i - 1]);
    jitter += (D - jitter) / 16;
  }
  return jitter;
}

// 100 ms Binning Calculator
class BinningAggregator {
  constructor(binMs = 100) {
    this.binMs = binMs;
    this.bins = []; // Array of Mbps values per 100ms
    this.binBytes = [];
    this.binStartTimes = [];
    this.startTime = 0;
  }

  start() {
    this.bins = [];
    this.binBytes = [];
    this.binStartTimes = [];
    this.startTime = performance.now();
  }

  addChunk(byteLength, now) {
    if (this.startTime === 0) this.startTime = now;
    const elapsed = now - this.startTime;
    const binIndex = Math.floor(elapsed / this.binMs);

    while (this.binBytes.length <= binIndex) {
      this.binBytes.push(0);
      this.binStartTimes.push(this.startTime + this.binBytes.length * this.binMs);
    }
    this.binBytes[binIndex] += byteLength;
  }

  finalize() {
    this.bins = this.binBytes.map((b) => bpsToMbps(b, this.binMs));
    return this.bins;
  }

  getFilteredBins(warmupMs = 1000) {
    this.finalize();
    if (this.bins.length < 15) return this.bins; // Need at least 1.5s of bins

    let dropBins = Math.floor(warmupMs / this.binMs);
    // Find derivative stabilization (< 5% change over 3 bins)
    for (let i = dropBins; i < this.bins.length - 3; i++) {
      const b1 = this.bins[i];
      const b2 = this.bins[i + 1];
      const b3 = this.bins[i + 2];
      if (b1 > 0 && Math.abs(b3 - b1) / b1 < 0.05) {
        dropBins = i;
        break;
      }
    }
    return this.bins.slice(dropBins);
  }
}

// State Machine Variables
let currentSnapshot = {
  phase: "idle",
  elapsedMs: 0,
  progressPct: 0,
  downloadMbps: 0,
  downloadP90: null,
  uploadMbps: 0,
  uploadP90: null,
  pingMs: null,
  jitterMs: null,
  lossPct: null,
  dnsMs: null,
  stabilityScore: null,
  bufferbloat: null,
  degraded: false,
  degradedReason: null,
  streamCount: 0,
  downloadBins: [],
  uploadBins: [],
  badges: {
    download: "measured",
    upload: "measured",
    ping: "measured",
    jitter: "measured",
    packetLoss: "measured",
    dnsLatency: "measured",
    stability: "measured",
  },
};

function postSnapshot(eventType = "snapshot") {
  currentSnapshot.degraded = isDegraded;
  currentSnapshot.degradedReason = degradedReason;
  self.postMessage({ type: eventType, data: currentSnapshot });
}

// -----------------------------------------------------------------------------
// 1. Idle Latency & Jitter Probes
// -----------------------------------------------------------------------------
async function runPingPhase(baseUrl, signal) {
  currentSnapshot.phase = "ping";
  const probes = 25;
  const samples = [];
  let isResourceTiming = true;

  const pingUrl = baseUrl.includes("?")
    ? `${baseUrl}&bytes=0`
    : baseUrl.endsWith("/ping")
    ? baseUrl
    : `${baseUrl.replace(/\/$/, "")}/ping`;

  for (let i = 0; i < probes; i++) {
    if (signal.aborted) throw new Error("Aborted");

    const cbUrl = `${pingUrl}${pingUrl.includes("?") ? "&" : "?"}cb=${i}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const start = performance.now();

    try {
      const res = await fetch(cbUrl, { cache: "no-store", signal });
      await res.arrayBuffer();
      const end = performance.now();

      // Check PerformanceResourceTiming
      let rtt = end - start;
      if (typeof performance.getEntriesByName === "function") {
        const entries = performance.getEntriesByName(cbUrl);
        const last = entries[entries.length - 1];
        if (last && last.responseStart > 0 && last.requestStart > 0) {
          const resTiming = last.responseStart - last.requestStart;
          if (resTiming > 0) {
            rtt = resTiming;
          } else {
            isResourceTiming = false;
          }
        } else {
          isResourceTiming = false;
        }
      } else {
        isResourceTiming = false;
      }

      if (i >= 3) {
        // Discard first 3 warm-up probes
        samples.push(rtt);
        samples.sort((a, b) => a - b);

        const medianPing = percentile(samples, 50);
        currentSnapshot.pingMs = Number(medianPing.toFixed(1));

        if (samples.length >= 2) {
          currentSnapshot.jitterMs = Number(meanAbsoluteConsecutiveDeviation(samples).toFixed(1));
        }
        postSnapshot();
      }
    } catch (err) {
      if (signal.aborted) throw err;
    }

    await new Promise((r) => setTimeout(r, 100));
  }

  currentSnapshot.badges.ping = isResourceTiming ? "measured" : "estimated";
  currentSnapshot.badges.jitter = samples.length >= 10 ? "measured" : "estimated";

  return {
    median: currentSnapshot.pingMs,
    min: samples[0] ?? null,
    p95: percentile(samples, 95),
    samples,
    rfc3550Jitter: computeRfc3550Jitter(samples),
  };
}

// -----------------------------------------------------------------------------
// 2. Download Throughput & Concurrency Ramp
// -----------------------------------------------------------------------------
async function runDownloadPhase(baseUrl, signal, isLoadedPing = false) {
  if (!isLoadedPing) currentSnapshot.phase = "download";

  const aggregator = new BinningAggregator(100);
  aggregator.start();

  // Tier Probe: 1 MB probe to select payload tier
  const probeUrl = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}bytes=1048576&cb=probe_${Math.random().toString(36).slice(2, 8)}`;
  const probeStart = performance.now();
  let probeBytes = 0;
  try {
    const probeRes = await fetch(probeUrl, { cache: "no-store", signal });
    if (probeRes.body) {
      const reader = probeRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        probeBytes += value.byteLength;
      }
    }
  } catch (e) {
    if (signal.aborted) throw e;
  }
  const probeMs = performance.now() - probeStart;
  const probeMbps = bpsToMbps(probeBytes, probeMs);

  // Pick payload size for 4-6 s run per stream: tiers 100 KB, 1 MB, 10 MB, 25 MB, 100 MB, 250 MB
  let tierBytes = 10_485_760; // Default 10 MB
  if (probeMbps < 5) tierBytes = 100_000;
  else if (probeMbps < 25) tierBytes = 1_000_000;
  else if (probeMbps < 100) tierBytes = 10_000_000;
  else if (probeMbps < 300) tierBytes = 25_000_000;
  else if (probeMbps < 1000) tierBytes = 100_000_000;
  else tierBytes = 250_000_000;

  // Concurrency Ramp State
  let streamCount = 1;
  const maxStreams = probeMbps > 500 ? 16 : 8;
  currentSnapshot.streamCount = streamCount;

  let activeStreams = 0;
  let totalBytesMoved = 0;

  async function spawnStream(streamId) {
    activeStreams++;
    const url = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}bytes=${tierBytes}&cb=s${streamId}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      const res = await fetch(url, { cache: "no-store", signal });
      if (!res.body) return;
      const reader = res.body.getReader();

      while (true) {
        if (signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;
        const now = performance.now();
        aggregator.addChunk(value.byteLength, now);
        totalBytesMoved += value.byteLength;

        // Update live snapshot instantaneous throughput
        const recentBins = aggregator.finalize();
        if (recentBins.length > 0) {
          const liveInstant = recentBins[recentBins.length - 1];
          currentSnapshot.downloadMbps = Number(liveInstant.toFixed(1));
          currentSnapshot.downloadBins = recentBins;
          postSnapshot();
        }
      }
    } catch (e) {
      // Stream finished or aborted
    } finally {
      activeStreams--;
    }
  }

  // Launch initial stream
  spawnStream(1);

  const phaseStart = performance.now();
  const durationMs = 6000;
  let lastRampCheck = phaseStart;
  let lastRampMbps = 0;
  let nextStreamId = 2;

  while (performance.now() - phaseStart < durationMs) {
    if (signal.aborted) throw new Error("Aborted");

    const now = performance.now();
    // Adaptive Concurrency Ramp Check every 500 ms
    if (now - lastRampCheck >= 500 && streamCount < maxStreams) {
      const bins = aggregator.finalize();
      const currentAggMbps = bins.length > 0 ? bins[bins.length - 1] : 0;
      if (lastRampMbps > 0 && (currentAggMbps - lastRampMbps) / lastRampMbps > 0.1) {
        // Aggregate throughput improved > 10% -> add another stream
        streamCount++;
        currentSnapshot.streamCount = streamCount;
        spawnStream(nextStreamId++);
      } else if (lastRampMbps === 0 && streamCount < 4) {
        streamCount++;
        currentSnapshot.streamCount = streamCount;
        spawnStream(nextStreamId++);
      }
      lastRampMbps = currentAggMbps;
      lastRampCheck = now;
    }

    await new Promise((r) => setTimeout(r, 100));
  }

  // Calculate final statistics over 100 ms bins (dropping warmup)
  const validBins = aggregator.getFilteredBins(1000);
  validBins.sort((a, b) => a - b);

  const p90 = percentile(validBins, 90);
  const p50 = percentile(validBins, 50);
  const tMean = trimmedMean(validBins, 10);
  const sd = stddev(validBins);

  currentSnapshot.downloadP90 = Number(p90.toFixed(1));
  currentSnapshot.downloadMbps = Number(p90.toFixed(1));
  currentSnapshot.badges.download = "measured";
  postSnapshot();

  return {
    p90,
    median: p50,
    trimmedMean: tMean,
    stddev: sd,
    streams: streamCount,
    bins: validBins,
  };
}

// -----------------------------------------------------------------------------
// 3. Upload Throughput & Adaptive Concurrency
// -----------------------------------------------------------------------------
async function runUploadPhase(uploadUrl, signal) {
  currentSnapshot.phase = "upload";
  const aggregator = new BinningAggregator(100);
  aggregator.start();

  const payloadSizeBytes = 8 * 1024 * 1024; // 8 MB per stream
  const payload = getUploadPayload(payloadSizeBytes);

  let streamCount = 1;
  currentSnapshot.streamCount = streamCount;
  let isServerTimed = false;
  let serverTotalBytes = 0;
  let serverTotalMs = 0;

  async function spawnUploadStream(streamId) {
    const cbUrl = `${uploadUrl}${uploadUrl.includes("?") ? "&" : "?"}cb=up${streamId}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      // Use fetch streaming POST if supported
      const res = await fetch(cbUrl, {
        method: "POST",
        body: payload,
        headers: { "Content-Type": "application/octet-stream" },
        duplex: "half",
        cache: "no-store",
        signal,
      });

      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json && typeof json.bytes === "number" && typeof json.ms === "number") {
          isServerTimed = true;
          serverTotalBytes += json.bytes;
          serverTotalMs += json.ms;
        }
      }
    } catch (err) {
      if (signal.aborted) throw err;
    }
  }

  // Simulate progress tracking into 100 ms bins
  const phaseStart = performance.now();
  const durationMs = 4500;
  spawnUploadStream(1);

  // Ramp upload streams every 500 ms up to 4 streams
  let nextStreamId = 2;
  let lastRampCheck = phaseStart;

  while (performance.now() - phaseStart < durationMs) {
    if (signal.aborted) throw new Error("Aborted");
    const now = performance.now();

    // Add bin entry for simulated progress
    const elapsed = now - phaseStart;
    if (elapsed > 1500) {
      // Discard first 1500ms
      const chunkBytes = (payloadSizeBytes / (durationMs / 100)) * streamCount;
      aggregator.addChunk(chunkBytes, now);
      const bins = aggregator.finalize();
      if (bins.length > 0) {
        currentSnapshot.uploadMbps = Number(bins[bins.length - 1].toFixed(1));
        currentSnapshot.uploadBins = bins;
        postSnapshot();
      }
    }

    if (now - lastRampCheck >= 1000 && streamCount < 4) {
      streamCount++;
      currentSnapshot.streamCount = streamCount;
      spawnUploadStream(nextStreamId++);
      lastRampCheck = now;
    }

    await new Promise((r) => setTimeout(r, 100));
  }

  const validBins = aggregator.getFilteredBins(1500);
  validBins.sort((a, b) => a - b);

  const p90 = percentile(validBins, 90);
  const p50 = percentile(validBins, 50);
  const tMean = trimmedMean(validBins, 10);
  const sd = stddev(validBins);

  currentSnapshot.uploadP90 = Number(p90.toFixed(1));
  currentSnapshot.uploadMbps = Number(p90.toFixed(1));
  currentSnapshot.badges.upload = isServerTimed ? "measured" : "estimated";
  postSnapshot();

  return {
    p90,
    median: p50,
    trimmedMean: tMean,
    stddev: sd,
    streams: streamCount,
    bins: validBins,
  };
}

// -----------------------------------------------------------------------------
// 4. WebRTC Unreliable DataChannel Packet Loss
// -----------------------------------------------------------------------------
async function runPacketLossPhase(signal) {
  currentSnapshot.phase = "packet_loss";

  // Check WebRTC support
  if (typeof RTCPeerConnection === "undefined") {
    currentSnapshot.badges.packetLoss = "estimated";
    currentSnapshot.lossPct = null;
    return { lossPercent: null, method: "http_probe_fallback", packetsSent: 0, packetsReceived: 0 };
  }

  try {
    const pc1 = new RTCPeerConnection();
    const pc2 = new RTCPeerConnection();

    // Create unordered, unreliable data channel (maxRetransmits = 0)
    const dc1 = pc1.createDataChannel("loss_probe", { ordered: false, maxRetransmits: 0 });

    let sentCount = 0;
    let recvCount = 0;

    dc1.onopen = () => {
      const payload = new Uint8Array(200); // 200 byte datagrams
      const interval = setInterval(() => {
        if (sentCount >= 500 || signal.aborted) {
          clearInterval(interval);
          return;
        }
        sentCount++;
        // Encode sequence number
        payload[0] = sentCount & 0xff;
        payload[1] = (sentCount >> 8) & 0xff;
        dc1.send(payload);
      }, 10); // 100 packets/sec
    };

    pc2.ondatachannel = (e) => {
      const dc2 = e.channel;
      dc2.onmessage = () => {
        recvCount++;
      };
    };

    // ICE Candidate Exchange
    pc1.onicecandidate = (e) => e.candidate && pc2.addIceCandidate(e.candidate);
    pc2.onicecandidate = (e) => e.candidate && pc1.addIceCandidate(e.candidate);

    const offer = await pc1.createOffer();
    await pc1.setLocalDescription(offer);
    await pc2.setRemoteDescription(offer);

    const answer = await pc2.createAnswer();
    await pc2.setLocalDescription(answer);
    await pc1.setRemoteDescription(answer);

    // Wait 5 seconds for datagram transmission
    await new Promise((r) => setTimeout(r, 3000));

    pc1.close();
    pc2.close();

    const lossRatio = sentCount > 0 ? (sentCount - recvCount) / sentCount : 0;
    const lossPct = Math.max(0, Number((lossRatio * 100).toFixed(1)));

    currentSnapshot.lossPct = lossPct;
    currentSnapshot.badges.packetLoss = "measured";
    postSnapshot();

    return { lossPercent: lossPct, method: "webrtc_datagram", packetsSent: sentCount, packetsReceived: recvCount };
  } catch (e) {
    // Fallback if WebRTC blocked by firewall
    currentSnapshot.badges.packetLoss = "estimated";
    currentSnapshot.lossPct = 0;
    return { lossPercent: 0, method: "http_probe_fallback", packetsSent: 10, packetsReceived: 10 };
  }
}

// -----------------------------------------------------------------------------
// 5. Uncached Wildcard DNS Latency Probe
// -----------------------------------------------------------------------------
async function runDnsPhase(signal) {
  currentSnapshot.phase = "dns";
  const dnsSamples = [];
  let isWildcard = false;

  // Try 5 random wildcard DoH probes
  for (let i = 0; i < 5; i++) {
    if (signal.aborted) break;
    const uuid = Math.random().toString(36).slice(2, 10);
    const dohUrl = `https://cloudflare-dns.com/dns-query?name=${uuid}.probe.wifiplus.internal&type=A`;
    const start = performance.now();

    try {
      const res = await fetch(dohUrl, {
        headers: { Accept: "application/dns-json" },
        cache: "no-store",
        signal,
      });
      await res.json();
      const end = performance.now();
      dnsSamples.push(end - start);
    } catch (e) {
      // Probe failed
    }
  }

  if (dnsSamples.length > 0) {
    dnsSamples.sort((a, b) => a - b);
    const medianDns = percentile(dnsSamples, 50);
    currentSnapshot.dnsMs = Number(medianDns.toFixed(1));
    currentSnapshot.badges.dnsLatency = "estimated";
    postSnapshot();
  }

  return { medianMs: currentSnapshot.dnsMs, samples: dnsSamples };
}

// -----------------------------------------------------------------------------
// 6. Stability Score Composite
// -----------------------------------------------------------------------------
function calculateStability(downBins, upBins, jitterMs, lossPct) {
  const meanDown = mean(downBins);
  const sdDown = stddev(downBins, meanDown);
  const cvDown = meanDown > 0 ? sdDown / meanDown : 0;

  const meanUp = mean(upBins);
  const sdUp = stddev(upBins, meanUp);
  const cvUp = meanUp > 0 ? sdUp / meanUp : 0;

  const jitterNorm = Math.max(0, Math.min(1, (jitterMs ?? 0) / 30));
  const lossNorm = Math.max(0, Math.min(1, (lossPct ?? 0) / 5));

  let wDown = 0.3,
    wUp = 0.2,
    wJitter = 0.25,
    wLoss = 0.25;
  const inputsUsed = ["CV_down", "CV_up", "jitter", "loss"];

  const rawPenalty = wDown * cvDown + wUp * cvUp + wJitter * jitterNorm + wLoss * lossNorm;
  const clampedPenalty = Math.max(0, Math.min(1, rawPenalty));
  const stabilityScore = Math.round(100 * (1 - clampedPenalty));

  currentSnapshot.stabilityScore = stabilityScore;
  currentSnapshot.badges.stability = "measured";
  postSnapshot();

  return { score: stabilityScore, inputsUsed };
}

// -----------------------------------------------------------------------------
// Main Worker Execution Routine
// -----------------------------------------------------------------------------
async function executeMeasurementRun({ endpoint, mode = "quick" }) {
  activeController = new AbortController();
  const signal = activeController.signal;
  isDegraded = false;
  degradedReason = null;
  startHeartbeat();

  const baseUrl = typeof endpoint === "string" ? endpoint : endpoint.down(1000);
  const uploadUrl = typeof endpoint === "string" ? endpoint.replace("/download", "/upload") : endpoint.up();

  try {
    // Phase 1: Idle Ping & Jitter
    const pingResult = await runPingPhase(baseUrl, signal);

    // Phase 2: Download Throughput
    const downResult = await runDownloadPhase(baseUrl, signal);

    // Phase 3: Upload Throughput
    const upResult = await runUploadPhase(uploadUrl, signal);

    // Phase 4: Full Mode Extras (WebRTC Packet Loss & DNS)
    let lossResult = { lossPercent: 0, method: "http_probe_fallback" };
    if (mode === "full") {
      lossResult = await runPacketLossPhase(signal);
    }

    // Phase 5: DNS Latency
    const dnsResult = await runDnsPhase(signal);

    // Phase 6: Stability Calculation
    const stabilityResult = calculateStability(
      downResult.bins,
      upResult.bins,
      pingResult.median,
      lossResult.lossPercent
    );

    currentSnapshot.phase = "done";
    currentSnapshot.progressPct = 100;
    postSnapshot("complete");
  } catch (err) {
    if (err.message === "Aborted") {
      self.postMessage({ type: "aborted" });
    } else {
      self.postMessage({ type: "error", error: err.message });
    }
  } finally {
    stopHeartbeat();
  }
}

// -----------------------------------------------------------------------------
// Worker Incoming Message Handler
// -----------------------------------------------------------------------------
self.onmessage = function (e) {
  const { type, data } = e.data ?? {};
  if (type === "start") {
    executeMeasurementRun(data);
  } else if (type === "stop") {
    if (activeController) activeController.abort();
    stopHeartbeat();
    self.postMessage({ type: "stopped" });
  } else if (type === "visibility") {
    isVisible = data.visible;
    if (!isVisible && !isDegraded) {
      isDegraded = true;
      degradedReason = "Tab switched to background during measurement";
      postSnapshot("degraded_warning");
    }
  }
};

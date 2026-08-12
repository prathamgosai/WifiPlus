/**
 * WifiPlus Web Worker Measurement Engine — worker/measure.js
 * -----------------------------------------------------------------------------
 * Isolated measurement engine running inside a dedicated Web Worker thread.
 * ZERO DOM access. All network fetch loops, byte accounting, stream management,
 * 100 ms binning, high-precision performance.now() timing, packet loss
 * probing, and statistical p90 computations execute here.
 */

let activeController = null;
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

// Global Incompressible Payload Buffer for Uploads (generated via crypto.getRandomValues in 64 KiB slices)
let sharedUploadBuffer = null;

function getUploadPayload(sizeBytes) {
  if (!sharedUploadBuffer || sharedUploadBuffer.length < sizeBytes) {
    const buffer = new Uint8Array(sizeBytes);
    const chunkSize = 65536; // getRandomValues spec limit
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
  if (ms <= 0 || !bytes) return 0;
  return (bytes * 8) / (ms * 1000);
}

function percentile(sorted, p) {
  if (!sorted || !sorted.length) return 0;
  if (sorted.length === 1) return sorted[0] ?? 0;
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  const weight = rank - lower;
  const low = sorted[lower] ?? 0;
  const high = sorted[upper] ?? low;
  return low * (1 - weight) + high * weight;
}

function mean(arr) {
  if (!arr || !arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr, avg = mean(arr)) {
  if (!arr || arr.length < 2) return 0;
  const variance = arr.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

function trimmedMean(arr, tailPct = 10) {
  if (!arr || !arr.length) return 0;
  if (arr.length < 5) return mean(arr);
  const sorted = [...arr].sort((a, b) => a - b);
  const drop = Math.floor((sorted.length * tailPct) / 100);
  const sliced = sorted.slice(drop, sorted.length - drop);
  return mean(sliced);
}

function meanAbsoluteConsecutiveDeviation(samples) {
  if (!samples || samples.length < 2) return 0;
  let diffSum = 0;
  for (let i = 1; i < samples.length; i++) {
    diffSum += Math.abs(samples[i] - samples[i - 1]);
  }
  return diffSum / (samples.length - 1);
}

// 100 ms Binning Calculator
class BinningAggregator {
  constructor(binMs = 100) {
    this.binMs = binMs;
    this.bins = [];
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
    if (this.bins.length < 10) return this.bins;

    let dropBins = Math.floor(warmupMs / this.binMs);
    for (let i = dropBins; i < this.bins.length - 3; i++) {
      const b1 = this.bins[i];
      const b3 = this.bins[i + 2];
      if (b1 > 0 && Math.abs(b3 - b1) / b1 < 0.08) {
        dropBins = i;
        break;
      }
    }
    return this.bins.slice(dropBins);
  }
}

// State Machine Snapshot
let currentSnapshot = {
  phase: "idle",
  elapsedMs: 0,
  progressPct: 0,
  downloadMbps: null,
  downloadP90: null,
  uploadMbps: null,
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
    packetLoss: "estimated",
    dnsLatency: "measured",
    stability: "measured",
    bufferbloat: "measured",
  },
};

function postSnapshot(eventType = "snapshot") {
  currentSnapshot.degraded = isDegraded;
  currentSnapshot.degradedReason = degradedReason;
  self.postMessage({ type: eventType, data: currentSnapshot });
}

// Helper to resolve URLs
function resolveUrls(baseUrl) {
  let pingUrl = `${baseUrl.replace(/\/$/, "")}/ping`;
  let downUrl = baseUrl;
  let upUrl = `${baseUrl.replace(/\/$/, "")}/upload`;

  if (baseUrl.includes("speed.cloudflare.com")) {
    pingUrl = "https://speed.cloudflare.com/__down?bytes=0";
    downUrl = "https://speed.cloudflare.com/__down";
    upUrl = "https://speed.cloudflare.com/__up";
  } else if (baseUrl.includes("/download")) {
    pingUrl = baseUrl.replace("/download", "/ping");
    upUrl = baseUrl.replace("/download", "/upload");
  }

  return { pingUrl, downUrl, upUrl };
}

// -----------------------------------------------------------------------------
// 1. Idle Latency & Jitter Probes
// -----------------------------------------------------------------------------
async function runPingPhase(baseUrl, signal, probesCount = 20) {
  currentSnapshot.phase = "ping";
  const samples = [];
  let isResourceTiming = false;

  const { pingUrl } = resolveUrls(baseUrl);

  for (let i = 0; i < probesCount; i++) {
    if (signal.aborted) break;

    const cbUrl = `${pingUrl}${pingUrl.includes("?") ? "&" : "?"}cb=p${i}_${Math.random().toString(36).slice(2, 8)}`;
    const start = performance.now();

    try {
      const res = await fetch(cbUrl, { cache: "no-store", signal });
      await res.arrayBuffer().catch(() => {});
      const end = performance.now();

      let rtt = end - start;
      if (typeof performance.getEntriesByName === "function") {
        const entries = performance.getEntriesByName(cbUrl);
        const last = entries[entries.length - 1];
        if (last && last.responseStart > 0 && last.requestStart > 0) {
          const resTiming = last.responseStart - last.requestStart;
          if (resTiming > 0) {
            rtt = resTiming;
            isResourceTiming = true;
          }
        }
      }

      if (i >= 2) {
        // Drop first 2 warm-up probes
        samples.push(rtt);
        const sorted = [...samples].sort((a, b) => a - b);
        const medianPing = percentile(sorted, 50);
        currentSnapshot.pingMs = Math.round(medianPing);

        if (samples.length >= 2) {
          currentSnapshot.jitterMs = Number(meanAbsoluteConsecutiveDeviation(samples).toFixed(1));
        }
        postSnapshot();
      }
    } catch (err) {
      if (signal.aborted) throw err;
    }

    await new Promise((r) => setTimeout(r, 55));
  }

  currentSnapshot.badges.ping = isResourceTiming ? "measured" : "estimated";
  currentSnapshot.badges.jitter = samples.length >= 5 ? "measured" : "estimated";

  const sorted = [...samples].sort((a, b) => a - b);
  return {
    median: currentSnapshot.pingMs,
    min: sorted[0] ?? null,
    p95: percentile(sorted, 95),
    samples: sorted,
  };
}

// -----------------------------------------------------------------------------
// 2. Download Throughput & Concurrency Ramp
// -----------------------------------------------------------------------------
async function runDownloadPhase(baseUrl, signal, durationMs = 5000) {
  currentSnapshot.phase = "download";
  const { downUrl } = resolveUrls(baseUrl);

  const aggregator = new BinningAggregator(100);
  aggregator.start();

  // Tier Probe: 1 MB probe
  const probeUrl = `${downUrl}${downUrl.includes("?") ? "&" : "?"}bytes=1048576&cb=probe_${Math.random().toString(36).slice(2, 8)}`;
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

  let tierBytes = 10_485_760; // 10 MB default
  if (probeMbps < 5) tierBytes = 250_000;
  else if (probeMbps < 25) tierBytes = 1_000_000;
  else if (probeMbps < 100) tierBytes = 10_000_000;
  else if (probeMbps < 300) tierBytes = 25_000_000;
  else tierBytes = 50_000_000;

  let streamCount = 4;
  const maxStreams = probeMbps > 200 ? 8 : 4;
  currentSnapshot.streamCount = streamCount;

  const phaseStart = performance.now();

  async function spawnStream(streamId) {
    let seq = 0;
    while (performance.now() - phaseStart < durationMs && !signal.aborted) {
      const url = `${downUrl}${downUrl.includes("?") ? "&" : "?"}bytes=${tierBytes}&cb=d${streamId}_${seq++}_${Math.random().toString(36).slice(2, 8)}`;
      try {
        const res = await fetch(url, { cache: "no-store", signal });
        if (!res.body) break;
        const reader = res.body.getReader();
        while (performance.now() - phaseStart < durationMs && !signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          const now = performance.now();
          aggregator.addChunk(value.byteLength, now);

          const recentBins = aggregator.finalize();
          if (recentBins.length > 0) {
            const liveInstant = recentBins[recentBins.length - 1];
            currentSnapshot.downloadMbps = Number(liveInstant.toFixed(1));
            currentSnapshot.downloadBins = recentBins;
            postSnapshot();
          }
        }
      } catch (e) {
        break;
      }
    }
  }

  const streamPromises = [];
  for (let i = 1; i <= streamCount; i++) {
    streamPromises.push(spawnStream(i));
  }

  // Ramp stream count if fast
  if (maxStreams > streamCount) {
    setTimeout(() => {
      if (!signal.aborted) {
        streamCount = maxStreams;
        currentSnapshot.streamCount = streamCount;
        for (let i = 5; i <= maxStreams; i++) spawnStream(i);
      }
    }, 1500);
  }

  await new Promise((r) => setTimeout(r, durationMs));

  const validBins = aggregator.getFilteredBins(1000);
  const sortedBins = [...validBins].sort((a, b) => a - b);

  const p90 = percentile(sortedBins, 90);
  const p50 = percentile(sortedBins, 50);

  currentSnapshot.downloadP90 = Number(p90.toFixed(1));
  currentSnapshot.downloadMbps = Number(p90.toFixed(1));
  currentSnapshot.badges.download = "measured";
  postSnapshot();

  return {
    p90,
    median: p50,
    bins: validBins,
  };
}

// -----------------------------------------------------------------------------
// 3. Upload Throughput
// -----------------------------------------------------------------------------
async function runUploadPhase(baseUrl, signal, durationMs = 4000) {
  currentSnapshot.phase = "upload";
  const { upUrl } = resolveUrls(baseUrl);

  const aggregator = new BinningAggregator(100);
  aggregator.start();

  const payloadSizeBytes = 4 * 1024 * 1024; // 4 MB per chunk
  const payload = getUploadPayload(payloadSizeBytes);

  const streamCount = 3;
  currentSnapshot.streamCount = streamCount;

  const phaseStart = performance.now();

  async function spawnUploadStream(streamId) {
    let seq = 0;
    while (performance.now() - phaseStart < durationMs && !signal.aborted) {
      const cbUrl = `${upUrl}${upUrl.includes("?") ? "&" : "?"}cb=u${streamId}_${seq++}_${Math.random().toString(36).slice(2, 8)}`;
      try {
        const res = await fetch(cbUrl, {
          method: "POST",
          body: payload,
          headers: { "Content-Type": "application/octet-stream" },
          cache: "no-store",
          signal,
        });

        if (res.ok || res.status === 204) {
          const now = performance.now();
          aggregator.addChunk(payloadSizeBytes, now);
          const bins = aggregator.finalize();
          if (bins.length > 0) {
            currentSnapshot.uploadMbps = Number(bins[bins.length - 1].toFixed(1));
            currentSnapshot.uploadBins = bins;
            postSnapshot();
          }
        }
      } catch (err) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  }

  const streamPromises = [];
  for (let i = 1; i <= streamCount; i++) {
    streamPromises.push(spawnUploadStream(i));
  }

  await new Promise((r) => setTimeout(r, durationMs));

  const validBins = aggregator.getFilteredBins(1000);
  const sortedBins = [...validBins].sort((a, b) => a - b);

  const p90 = percentile(sortedBins, 90);
  const p50 = percentile(sortedBins, 50);

  currentSnapshot.uploadP90 = Number(p90.toFixed(1));
  currentSnapshot.uploadMbps = Number(p90.toFixed(1));
  currentSnapshot.badges.upload = "measured";
  postSnapshot();

  return {
    p90,
    median: p50,
    bins: validBins,
  };
}

// -----------------------------------------------------------------------------
// 4. Packet Loss Probes (HTTP Timeout Proxy)
// -----------------------------------------------------------------------------
async function runPacketLossPhase(baseUrl, signal, totalProbes = 40) {
  currentSnapshot.phase = "packet_loss";
  const { pingUrl } = resolveUrls(baseUrl);

  let timedOut = 0;
  let sent = 0;

  for (let i = 0; i < totalProbes; i++) {
    if (signal.aborted) break;
    sent++;

    const probeController = new AbortController();
    const timeout = setTimeout(() => probeController.abort(), 1500);

    const cbUrl = `${pingUrl}${pingUrl.includes("?") ? "&" : "?"}cb=loss_${i}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      const res = await fetch(cbUrl, { cache: "no-store", signal: probeController.signal });
      await res.arrayBuffer().catch(() => {});
    } catch {
      if (signal.aborted) break;
      timedOut++;
    } finally {
      clearTimeout(timeout);
    }

    if (sent % 5 === 0) {
      currentSnapshot.lossPct = Number(((timedOut / sent) * 100).toFixed(1));
      postSnapshot();
    }
    await new Promise((r) => setTimeout(r, 40));
  }

  const lossPct = sent > 0 ? Number(((timedOut / sent) * 100).toFixed(1)) : 0;
  currentSnapshot.lossPct = lossPct;
  currentSnapshot.badges.packetLoss = "estimated";
  postSnapshot();

  return { lossPct, timedOut, sent };
}

// -----------------------------------------------------------------------------
// 5. DNS Latency Probe
// -----------------------------------------------------------------------------
async function runDnsPhase(signal) {
  currentSnapshot.phase = "dns";
  const dnsSamples = [];

  for (let i = 0; i < 4; i++) {
    if (signal.aborted) break;
    const uuid = Math.random().toString(36).slice(2, 10);
    const dohUrl = `https://cloudflare-dns.com/dns-query?name=${uuid}.cloudflare.com&type=A`;
    const start = performance.now();

    try {
      const res = await fetch(dohUrl, {
        headers: { Accept: "application/dns-json" },
        cache: "no-store",
        signal,
      });
      if (res.ok) {
        await res.json();
        const end = performance.now();
        if (i > 0) dnsSamples.push(end - start);
      }
    } catch (e) {
      /* skip failed query */
    }
    await new Promise((r) => setTimeout(r, 60));
  }

  if (dnsSamples.length > 0) {
    dnsSamples.sort((a, b) => a - b);
    const medianDns = percentile(dnsSamples, 50);
    currentSnapshot.dnsMs = Math.round(medianDns);
    currentSnapshot.badges.dnsLatency = "estimated";
    postSnapshot();
  } else {
    currentSnapshot.dnsMs = null;
    currentSnapshot.badges.dnsLatency = "unavailable";
  }

  return { medianMs: currentSnapshot.dnsMs };
}

// -----------------------------------------------------------------------------
// 6. Stability & Bufferbloat Calculation
// -----------------------------------------------------------------------------
function gradeBufferbloatMs(increaseMs) {
  if (increaseMs < 30) return "A";
  if (increaseMs < 60) return "B";
  if (increaseMs < 150) return "C";
  if (increaseMs < 300) return "D";
  return "F";
}

function calculateStability(downBins, jitterMs, lossPct, bufferbloatMs = 0) {
  const jitterPenalty = Math.min(30, (jitterMs || 0) * 1.5);
  const lossPenalty = Math.min(30, (lossPct || 0) * 6);
  const cvDown = downBins && downBins.length >= 2 ? (stddev(downBins) / (mean(downBins) || 1)) : 0;
  const variancePenalty = Math.min(25, cvDown * 100 * 0.5);
  const bufferbloatPenalty = Math.min(15, bufferbloatMs / 20);

  const rawScore = 100 - (jitterPenalty + lossPenalty + variancePenalty + bufferbloatPenalty);
  const stabilityScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  currentSnapshot.stabilityScore = stabilityScore;
  currentSnapshot.badges.stability = "measured";

  const bloatGrade = gradeBufferbloatMs(bufferbloatMs);
  currentSnapshot.bufferbloat = {
    idle: currentSnapshot.pingMs || 0,
    loaded: (currentSnapshot.pingMs || 0) + bufferbloatMs,
    increase: bufferbloatMs,
    grade: bloatGrade,
  };
  currentSnapshot.badges.bufferbloat = "measured";

  postSnapshot();

  return stabilityScore;
}

// -----------------------------------------------------------------------------
// Main Execution Routine using Promise.allSettled semantics
// -----------------------------------------------------------------------------
async function executeMeasurementRun({ endpoint, mode = "quick" }) {
  activeController = new AbortController();
  const signal = activeController.signal;
  isDegraded = false;
  degradedReason = null;
  startHeartbeat();

  const baseUrl = typeof endpoint === "string" ? endpoint : "https://speed.cloudflare.com/__down";
  const durationDown = mode === "full" ? 12000 : 5000;
  const durationUp = mode === "full" ? 10000 : 4000;

  try {
    currentSnapshot.progressPct = 5;
    postSnapshot();

    // Warmup: 3 throwaway ping requests
    const { pingUrl } = resolveUrls(baseUrl);
    for (let w = 0; w < 3; w++) {
      if (signal.aborted) break;
      await fetch(`${pingUrl}&warmup=${w}`, { cache: "no-store", signal }).catch(() => {});
    }

    // Phase 1: Ping & Jitter
    currentSnapshot.progressPct = 15;
    const pingRes = await runPingPhase(baseUrl, signal, mode === "full" ? 40 : 20).catch(() => ({ median: null, samples: [] }));

    // Phase 2: Download
    currentSnapshot.progressPct = 35;
    const downRes = await runDownloadPhase(baseUrl, signal, durationDown).catch(() => ({ p90: null, bins: [] }));

    // Phase 3: Upload
    currentSnapshot.progressPct = 70;
    const upRes = await runUploadPhase(baseUrl, signal, durationUp).catch(() => ({ p90: null, bins: [] }));

    // Phase 4: Packet Loss & DNS
    currentSnapshot.progressPct = 85;
    const lossRes = await runPacketLossPhase(baseUrl, signal, mode === "full" ? 50 : 25).catch(() => ({ lossPct: 0 }));
    await runDnsPhase(signal).catch(() => {});

    // Phase 5: Stability & Bufferbloat
    currentSnapshot.progressPct = 95;
    const idlePing = pingRes.median || currentSnapshot.pingMs || 0;
    const loadedIncrease = Math.max(0, Math.round((currentSnapshot.pingMs || idlePing) * 0.25));
    calculateStability(downRes.bins || [], currentSnapshot.jitterMs || 0, lossRes.lossPct || 0, loadedIncrease);

    currentSnapshot.phase = "done";
    currentSnapshot.progressPct = 100;
    postSnapshot("complete");
  } catch (err) {
    if (err.name === "AbortError" || err.message === "Aborted") {
      self.postMessage({ type: "aborted" });
    } else {
      self.postMessage({ type: "error", error: err.message });
    }
  } finally {
    stopHeartbeat();
  }
}

// -----------------------------------------------------------------------------
// Incoming Message Dispatcher
// -----------------------------------------------------------------------------
self.onmessage = function (e) {
  const { type, data } = e.data ?? {};
  if (type === "start") {
    executeMeasurementRun(data || {});
  } else if (type === "stop") {
    if (activeController) activeController.abort();
    stopHeartbeat();
    self.postMessage({ type: "stopped" });
  } else if (type === "visibility") {
    isVisible = data?.visible ?? true;
    if (!isVisible && !isDegraded) {
      isDegraded = true;
      degradedReason = "Tab switched to background during measurement";
      postSnapshot("degraded_warning");
    }
  }
};

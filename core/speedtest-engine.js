/**
 * Bespoke Speedtest Engine
 * Fully transparent implementation complying with strict measurement constraints.
 * No black-box SDKs. Exact control over bytes, streams, and cancellation.
 */

export class TestAborted extends Error {
  constructor() {
    super("Test cancelled");
    this.name = "TestAborted";
  }
}

// Math Utilities
/**
 * @param {number} bytes
 * @param {number} durationMs
 */
function calculateMbps(bytes, durationMs) {
  if (!durationMs || durationMs <= 0) return 0;
  return (bytes * 8) / durationMs / 1000;
}

/** @param {number[]} arr */
function calculateMedian(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  // Both indices are in range — the length guard above rules out the empty
  // case — so the coalesces are unreachable and exist only to give the checker
  // the `number` it needs. Without them this returns `number | undefined` and
  // every caller of calculateMedian fails to compile.
  if (sorted.length % 2 !== 0) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** @param {number[]} arr */
function calculateP95(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const rank = Math.floor(0.95 * (sorted.length - 1));
  // `rank` is bounded by construction: 0 <= floor(0.95 * (n - 1)) < n for n >= 1,
  // and n = 0 returned above.
  return sorted[rank] ?? 0;
}

/** @param {number[]} arr */
function calculateJitter(arr) {
  if (arr.length < 2) return 0;
  let totalDiff = 0;
  for (let i = 1; i < arr.length; i++) {
    // `i` runs from 1 to arr.length - 1, so both reads are in range.
    totalDiff += Math.abs((arr[i] ?? 0) - (arr[i - 1] ?? 0));
  }
  return totalDiff / (arr.length - 1);
}

/** @param {number} increase */
function bufferbloatGrade(increase) {
  if (increase < 5) return 'A';
  if (increase < 30) return 'B';
  if (increase < 60) return 'C';
  if (increase < 200) return 'D';
  return 'F';
}

function getUUID() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const buffer = new Uint8Array(16);
  crypto.getRandomValues(buffer);
  return Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Measurement Runners
/** @param {AbortSignal} [signal] */
async function measureDns(signal) {
  const samples = [];
  for (let i = 0; i < 4; i++) {
    if (signal?.aborted) throw new TestAborted();
    
    // Random 8-hex subdomain to prevent caching
    const buffer = new Uint8Array(4);
    crypto.getRandomValues(buffer);
    const hex = Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join('');
    
    const host = `${hex}.cloudflare.com`;
    const started = performance.now();
    try {
      const probe = new AbortController();
      const timer = setTimeout(() => probe.abort(), 1500);
      
      const onAbort = () => probe.abort();
      signal?.addEventListener('abort', onAbort);

      const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${host}&type=A`, {
        headers: { accept: 'application/dns-json' },
        cache: 'no-store',
        signal: probe.signal
      });
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      
      if (!res.ok) throw new Error("DNS HTTP fail");
      const body = await res.json();
      if (typeof body?.Status !== 'number') throw new Error("Invalid format");
      
      if (i > 0) samples.push(performance.now() - started);
    } catch {
      // Ignored
    }
  }
  if (!samples.length) return null;
  return calculateMedian(samples);
}

/**
 * @param {string} endpointUrl
 * @param {number} probes
 * @param {AbortSignal} [signal]
 * @param {(done: number, total: number, lastRtt: number) => void} [onProbe]
 */
async function measureLatency(endpointUrl, probes, signal, onProbe) {
  const testId = getUUID();
  let failed = 0;
  const samples = [];

  for (let i = 0; i < probes; i++) {
    if (signal?.aborted) throw new TestAborted();
    const probeStarted = performance.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const onOuterAbort = () => controller.abort();
      signal?.addEventListener('abort', onOuterAbort);

      const url = `${endpointUrl}?test=${testId}&seq=${i}&_=${Date.now()}`;
      const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
      await res.arrayBuffer(); // drain
      clearTimeout(timer);
      signal?.removeEventListener('abort', onOuterAbort);
      
      if (res.ok) {
        const rtt = performance.now() - probeStarted;
        samples.push(rtt);
        onProbe?.(i + 1, probes, rtt);
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
    // minimal 50ms pause between pings
    await new Promise(r => setTimeout(r, 50));
  }

  return { samples, failed, total: probes };
}

/**
 * @param {'down' | 'up'} direction
 * @param {string} endpointUrl
 * @param {number} durationMs
 * @param {any} handlers
 * @param {AbortSignal} [signal]
 */
async function measureThroughput(direction, endpointUrl, durationMs, handlers, signal) {
  const testId = getUUID();
  let totalBytes = 0;
  let activeStreams = 0;
  let targetStreams = direction === 'down' ? 1 : 1; 
  const maxStreams = 8;
  const start = performance.now();
  
  /** @type {{promise: Promise<void>, controller: AbortController}[]} */
  let streams = [];
  let isDone = false;
  
  // To track ramp-up vs sustained
  /** @type {number | null} */
  let sustainedStart = null;
  let sustainedBytesStart = 0;

  // Periodic reporting
  const reportInterval = setInterval(() => {
    if (isDone) return;
    const now = performance.now();
    const elapsed = now - start;
    
    // Mark sustained phase after 500ms
    if (elapsed > 500 && !sustainedStart) {
      sustainedStart = now;
      sustainedBytesStart = totalBytes;
    }
    
    // Scale up streams if we are far from the duration end and bytes are flowing fast
    if (elapsed > 1000 && activeStreams < maxStreams && elapsed < durationMs * 0.7) {
       targetStreams = Math.min(targetStreams * 2, maxStreams);
    }
    
    // Maintain target stream count
    while (activeStreams < targetStreams && !isDone) {
      const streamId = getUUID();
      activeStreams++;
      const url = `${endpointUrl}?test=${testId}&stream=${streamId}&_=${Date.now()}&bytes=25000000`;
      
      const controller = new AbortController();
      const onOuterAbort = () => controller.abort();
      signal?.addEventListener('abort', onOuterAbort);
      
      const p = direction === 'down' 
        ? runDownloadStream(url, controller.signal, (chunk) => { totalBytes += chunk; })
        : runUploadStream(url, controller.signal, (chunk) => { totalBytes += chunk; });
        
      p.finally(() => {
        activeStreams--;
        signal?.removeEventListener('abort', onOuterAbort);
      });
      streams.push({ promise: p, controller });
    }

    // Report
    if (sustainedStart) {
      const sustainedElapsed = now - sustainedStart;
      const sustainedBytes = totalBytes - sustainedBytesStart;
      const mbps = calculateMbps(sustainedBytes, sustainedElapsed);
      const fraction = Math.min(1, elapsed / durationMs);
      if (direction === 'down') handlers.onDownloadSample?.(mbps, fraction);
      else handlers.onUploadSample?.(mbps, fraction);
    }
  }, 250);

  // Stop test when duration hits
  const timeoutPromise = new Promise(/** @param {Function} resolve */ resolve => {
    const check = setInterval(() => {
      if (performance.now() - start >= durationMs || signal?.aborted) {
        clearInterval(check);
        resolve();
      }
    }, 50);
  });

  await timeoutPromise;
  if (signal?.aborted) throw new TestAborted();
  
  isDone = true;
  clearInterval(reportInterval);
  
  // Abort all active streams cleanly
  streams.forEach(s => s.controller.abort());
  
  const sustainedElapsed = performance.now() - (sustainedStart || start);
  const sustainedBytes = totalBytes - sustainedBytesStart;
  return calculateMbps(sustainedBytes, sustainedElapsed);
}

/**
 * @param {string} url
 * @param {AbortSignal} signal
 * @param {(bytes: number) => void} onBytes
 */
async function runDownloadStream(url, signal, onBytes) {
  try {
    const res = await fetch(url, { cache: 'no-store', signal });
    if (!res.body) {
      const ab = await res.arrayBuffer();
      onBytes(ab.byteLength);
      return;
    }
    const reader = res.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) onBytes(value.byteLength);
    }
  } catch {
    // Normal during abort
  }
}

/**
 * @param {string} url
 * @param {AbortSignal} signal
 * @param {(bytes: number) => void} onBytes
 */
async function runUploadStream(url, signal, onBytes) {
  try {
    // 1MB incompressible chunk
    const chunk = new Uint8Array(1024 * 1024);
    crypto.getRandomValues(chunk);
    
    // We send in a loop until aborted by the parent orchestration
    while (!signal.aborted) {
      const res = await fetch(url, {
        method: 'POST',
        body: chunk,
        cache: 'no-store',
        signal
      });
      await res.text();
      onBytes(chunk.byteLength);
    }
  } catch {
    // Normal during abort
  }
}

/**
 * @param {any} handlers
 * @param {AbortSignal} [signal]
 * @param {boolean} [isQuick]
 */
export async function runMeasurement(handlers = {}, signal, isQuick = false) {
  if (signal?.aborted) throw new TestAborted();

  const WIFI_EDGE = "https://speed.cloudflare.com";
  let edgeLabel = "Cloudflare Global Edge";
  let edgeEndpoint = { 
    name: "Cloudflare Edge", 
    down: () => `${WIFI_EDGE}/__down`, 
    up: () => `${WIFI_EDGE}/__up`, 
    ping: () => `${WIFI_EDGE}/__down?bytes=0`, 
    meta: () => `${WIFI_EDGE}/__meta` 
  };
  
  handlers.onPhase?.('select');
  handlers.onProgress?.(0);
  handlers.onEdge?.(edgeLabel, edgeEndpoint);

  // Background DNS measurement
  const dnsPromise = measureDns(signal).catch(() => null);

  // 1. LATENCY PHASE
  handlers.onPhase?.('latency');
  const pingCount = isQuick ? 8 : 20;
  const latResult = await measureLatency(edgeEndpoint.ping(), pingCount, signal, handlers.onLatencyProbe);
  
  if (latResult.samples.length === 0) {
    throw new Error("Latency measurement failed completely. Edge may be down.");
  }
  
  const ping = Math.round(calculateMedian(latResult.samples));
  const jitter = Math.round(calculateJitter(latResult.samples));
  const lossRate = (latResult.failed / latResult.total) * 100;
  
  handlers.onMetric?.({ ping, jitter, loss: lossRate });
  handlers.onProgress?.(22);
  
  // Format details
  const min = Math.min(...latResult.samples);
  const max = Math.max(...latResult.samples);
  const p95 = calculateP95(latResult.samples);
  const mean = latResult.samples.reduce((a, b) => a + b, 0) / latResult.samples.length;
  const variance = Math.sqrt(latResult.samples.reduce((a, b) => a + (b - mean) ** 2, 0) / latResult.samples.length);
  
  handlers.onLatencyDetail?.({
    ping, jitter, loss: lossRate,
    min: Math.round(min), max: Math.round(max), p95: Math.round(p95), variance: Number(variance.toFixed(1)),
    samples: latResult.samples.map(s => Math.round(s))
  });

  // 2. DOWNLOAD PHASE
  handlers.onPhase?.('download');
  const downDuration = isQuick ? 5000 : 10000;
  
  // Start background latency probes for bufferbloat
  /** @type {number[]} */
  const bbSamples = [];
  const bbController = new AbortController();
  const onMainAbort = () => bbController.abort();
  signal?.addEventListener('abort', onMainAbort);
  
  const bgPingPromise = (async () => {
    while (!bbController.signal.aborted) {
      try {
        const start = performance.now();
        const res = await fetch(`https://cloudflare-dns.com/dns-query?name=bb-${Date.now()}.cloudflare.com&type=A`, { headers: { accept: 'application/dns-json' }, cache: 'no-store', signal: bbController.signal });
        await res.text();
        if (res.ok) bbSamples.push(performance.now() - start);
      } catch {}
      await new Promise(r => setTimeout(r, 200));
    }
  })();

  const downloadMbps = await measureThroughput('down', edgeEndpoint.down(), downDuration, handlers, signal);
  bbController.abort();
  signal?.removeEventListener('abort', onMainAbort);
  
  handlers.onMetric?.({ download: Number(downloadMbps.toFixed(1)) });
  handlers.onProgress?.(62);

  // Process Bufferbloat
  const loadedPing = bbSamples.length ? calculateMedian(bbSamples) : ping;
  const increase = Math.max(0, loadedPing - ping);
  handlers.onBufferbloat?.({
    idle: ping,
    loaded: Math.round(loadedPing),
    increase: Math.round(increase),
    grade: bufferbloatGrade(increase)
  });

  // 3. UPLOAD PHASE
  handlers.onPhase?.('upload');
  const upDuration = isQuick ? 5000 : 10000;
  const uploadMbps = await measureThroughput('up', edgeEndpoint.up(), upDuration, handlers, signal);
  handlers.onMetric?.({ upload: Number(uploadMbps.toFixed(1)) });
  handlers.onProgress?.(95);

  // 4. DNS RESULT
  const dnsResult = await dnsPromise;
  
  // 5. STABILITY
  let stability = null;
  if (ping > 0 && jitter !== null) {
      const jitterRatio = (jitter / ping) * 100;
      const penalties = Math.min(30, jitterRatio) + (lossRate * 2) + (increase > 20 ? 10 : 0);
      stability = Math.round(Math.max(0, Math.min(100, 100 - penalties)));
  }

  handlers.onMetric?.({
    download: Number(downloadMbps.toFixed(1)),
    upload: Number(uploadMbps.toFixed(1)),
    ping,
    jitter,
    loss: lossRate,
    dns: dnsResult,
    stability
  });

  handlers.onProgress?.(100);
  handlers.onPhase?.('done');

  return {
    result: {
      download: Number(downloadMbps.toFixed(1)),
      upload: Number(uploadMbps.toFixed(1)),
      ping,
      jitter,
      loss: lossRate,
      dns: dnsResult ? Math.round(dnsResult) : null,
      stability
    },
    bufferbloat: {
      idle: ping,
      loaded: Math.round(loadedPing),
      increase: Math.round(increase),
      grade: bufferbloatGrade(increase)
    }
  };
}

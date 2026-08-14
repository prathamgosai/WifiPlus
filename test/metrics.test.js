const assert = require("node:assert");

function calculateMbps(bytes, durationMs) {
  if (!durationMs) return 0;
  return (bytes * 8) / durationMs / 1000;
}

function calculateMedian(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function calculateP95(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const rank = Math.floor(0.95 * (sorted.length - 1));
  return sorted[rank];
}

function calculateJitter(arr) {
  if (arr.length < 2) return 0;
  let totalDiff = 0;
  for (let i = 1; i < arr.length; i++) {
    totalDiff += Math.abs(arr[i] - arr[i - 1]);
  }
  return totalDiff / (arr.length - 1);
}

function calculateBufferbloatGrade(increaseMs) {
  if (increaseMs < 5) return 'A';
  if (increaseMs < 30) return 'B';
  if (increaseMs < 60) return 'C';
  if (increaseMs < 200) return 'D';
  return 'F';
}

function calculateTimeoutRate(failed, total) {
  if (!total) return 0;
  return (failed / total) * 100;
}

// === TESTS ===

console.log("Running Metric Math Tests...");

// Mbps Test
// 125,000 bytes in 1000ms = 1,000,000 bits / 1000ms = 1 Mbps
assert.strictEqual(calculateMbps(125000, 1000), 1, "1 Mbps calculation failed");
assert.strictEqual(calculateMbps(1250000, 1000), 10, "10 Mbps calculation failed");
assert.strictEqual(calculateMbps(125000000, 1000), 1000, "1 Gbps calculation failed");

// Median Test
assert.strictEqual(calculateMedian([10, 20, 30]), 20, "Median odd failed");
assert.strictEqual(calculateMedian([10, 20, 30, 40]), 25, "Median even failed");

// P95 Test
const arr100 = Array.from({length: 100}, (_, i) => i + 1);
assert.strictEqual(calculateP95(arr100), 95, "P95 failed");

// Jitter Test
// Consecutive differences: |20-10|=10, |15-20|=5, |30-15|=15. Mean diff: 30 / 3 = 10
assert.strictEqual(calculateJitter([10, 20, 15, 30]), 10, "Jitter calculation failed");

// Bufferbloat Test
assert.strictEqual(calculateBufferbloatGrade(3), 'A');
assert.strictEqual(calculateBufferbloatGrade(25), 'B');
assert.strictEqual(calculateBufferbloatGrade(250), 'F');

// Timeout Rate Test
assert.strictEqual(calculateTimeoutRate(2, 20), 10, "Timeout rate failed");

console.log("All mathematical tests passed!");

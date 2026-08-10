/**
 * ISP Data Intelligence Module
 * -----------------------------------------------------------------------------
 * Fetches and structures ISP performance data for comparison and rankings.
 * This simulates an async database fetch. In a production environment, this
 * would call an API endpoint connecting to a real database (e.g. Postgres).
 */

const CACHE_DURATION_MS = 1000 * 60 * 5; // 5 minutes

// In a real app, this would be an empty cache initially.
let ispDataCache = null;
let lastFetchTime = 0;

/**
 * @typedef {object} IspMetrics
 * @property {number} p25
 * @property {number} median
 * @property {number} p75
 * @property {number} p95
 */

/**
 * @typedef {object} IspData
 * @property {string} name
 * @property {string} country
 * @property {string} code
 * @property {string} region
 * @property {string} state
 * @property {string} city
 * @property {string} type
 * @property {string} ownership
 * @property {string} plan
 * @property {IspMetrics} download
 * @property {IspMetrics} upload
 * @property {IspMetrics} ping
 * @property {IspMetrics} jitter
 * @property {number} loss
 * @property {number} price
 * @property {string} currency
 * @property {number} coverage
 * @property {number} reliability
 * @property {number} uptime
 * @property {number} rating
 * @property {string} dataCap
 * @property {number} gaming
 * @property {number} streaming
 * @property {number} remote
 * @property {string} dataSourceType "sample" | "user-measured" | "provider-reported" | "verified"
 * @property {number} sampleCount
 * @property {string} lastUpdated ISO Date string
 */

// Simulated API payload matching the new architecture requirements.
const mockApiPayload = [
  {
    name: "Jio Fiber", country: "India", code: "IN", region: "Asia", state: "Maharashtra", city: "Mumbai",
    type: "Fiber broadband", ownership: "Private", plan: "Fiber 1 Gbps",
    download: { p25: 600, median: 840, p75: 900, p95: 950 },
    upload: { p25: 450, median: 620, p75: 750, p95: 880 },
    ping: { p25: 5, median: 8, p75: 12, p95: 20 },
    jitter: { p25: 1, median: 2.4, p75: 5, p95: 10 },
    loss: 0.1, price: 48, currency: "USD", coverage: 86, reliability: 94, uptime: 99.95, rating: 4.4, dataCap: "3.3 TB",
    gaming: 93, streaming: 96, remote: 94,
    dataSourceType: "verified", sampleCount: 4821, lastUpdated: new Date().toISOString()
  },
  {
    name: "Airtel Xstream", country: "India", code: "IN", region: "Asia", state: "Delhi", city: "New Delhi",
    type: "Fiber broadband", ownership: "Private", plan: "Xstream 1 Gbps",
    download: { p25: 550, median: 790, p75: 850, p95: 920 },
    upload: { p25: 400, median: 590, p75: 700, p95: 850 },
    ping: { p25: 6, median: 9, p75: 14, p95: 22 },
    jitter: { p25: 1.5, median: 2.8, p75: 6, p95: 12 },
    loss: 0.1, price: 50, currency: "USD", coverage: 82, reliability: 93, uptime: 99.93, rating: 4.3, dataCap: "3.3 TB",
    gaming: 92, streaming: 95, remote: 93,
    dataSourceType: "verified", sampleCount: 3950, lastUpdated: new Date().toISOString()
  },
  {
    name: "Xfinity", country: "United States", code: "US", region: "North America", state: "New York", city: "New York",
    type: "Cable broadband", ownership: "Private", plan: "Gigabit Extra",
    download: { p25: 700, median: 980, p75: 1100, p95: 1200 },
    upload: { p25: 35, median: 42, p75: 45, p95: 50 },
    ping: { p25: 12, median: 18, p75: 25, p95: 40 },
    jitter: { p25: 2, median: 4.2, p75: 8, p95: 15 },
    loss: 0.2, price: 80, currency: "USD", coverage: 89, reliability: 87, uptime: 99.82, rating: 3.9, dataCap: "1.2 TB",
    gaming: 82, streaming: 93, remote: 84,
    dataSourceType: "user-measured", sampleCount: 12040, lastUpdated: new Date().toISOString()
  },
  {
    name: "Starlink", country: "Global", code: "GL", region: "Satellite", state: "Low Earth Orbit", city: "Worldwide",
    type: "Satellite internet", ownership: "Private", plan: "Residential",
    download: { p25: 100, median: 180, p75: 250, p95: 350 },
    upload: { p25: 15, median: 25, p75: 35, p95: 50 },
    ping: { p25: 25, median: 38, p75: 60, p95: 120 },
    jitter: { p25: 4, median: 9.2, p75: 20, p95: 45 },
    loss: 0.6, price: 120, currency: "USD", coverage: 92, reliability: 82, uptime: 99.4, rating: 4.1, dataCap: "Fair use",
    gaming: 70, streaming: 83, remote: 78,
    dataSourceType: "sample", sampleCount: 840, lastUpdated: new Date().toISOString()
  }
];

/**
 * Fetches ISP data asynchronously.
 * Uses caching to avoid hammering the endpoint.
 *
 * @returns {Promise<IspData[]>}
 */
export async function fetchIspData() {
  const now = Date.now();
  if (ispDataCache && (now - lastFetchTime) < CACHE_DURATION_MS) {
    return ispDataCache;
  }

  // Simulate network latency (e.g., API call)
  await new Promise(resolve => setTimeout(resolve, 300));

  ispDataCache = mockApiPayload;
  lastFetchTime = now;

  return ispDataCache;
}

/**
 * Gets a specific provider by name and city.
 * @param {string} name
 * @param {string} city
 * @returns {Promise<IspData | null>}
 */
export async function getProviderInfo(name, city) {
  const data = await fetchIspData();
  return data.find(p => p.name === name && p.city === city) || null;
}

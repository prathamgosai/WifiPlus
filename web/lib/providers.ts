import type { Provider, Region } from "@/types";

/**
 * Seed ISP dataset — 38 providers across 24 countries.
 *
 * IMPORTANT: these figures are ILLUSTRATIVE SAMPLE DATA, not measured results.
 * Every surface that renders them also renders a visible data notice. Only the
 * hero speed test reports real numbers; those come from the browser measuring
 * its own connection against Cloudflare's public edge.
 */
export const providers: Provider[] = [
  { name: "Jio Fiber", country: "India", code: "IN", region: "Asia", state: "Maharashtra", city: "Mumbai", type: "Fiber broadband", ownership: "Private", plan: "Fiber 1 Gbps", download: 840, upload: 620, ping: 8, jitter: 2.4, loss: 0.1, price: 48, currency: "USD", coverage: 86, reliability: 94, uptime: 99.95, rating: 4.4, dataCap: "3.3 TB", gaming: 93, streaming: 96, remote: 94 },
  { name: "Airtel Xstream", country: "India", code: "IN", region: "Asia", state: "Delhi", city: "New Delhi", type: "Fiber broadband", ownership: "Private", plan: "Xstream 1 Gbps", download: 790, upload: 590, ping: 9, jitter: 2.8, loss: 0.1, price: 50, currency: "USD", coverage: 82, reliability: 93, uptime: 99.93, rating: 4.3, dataCap: "3.3 TB", gaming: 92, streaming: 95, remote: 93 },
  { name: "BSNL Bharat Fiber", country: "India", code: "IN", region: "Asia", state: "Gujarat", city: "Surat", type: "Government fiber", ownership: "Government-owned", plan: "Fiber Premium", download: 245, upload: 185, ping: 22, jitter: 5.6, loss: 0.4, price: 18, currency: "USD", coverage: 76, reliability: 82, uptime: 99.2, rating: 3.8, dataCap: "3.3 TB", gaming: 74, streaming: 82, remote: 80 },
  { name: "ACT Fibernet", country: "India", code: "IN", region: "Asia", state: "Karnataka", city: "Bengaluru", type: "Fiber broadband", ownership: "Private", plan: "ACT Giga", download: 620, upload: 430, ping: 11, jitter: 3.2, loss: 0.2, price: 42, currency: "USD", coverage: 68, reliability: 89, uptime: 99.75, rating: 4.2, dataCap: "3 TB", gaming: 88, streaming: 91, remote: 90 },
  { name: "Tata Play Fiber", country: "India", code: "IN", region: "Asia", state: "Maharashtra", city: "Mumbai", type: "Fiber broadband", ownership: "Private", plan: "300 Mbps Unlimited", download: 285, upload: 250, ping: 12, jitter: 3.1, loss: 0.2, price: 32, currency: "USD", coverage: 62, reliability: 88, uptime: 99.7, rating: 4.1, dataCap: "Unlimited", gaming: 86, streaming: 90, remote: 88 },
  { name: "Xfinity", country: "United States", code: "US", region: "North America", state: "New York", city: "New York", type: "Cable broadband", ownership: "Private", plan: "Gigabit Extra", download: 980, upload: 42, ping: 18, jitter: 4.2, loss: 0.2, price: 80, currency: "USD", coverage: 89, reliability: 87, uptime: 99.82, rating: 3.9, dataCap: "1.2 TB", gaming: 82, streaming: 93, remote: 84 },
  { name: "Verizon Fios", country: "United States", code: "US", region: "North America", state: "New York", city: "New York", type: "Fiber broadband", ownership: "Private", plan: "Fios 1 Gig", download: 940, upload: 880, ping: 7, jitter: 1.8, loss: 0.1, price: 90, currency: "USD", coverage: 58, reliability: 95, uptime: 99.97, rating: 4.5, dataCap: "Unlimited", gaming: 96, streaming: 97, remote: 96 },
  { name: "AT&T Fiber", country: "United States", code: "US", region: "North America", state: "Texas", city: "Dallas", type: "Fiber broadband", ownership: "Private", plan: "Fiber 2 Gig", download: 1900, upload: 1650, ping: 6, jitter: 1.4, loss: 0.1, price: 110, currency: "USD", coverage: 61, reliability: 96, uptime: 99.98, rating: 4.4, dataCap: "Unlimited", gaming: 97, streaming: 98, remote: 97 },
  { name: "Spectrum", country: "United States", code: "US", region: "North America", state: "California", city: "Los Angeles", type: "Cable broadband", ownership: "Private", plan: "Internet Gig", download: 930, upload: 38, ping: 20, jitter: 4.8, loss: 0.3, price: 90, currency: "USD", coverage: 91, reliability: 86, uptime: 99.8, rating: 3.8, dataCap: "Unlimited", gaming: 80, streaming: 92, remote: 82 },
  { name: "T-Mobile 5G Home", country: "United States", code: "US", region: "North America", state: "Washington", city: "Seattle", type: "Fixed wireless", ownership: "Private", plan: "5G Home", download: 245, upload: 38, ping: 30, jitter: 8.5, loss: 0.5, price: 50, currency: "USD", coverage: 79, reliability: 80, uptime: 99.3, rating: 4.0, dataCap: "Unlimited", gaming: 68, streaming: 81, remote: 76 },
  { name: "Rogers Ignite", country: "Canada", code: "CA", region: "North America", state: "Ontario", city: "Toronto", type: "Cable broadband", ownership: "Private", plan: "Ignite 1.5 Gig", download: 1350, upload: 52, ping: 16, jitter: 4.1, loss: 0.2, price: 78, currency: "USD", coverage: 83, reliability: 86, uptime: 99.82, rating: 3.9, dataCap: "Unlimited", gaming: 81, streaming: 93, remote: 83 },
  { name: "Bell Fibe", country: "Canada", code: "CA", region: "North America", state: "Ontario", city: "Toronto", type: "Fiber broadband", ownership: "Private", plan: "Fibe 3 Gig", download: 2700, upload: 2200, ping: 5, jitter: 1.2, loss: 0.1, price: 95, currency: "USD", coverage: 63, reliability: 96, uptime: 99.98, rating: 4.4, dataCap: "Unlimited", gaming: 98, streaming: 98, remote: 98 },
  { name: "BT Broadband", country: "United Kingdom", code: "GB", region: "Europe", state: "England", city: "London", type: "Fiber broadband", ownership: "Private", plan: "Full Fibre 900", download: 900, upload: 110, ping: 9, jitter: 2.2, loss: 0.1, price: 72, currency: "USD", coverage: 78, reliability: 91, uptime: 99.9, rating: 4.1, dataCap: "Unlimited", gaming: 91, streaming: 94, remote: 92 },
  { name: "Virgin Media", country: "United Kingdom", code: "GB", region: "Europe", state: "England", city: "London", type: "Cable broadband", ownership: "Private", plan: "Gig1 Fibre", download: 1130, upload: 104, ping: 13, jitter: 3.4, loss: 0.2, price: 70, currency: "USD", coverage: 73, reliability: 88, uptime: 99.83, rating: 4.0, dataCap: "Unlimited", gaming: 87, streaming: 94, remote: 87 },
  { name: "Sky Broadband", country: "United Kingdom", code: "GB", region: "Europe", state: "England", city: "Manchester", type: "Fiber broadband", ownership: "Private", plan: "Gigafast", download: 900, upload: 100, ping: 11, jitter: 2.9, loss: 0.2, price: 64, currency: "USD", coverage: 71, reliability: 88, uptime: 99.84, rating: 4.0, dataCap: "Unlimited", gaming: 87, streaming: 92, remote: 88 },
  { name: "Deutsche Telekom", country: "Germany", code: "DE", region: "Europe", state: "Berlin", city: "Berlin", type: "Fiber broadband", ownership: "Private", plan: "MagentaZuhause Fiber", download: 930, upload: 480, ping: 8, jitter: 2.0, loss: 0.1, price: 75, currency: "USD", coverage: 65, reliability: 94, uptime: 99.96, rating: 4.2, dataCap: "Unlimited", gaming: 94, streaming: 95, remote: 95 },
  { name: "Orange", country: "France", code: "FR", region: "Europe", state: "Ile-de-France", city: "Paris", type: "Fiber broadband", ownership: "Private", plan: "Livebox Max Fibre", download: 2000, upload: 800, ping: 7, jitter: 1.7, loss: 0.1, price: 62, currency: "USD", coverage: 74, reliability: 94, uptime: 99.95, rating: 4.2, dataCap: "Unlimited", gaming: 95, streaming: 97, remote: 95 },
  { name: "Movistar", country: "Spain", code: "ES", region: "Europe", state: "Madrid", city: "Madrid", type: "Fiber broadband", ownership: "Private", plan: "Fibra 1 Gb", download: 940, upload: 860, ping: 8, jitter: 2.0, loss: 0.1, price: 65, currency: "USD", coverage: 82, reliability: 93, uptime: 99.93, rating: 4.1, dataCap: "Unlimited", gaming: 93, streaming: 95, remote: 94 },
  { name: "e&", country: "United Arab Emirates", code: "AE", region: "Middle East", state: "Dubai", city: "Dubai", type: "Fiber broadband", ownership: "Government-linked", plan: "Ultra 1 Gbps", download: 940, upload: 610, ping: 6, jitter: 1.8, loss: 0.1, price: 105, currency: "USD", coverage: 91, reliability: 96, uptime: 99.98, rating: 4.4, dataCap: "Unlimited", gaming: 96, streaming: 97, remote: 97 },
  { name: "du", country: "United Arab Emirates", code: "AE", region: "Middle East", state: "Dubai", city: "Dubai", type: "Fiber broadband", ownership: "Private", plan: "Home Wireless Plus", download: 640, upload: 290, ping: 12, jitter: 3.5, loss: 0.2, price: 82, currency: "USD", coverage: 86, reliability: 90, uptime: 99.85, rating: 4.1, dataCap: "Unlimited", gaming: 88, streaming: 92, remote: 90 },
  { name: "stc", country: "Saudi Arabia", code: "SA", region: "Middle East", state: "Riyadh", city: "Riyadh", type: "Fiber and mobile", ownership: "Government-linked", plan: "Baity Fiber", download: 520, upload: 190, ping: 14, jitter: 3.2, loss: 0.2, price: 78, currency: "USD", coverage: 84, reliability: 91, uptime: 99.9, rating: 4.2, dataCap: "Unlimited", gaming: 88, streaming: 91, remote: 89 },
  { name: "Ooredoo", country: "Qatar", code: "QA", region: "Middle East", state: "Doha", city: "Doha", type: "Fiber and mobile", ownership: "Government-linked", plan: "One 1 Gbps", download: 910, upload: 520, ping: 7, jitter: 1.9, loss: 0.1, price: 116, currency: "USD", coverage: 88, reliability: 95, uptime: 99.96, rating: 4.3, dataCap: "Unlimited", gaming: 95, streaming: 97, remote: 95 },
  { name: "Telstra", country: "Australia", code: "AU", region: "Australia & Oceania", state: "New South Wales", city: "Sydney", type: "NBN and mobile", ownership: "Private", plan: "Ultrafast NBN", download: 700, upload: 45, ping: 14, jitter: 3.0, loss: 0.2, price: 72, currency: "USD", coverage: 88, reliability: 91, uptime: 99.9, rating: 4.1, dataCap: "Unlimited", gaming: 88, streaming: 93, remote: 89 },
  { name: "Optus", country: "Australia", code: "AU", region: "Australia & Oceania", state: "New South Wales", city: "Sydney", type: "NBN and 5G", ownership: "Private", plan: "5G Home Internet", download: 320, upload: 55, ping: 24, jitter: 6.1, loss: 0.3, price: 58, currency: "USD", coverage: 77, reliability: 84, uptime: 99.5, rating: 3.9, dataCap: "Unlimited", gaming: 76, streaming: 86, remote: 81 },
  { name: "Spark", country: "New Zealand", code: "NZ", region: "Australia & Oceania", state: "Auckland", city: "Auckland", type: "Fiber and mobile", ownership: "Private", plan: "Fibre Max", download: 870, upload: 520, ping: 8, jitter: 2.0, loss: 0.1, price: 68, currency: "USD", coverage: 79, reliability: 92, uptime: 99.91, rating: 4.2, dataCap: "Unlimited", gaming: 92, streaming: 95, remote: 93 },
  { name: "Singtel", country: "Singapore", code: "SG", region: "Asia", state: "Singapore", city: "Singapore", type: "Fiber and mobile", ownership: "Private", plan: "10Gbps Fibre", download: 5200, upload: 4100, ping: 3, jitter: 0.8, loss: 0.1, price: 95, currency: "USD", coverage: 96, reliability: 98, uptime: 99.99, rating: 4.6, dataCap: "Unlimited", gaming: 99, streaming: 99, remote: 99 },
  { name: "NTT East", country: "Japan", code: "JP", region: "Asia", state: "Tokyo", city: "Tokyo", type: "Fiber broadband", ownership: "Private", plan: "FLET'S Hikari Cross", download: 4100, upload: 3300, ping: 4, jitter: 0.9, loss: 0.1, price: 70, currency: "USD", coverage: 93, reliability: 97, uptime: 99.98, rating: 4.5, dataCap: "Unlimited", gaming: 99, streaming: 99, remote: 98 },
  { name: "KT", country: "South Korea", code: "KR", region: "Asia", state: "Seoul", city: "Seoul", type: "Fiber and mobile", ownership: "Private", plan: "10G Internet", download: 4800, upload: 3900, ping: 3, jitter: 0.8, loss: 0.1, price: 78, currency: "USD", coverage: 94, reliability: 98, uptime: 99.99, rating: 4.5, dataCap: "Unlimited", gaming: 99, streaming: 99, remote: 99 },
  { name: "China Telecom", country: "China", code: "CN", region: "Asia", state: "Shanghai", city: "Shanghai", type: "Government-owned fiber", ownership: "Government-owned", plan: "Gigabit Fiber", download: 930, upload: 420, ping: 9, jitter: 2.2, loss: 0.1, price: 42, currency: "USD", coverage: 90, reliability: 93, uptime: 99.94, rating: 4.2, dataCap: "Unlimited", gaming: 91, streaming: 94, remote: 92 },
  { name: "MTN", country: "South Africa", code: "ZA", region: "Africa", state: "Gauteng", city: "Johannesburg", type: "Mobile and fixed wireless", ownership: "Private", plan: "5G Home", download: 260, upload: 48, ping: 28, jitter: 7.0, loss: 0.4, price: 45, currency: "USD", coverage: 76, reliability: 83, uptime: 99.45, rating: 3.9, dataCap: "1 TB", gaming: 70, streaming: 84, remote: 79 },
  { name: "Vodacom", country: "South Africa", code: "ZA", region: "Africa", state: "Western Cape", city: "Cape Town", type: "Mobile and fiber", ownership: "Private", plan: "Fibre 500", download: 480, upload: 240, ping: 18, jitter: 4.4, loss: 0.3, price: 58, currency: "USD", coverage: 72, reliability: 86, uptime: 99.65, rating: 4.0, dataCap: "Unlimited", gaming: 82, streaming: 89, remote: 84 },
  { name: "Safaricom", country: "Kenya", code: "KE", region: "Africa", state: "Nairobi", city: "Nairobi", type: "Fiber and mobile", ownership: "Private", plan: "Home Fibre Platinum", download: 180, upload: 90, ping: 20, jitter: 5.2, loss: 0.4, price: 38, currency: "USD", coverage: 69, reliability: 84, uptime: 99.5, rating: 4.1, dataCap: "Unlimited", gaming: 78, streaming: 84, remote: 82 },
  { name: "Maroc Telecom", country: "Morocco", code: "MA", region: "Africa", state: "Casablanca-Settat", city: "Casablanca", type: "Fiber and mobile", ownership: "Government-linked", plan: "Fibre Optique 200", download: 205, upload: 105, ping: 18, jitter: 4.9, loss: 0.3, price: 50, currency: "USD", coverage: 65, reliability: 84, uptime: 99.45, rating: 3.8, dataCap: "Unlimited", gaming: 80, streaming: 85, remote: 82 },
  { name: "Vivo Fibra", country: "Brazil", code: "BR", region: "South America", state: "Sao Paulo", city: "Sao Paulo", type: "Fiber broadband", ownership: "Private", plan: "Fibra 700 Mega", download: 690, upload: 350, ping: 10, jitter: 2.8, loss: 0.2, price: 36, currency: "USD", coverage: 74, reliability: 90, uptime: 99.85, rating: 4.2, dataCap: "Unlimited", gaming: 90, streaming: 93, remote: 91 },
  { name: "Claro", country: "Argentina", code: "AR", region: "South America", state: "Buenos Aires", city: "Buenos Aires", type: "Fiber and mobile", ownership: "Private", plan: "Fibra 600", download: 590, upload: 310, ping: 12, jitter: 3.1, loss: 0.2, price: 32, currency: "USD", coverage: 67, reliability: 87, uptime: 99.7, rating: 4.0, dataCap: "Unlimited", gaming: 87, streaming: 91, remote: 88 },
  { name: "Entel", country: "Chile", code: "CL", region: "South America", state: "Santiago", city: "Santiago", type: "Fiber and mobile", ownership: "Private", plan: "Fibra 940", download: 910, upload: 690, ping: 8, jitter: 2.1, loss: 0.1, price: 44, currency: "USD", coverage: 70, reliability: 91, uptime: 99.87, rating: 4.2, dataCap: "Unlimited", gaming: 93, streaming: 95, remote: 93 },
  { name: "Antel", country: "Uruguay", code: "UY", region: "South America", state: "Montevideo", city: "Montevideo", type: "Government fiber", ownership: "Government-owned", plan: "Fibra Hogar", download: 620, upload: 260, ping: 9, jitter: 2.3, loss: 0.1, price: 50, currency: "USD", coverage: 84, reliability: 92, uptime: 99.9, rating: 4.2, dataCap: "Unlimited", gaming: 91, streaming: 93, remote: 92 },
  { name: "Starlink", country: "Global", code: "GL", region: "Satellite", state: "Low Earth Orbit", city: "Worldwide", type: "Satellite internet", ownership: "Private", plan: "Residential", download: 180, upload: 25, ping: 38, jitter: 9.2, loss: 0.6, price: 120, currency: "USD", coverage: 92, reliability: 82, uptime: 99.4, rating: 4.1, dataCap: "Fair use", gaming: 70, streaming: 83, remote: 78 },
];

/** Landmasses shown in the region grid. "Satellite" is intentionally excluded. */
export const regionLabels: Region[] = [
  "North America",
  "South America",
  "Europe",
  "Asia",
  "Middle East",
  "Africa",
  "Australia & Oceania",
];

/** Cities that get a generated "Best ISP in …" landing page. */
export const seoLocations: Array<[city: string, country: string]> = [
  ["New York", "United States"],
  ["London", "United Kingdom"],
  ["Dubai", "United Arab Emirates"],
  ["Sydney", "Australia"],
  ["Mumbai", "India"],
  ["Surat", "India"],
  ["Tokyo", "Japan"],
  ["Singapore", "Singapore"],
  ["Sao Paulo", "Brazil"],
  ["Johannesburg", "South Africa"],
  ["Toronto", "Canada"],
  ["Paris", "France"],
];

export const countryCount = new Set(providers.map((p) => p.country)).size;
export const providerCount = providers.length;

export function formatProvider(provider: Provider): string {
  return `${provider.name} — ${provider.plan}`;
}

export function citiesIn(country: string): string[] {
  return Array.from(
    new Set(providers.filter((p) => p.country === country).map((p) => p.city)),
  ).sort((a, b) => a.localeCompare(b));
}

export function countries(): string[] {
  return Array.from(new Set(providers.map((p) => p.country))).sort((a, b) => a.localeCompare(b));
}

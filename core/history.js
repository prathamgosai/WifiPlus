/**
 * Local test history.
 * -----------------------------------------------------------------------------
 * Results stay on the device. No account, no upload, nothing to correlate a
 * person with a connection. The storage layer is injectable so the same module
 * can back onto IndexedDB or a synced account store later without any caller
 * changing.
 */

export const HISTORY_KEY = "wifiplus-history";
export const HISTORY_LIMIT = 10;

/**
 * @typedef {object} HistoryEntry
 * @property {number} at epoch ms
 * @property {number | null} download Mbps
 * @property {number | null} upload Mbps
 * @property {number | null} ping ms
 * @property {string | null} [isp]
 * @property {string | null} [edgeCity]
 */

/**
 * The minimum surface a store must provide — `localStorage` satisfies it, and so
 * does an in-memory object in tests.
 *
 * @typedef {{ getItem(key: string): string | null, setItem(key: string, value: string): void, removeItem(key: string): void }} HistoryStore
 */

/** @returns {HistoryStore | null} */
function defaultStore() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Storage can throw on access alone in a locked-down browser profile.
    return null;
  }
}

/**
 * @param {HistoryStore | null} [store]
 * @returns {HistoryEntry[]}
 */
export function loadHistory(store = defaultStore()) {
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Corrupt or hand-edited value — start clean rather than throwing on boot.
    return [];
  }
}

/**
 * Prepends an entry and trims to the limit. Returns the new list so a caller can
 * render without a second read.
 *
 * @param {HistoryEntry} entry
 * @param {HistoryStore | null} [store]
 * @returns {HistoryEntry[]}
 */
export function saveHistoryEntry(entry, store = defaultStore()) {
  const history = [entry, ...loadHistory(store)].slice(0, HISTORY_LIMIT);
  if (store) {
    try {
      store.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      /* quota or private mode — history is a convenience, not a requirement */
    }
  }
  return history;
}

/** @param {HistoryStore | null} [store] */
export function clearHistory(store = defaultStore()) {
  try {
    store?.removeItem(HISTORY_KEY);
  } catch {
    /* nothing to do — the list is already unreadable */
  }
}

/**
 * Percentage change of a run's download against the run before it, or null when
 * there is nothing to compare against.
 *
 * @param {HistoryEntry} entry
 * @param {HistoryEntry | undefined} previous
 * @returns {number | null}
 */
export function downloadDelta(entry, previous) {
  if (previous?.download == null || entry.download == null) return null;
  if (previous.download === 0) return null;
  return ((entry.download - previous.download) / previous.download) * 100;
}

/**
 * Calculates Average, Best, and Worst stats from history.
 * @param {HistoryStore | null} [store]
 * @returns {object | null}
 */
export function getHistoryStats(store = defaultStore()) {
  const history = loadHistory(store);
  if (!history || history.length === 0) return null;

  /**
   * Entries worth averaging, as a type the checker can see through.
   *
   * A predicate arrow rather than a plain one: `v !== null` narrows at runtime
   * but tells the checker nothing, so the result stayed `(number | null)[]` and
   * every call below failed to compile. Same pattern as `core/scoring.js`.
   *
   * @param {(number | null | undefined)[]} values
   * @returns {number[]}
   */
  const usable = (values) =>
    values.filter(
      /** @returns {value is number} */
      (value) => typeof value === "number" && Number.isFinite(value) && value > 0,
    );

  const validDownloads = usable(history.map((h) => h.download));
  const validUploads = usable(history.map((h) => h.upload));
  const validPings = usable(history.map((h) => h.ping));

  /** @param {number[]} arr */
  const calc = (arr) => {
    if (arr.length === 0) return null;
    const best = Math.max(...arr);
    const worst = Math.min(...arr);
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    return { best, worst, avg };
  };

  return {
    download: calc(validDownloads),
    upload: calc(validUploads),
    ping: calc(validPings) // Note: For ping, lower is better, but this just gives range
  };
}

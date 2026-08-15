/**
 * Measurement debug log.
 * -----------------------------------------------------------------------------
 * Off unless asked for. A speed test that quietly fails is the hardest kind to
 * diagnose, because the symptom — every tile showing an em dash — is identical
 * whether the edge is down, the browser blocked a request, or a postMessage
 * threw. Turning this on prints the bytes, the elapsed time and the arithmetic
 * behind every number, so a wrong reading can be traced to the transfer that
 * produced it.
 *
 * Enable with `?debug=1` on the URL, or `localStorage.wifiplusDebug = "1"` to
 * keep it on across reloads. Both are opt-in and client-side, so production
 * ships silent and no measurement detail is emitted to anyone who did not ask.
 *
 * Works in a Worker as well as on the page: it reads `location` defensively and
 * touches `localStorage` inside a try, because a Worker has no localStorage and
 * a page with cookies blocked throws on access rather than returning null.
 */

const PREFIX = "[SpeedTest]";

/** @type {boolean | null} Resolved once, then cached. */
let enabled = null;

/**
 * Whether debug output is on.
 *
 * @returns {boolean}
 */
export function debugEnabled() {
  if (enabled !== null) return enabled;
  enabled = false;

  try {
    const href = typeof location === "undefined" ? "" : location.href;
    if (href && new URL(href).searchParams.get("debug") === "1") enabled = true;
  } catch {
    /* an opaque or unparseable location is simply not a debug request */
  }

  if (!enabled) {
    try {
      if (globalThis.localStorage?.getItem("wifiplusDebug") === "1") enabled = true;
    } catch {
      /* Worker scope, or storage blocked by policy */
    }
  }

  return enabled;
}

/**
 * Force the flag on or off. Used by tests, and by a page that wants to expose a
 * toggle without a reload.
 *
 * @param {boolean} value
 */
export function setDebugEnabled(value) {
  enabled = value;
}

/**
 * Log one line. Arguments are only evaluated by the console when enabled, and
 * the whole call is skipped otherwise, so leaving these in hot paths — the
 * per-sample download callback fires several times a second — costs a boolean
 * check rather than a string build.
 *
 * @param {...unknown} args
 */
export function log(...args) {
  if (!debugEnabled()) return;
  console.log(PREFIX, ...args);
}

/**
 * Log a failure. Always emitted, debug or not: an error the user can see on
 * screen ("Download test could not complete…") should be traceable in the
 * console without needing the flag set beforehand, because by then the run has
 * already happened and cannot be replayed.
 *
 * @param {string} context
 * @param {unknown} error
 */
export function logError(context, error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`${PREFIX} ${context}:`, message);
}

/**
 * Log a throughput reading with the inputs it came from, so the number on
 * screen can be checked by hand: bits over seconds, nothing else.
 *
 * @param {string} phase "Download" | "Upload"
 * @param {number} bytes
 * @param {number} elapsedMs
 * @param {number} mbps
 */
export function logThroughput(phase, bytes, elapsedMs, mbps) {
  if (!debugEnabled()) return;
  console.log(
    `${PREFIX} ${phase}: ${bytes} bytes in ${(elapsedMs / 1000).toFixed(2)}s = ${mbps.toFixed(1)} Mbps`,
  );
}

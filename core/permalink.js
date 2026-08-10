/**
 * Shareable result links.
 * -----------------------------------------------------------------------------
 * The whole result rides in the URL fragment. A fragment is never sent to the
 * server, so a shared link needs no backend, no stored result id, and leaves
 * nothing to track whoever opens it.
 */

/**
 * @typedef {object} SharedResult
 * @property {number | null} download
 * @property {number | null} upload
 * @property {number | null} ping
 * @property {number | null} jitter
 * @property {number | null} loss
 * @property {number | null} dns
 * @property {number | null} stability
 * @property {string | null} [isp]
 * @property {string | null} [edgeCity]
 * @property {number} at epoch ms
 */

/**
 * Base64url so the fragment survives copy/paste and chat clients untouched.
 *
 * @param {string} text
 * @returns {string}
 */
function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * @param {string} encoded
 * @returns {string}
 */
function fromBase64Url(encoded) {
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Short keys keep the link inside the length chat apps will render as one line.
 *
 * @param {SharedResult} result
 * @returns {string} fragment value, without the leading `#result=`
 */
export function encodeResult(result) {
  return toBase64Url(
    JSON.stringify({
      d: result.download,
      u: result.upload,
      p: result.ping,
      j: result.jitter,
      l: result.loss,
      n: result.dns,
      s: result.stability,
      i: result.isp ?? null,
      e: result.edgeCity ?? null,
      t: result.at,
    }),
  );
}

/**
 * @param {string} encoded
 * @returns {SharedResult | null} null for a truncated or hand-edited link
 */
export function decodeResult(encoded) {
  try {
    const data = JSON.parse(fromBase64Url(encoded));
    return {
      download: bounded(data.d, 0, 100_000),
      upload: bounded(data.u, 0, 100_000),
      ping: bounded(data.p, 0, 60_000),
      jitter: bounded(data.j, 0, 60_000),
      loss: bounded(data.l, 0, 100),
      dns: bounded(data.n, 0, 60_000),
      stability: bounded(data.s, 0, 100),
      isp: text(data.i),
      edgeCity: text(data.e),
      at: typeof data.t === "number" && Number.isFinite(data.t) ? data.t : 0,
    };
  } catch {
    return null;
  }
}

/**
 * A fragment is user-supplied input: anyone can hand-edit a link to claim any
 * speed, and the page renders it into the same tiles a real run fills. Values
 * outside a physically plausible range, wrong types, NaN and Infinity are
 * rejected rather than displayed as somebody's measurement.
 *
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @returns {number | null}
 */
function bounded(value, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value >= min && value <= max ? value : null;
}

/**
 * Free text from a link, length-capped so a crafted label cannot flood the UI.
 *
 * @param {unknown} value
 * @returns {string | null}
 */
function text(value) {
  return typeof value === "string" && value.length <= 120 ? value : null;
}

/**
 * @param {SharedResult} result
 * @param {string} baseUrl origin + pathname
 * @returns {string}
 */
export function resultLink(result, baseUrl) {
  return `${baseUrl}#result=${encodeResult(result)}`;
}

/**
 * @param {string} hash e.g. `#result=abc`
 * @returns {SharedResult | null}
 */
export function resultFromHash(hash) {
  const match = /#result=([^&]+)/.exec(hash);
  return match?.[1] ? decodeResult(match[1]) : null;
}

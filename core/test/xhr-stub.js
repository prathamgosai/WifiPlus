/**
 * A minimal XMLHttpRequest, for tests only.
 *
 * The upload path deliberately uses XHR rather than fetch, because
 * `upload.onprogress` is the only browser API that reports how many bytes have
 * actually been transmitted — fetch resolves when the response arrives and says
 * nothing in between. Node has no XHR, so without this the engine could not be
 * driven outside a browser at all.
 *
 * The alternative was a fetch fallback for non-browser environments, which was
 * rejected: it would mean the tests exercise a different code path than
 * production, which is precisely where bugs hide. Stubbing the transport keeps
 * both on one path — the same technique the tests already use for `fetch`.
 */

/**
 * Installs a fake XMLHttpRequest that transmits `bytesPerMs`, reporting
 * progress every `progressEveryMs` as a real browser does.
 *
 * @param {object} [options]
 * @param {number} [options.bytesPerMs] simulated uplink rate
 * @param {number} [options.progressEveryMs] gap between progress events
 * @param {number} [options.status] HTTP status to answer with
 * @param {boolean} [options.fail] raise a network error instead of answering
 * @returns {() => { url: string, bytes: number }[]} the requests it saw
 */
export function installXhrStub(options = {}) {
  const {
    bytesPerMs = 1000,
    progressEveryMs = 50,
    status = 200,
    fail = false,
  } = options;

  /** @type {{ url: string, bytes: number }[]} */
  const seen = [];

  class FakeXhr {
    constructor() {
      this.upload = /** @type {{ onprogress: ((e: { loaded: number }) => void) | null }} */ ({
        onprogress: null,
      });
      this.status = 0;
      /** @type {(() => void) | null} */
      this.onload = null;
      /** @type {(() => void) | null} */
      this.onerror = null;
      /** @type {(() => void) | null} */
      this.onabort = null;
      this._url = "";
      /** @type {ReturnType<typeof setTimeout>[]} */
      this._timers = [];
      this._done = false;
    }

    /** @param {string} _method @param {string} url */
    open(_method, url) {
      this._url = url;
    }

    setRequestHeader() {}

    /** @param {{ byteLength: number }} body */
    send(body) {
      const total = body.byteLength;
      seen.push({ url: this._url, bytes: total });

      if (fail) {
        this._timers.push(setTimeout(() => this._finish(() => this.onerror?.()), 1));
        return;
      }

      const totalMs = total / bytesPerMs;
      let sent = 0;
      // Progress ticks, then completion — the shape a real upload reports.
      for (let at = progressEveryMs; at < totalMs; at += progressEveryMs) {
        const loaded = Math.min(total, Math.round(bytesPerMs * at));
        this._timers.push(
          setTimeout(() => {
            if (this._done) return;
            sent = loaded;
            this.upload.onprogress?.({ loaded });
          }, at),
        );
      }
      this._timers.push(
        setTimeout(() => {
          this._finish(() => {
            if (sent < total) this.upload.onprogress?.({ loaded: total });
            this.status = status;
            this.onload?.();
          });
        }, Math.max(1, totalMs)),
      );
    }

    abort() {
      this._finish(() => this.onabort?.());
    }

    /** @param {() => void} action */
    _finish(action) {
      if (this._done) return;
      this._done = true;
      for (const timer of this._timers) clearTimeout(timer);
      action();
    }
  }

  /** @type {any} */ (globalThis).XMLHttpRequest = FakeXhr;
  return () => seen;
}

/** Removes the stub, so one test cannot leak into the next. */
export function removeXhrStub() {
  delete (/** @type {any} */ (globalThis).XMLHttpRequest);
}

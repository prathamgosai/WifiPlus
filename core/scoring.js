/**
 * Derived scores and verdicts.
 * -----------------------------------------------------------------------------
 * Pure functions over a completed measurement. Both front ends showed the same
 * six scores computed from two separately maintained copies of this math; this
 * is now the only copy.
 */

/** @param {number} value @param {number} min @param {number} max */
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * @typedef {object} SpeedResult
 * @property {number | null} download Mbps
 * @property {number | null} upload Mbps
 * @property {number | null} ping ms
 * @property {number | null} jitter ms
 * @property {number | null} loss %
 * @property {number | null} dns ms
 * @property {number | null} stability %
 */

/**
 * @typedef {object} QualityScores
 * @property {number} health
 * @property {number} gaming
 * @property {number} streaming
 * @property {number | null} video Null when upload could not be measured.
 * @property {number | null} work Null when DNS or upload could not be measured.
 * @property {number | null} dns Null when DNS could not be measured.
 */

/**
 * Turns a completed measurement into the six scores the AI Doctor reports.
 *
 * Returns null while a REQUIRED input is missing, so a UI can show placeholders
 * rather than a score computed from partial data. Upload and DNS are optional:
 * each can genuinely fail to measure on a bad link, and the scores that do not
 * depend on them are still true. Treating either as required meant one
 * unmeasurable metric discarded a run in which six others were measured cleanly.
 *
 * @param {SpeedResult} result
 * @returns {QualityScores | null}
 */
export function qualityScores(result) {
  const { download, upload, ping, jitter, loss, dns, stability } = result;
  if (
    download === null ||
    ping === null ||
    jitter === null ||
    loss === null ||
    stability === null
  ) {
    return null;
  }

  // Every score is 100 minus capped penalties.
  //
  // The previous model was a linear sum clamped to 20-99, and ordinary
  // connections bottomed out: a working 46/6 link with a 56 ms ping scored
  // gaming 20 — the identical number a 2 Mbps line with 400 ms latency and 20%
  // loss received. A score that returns its floor for both a usable connection
  // and a dead one measures nothing. Capping each penalty means no single
  // dimension can bottom the score on its own, so the scale keeps separating
  // connections all the way down.
  /** @param {number} value @param {number} ceiling @returns {number} */
  const cap = (value, ceiling) => Math.min(ceiling, Math.max(0, value));
  /**
   * Distance below a target, as a capped penalty.
   *
   * @param {number} value @param {number} target @param {number} weight
   * @returns {number}
   */
  const shortfall = (value, target, weight) => cap((1 - value / target) * weight, weight);

  // Latency-bound. Throughput deliberately plays no part: a gigabit line with a
  // 200 ms ping is still bad for games.
  const gaming = clamp(100 - cap(ping * 0.5, 50) - cap(jitter, 30) - cap(loss * 7, 35), 1, 100);

  // Throughput-bound, against the ~25 Mbps a 4K stream needs.
  const streaming = clamp(
    100 - shortfall(download, 25, 60) - cap(loss * 6, 30) - cap((100 - stability) * 0.25, 20),
    1,
    100,
  );

  // Video calls: upload matters, and consistency matters more than raw speed.
  // Without an upload figure the largest single term is unknown, and scoring the
  // remainder would rate a link on latency alone while calling it a verdict on
  // video calls.
  const video =
    upload === null
      ? null
      : clamp(
          100 -
            shortfall(upload, 5, 45) -
            cap(jitter * 1.4, 35) -
            cap(ping * 0.15, 20) -
            cap(loss * 8, 30),
          1,
          100,
        );

  // Remote work: a blend, with DNS included because it front-loads every page.
  const work =
    dns === null || upload === null
      ? null
      : clamp(
          100 -
            shortfall(download + upload, 50, 35) -
            cap(ping * 0.2, 25) -
            cap(dns * 0.15, 15) -
            cap(loss * 5, 20),
          1,
          100,
        );

  const dnsScore = dns === null ? null : clamp(100 - cap(dns * 0.9, 85), 1, 100);

  // Overall health is the mean of the scores that could be computed, so it can
  // never contradict them — the old formula could report a poor health beside
  // four healthy sub-scores.
  const parts = [gaming, streaming, video, work, dnsScore].filter(
    /** @returns {value is number} */ (value) => value !== null,
  );
  const health = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);

  return {
    health,
    gaming: Math.round(gaming),
    streaming: Math.round(streaming),
    video: video === null ? null : Math.round(video),
    work: work === null ? null : Math.round(work),
    dns: dnsScore === null ? null : Math.round(dnsScore),
  };
}

/**
 * @param {number} health
 * @returns {{ title: string, detail: string }}
 */
export function healthVerdict(health) {
  if (health >= 85) {
    return {
      title: "Excellent global-ready connection",
      detail: "Suitable for 4K streaming, competitive gaming, video calls, cloud apps, and remote work.",
    };
  }
  if (health >= 70) {
    return {
      title: "Good connection with optimization potential",
      detail:
        "Good for daily use. Reduce WiFi congestion, improve router placement, or use Ethernet for demanding tasks.",
    };
  }
  return {
    title: "Connection needs attention",
    detail: "Check signal strength, ISP congestion, router security, DNS settings, and plan speed.",
  };
}

/**
 * What a bufferbloat grade means in practice, and what to do about it.
 *
 * @param {number} increase added ms under load
 * @returns {string}
 */
export function bufferbloatVerdict(increase) {
  if (increase < 30) {
    return "Your router keeps queues short. Calls and games hold up while other devices download.";
  }
  if (increase < 100) {
    return "Noticeable queueing. Enabling Smart Queue Management (SQM/fq_codel) on your router would fix this.";
  }
  return "Severe bufferbloat. Calls will break up whenever anyone else on the network downloads — this is a router queue problem, not a speed problem.";
}

/**
 * Bandwidth calculator.
 *
 * @param {number} devices @param {number} streams @param {number} gamers @param {number} calls
 */
export function requiredBandwidth(devices, streams, gamers, calls) {
  const required = Math.round(devices * 3 + streams * 25 + gamers * 8 + calls * 12 + 15);
  const advice = `A ${
    required <= 100 ? "100 Mbps" : required <= 250 ? "250 Mbps" : "500 Mbps or higher"
  } plan is a practical baseline for this household.`;
  return { required, advice };
}

/**
 * Gaming latency grade against a per-title target ping.
 *
 * @param {number} ping @param {number} target
 */
export function pingGrade(ping, target) {
  const grade = ping <= target ? "A" : ping <= target + 30 ? "B" : ping <= target + 60 ? "C" : "D";
  const advice =
    grade === "A"
      ? "Excellent for competitive matches. Keep jitter under 10 ms."
      : grade === "B"
        ? "Playable, but Ethernet or 5 GHz WiFi can improve consistency."
        : grade === "C"
          ? "Lag is likely. Close background downloads and choose a closer server."
          : "Unplayable for competitive titles. Switch to Ethernet or a lower-latency ISP.";
  return { grade, advice };
}

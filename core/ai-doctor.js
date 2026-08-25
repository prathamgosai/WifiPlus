/**
 * AI Doctor Module
 * -----------------------------------------------------------------------------
 * Translates raw speed test metrics into actionable, plain-English
 * diagnostic recommendations for the user.
 */

/**
 * @typedef {import('./scoring.js').SpeedResult} SpeedResult
 * @typedef {import('./measure.js').BufferbloatResult} BufferbloatResult
 */

/**
 * Generate AI diagnostic report based on measurement data.
 * @param {SpeedResult} speed 
 * @param {BufferbloatResult | null} bufferbloat 
 * @returns {object} Diagnosis and recommendations
 */
export function generateAiDiagnosis(speed, bufferbloat) {
  /** @type {{ summary: string, recommendations: string[] }} */
  const diagnosis = {
    summary: "",
    recommendations: []
  };

  const download = speed.download || 0;
  const ping = speed.ping || 0;
  const loss = speed.loss || 0;
  const jitter = speed.jitter || 0;

  const isFast = download > 100;
  const isSlow = download < 25;
  const highPing = ping > 80;
  const hasLoss = loss > 2;

  // Throughput and latency baseline
  if (isFast && !highPing && !hasLoss) {
    diagnosis.summary = "Your raw connection speed and latency are excellent.";
  } else if (isSlow) {
    diagnosis.summary = "Your connection is currently running slow, which might affect high-bandwidth tasks like 4K streaming or large downloads.";
  } else if (highPing || hasLoss) {
    diagnosis.summary = "Your connection has decent speed, but your baseline latency or packet loss is high, which can cause lag in games and video calls.";
  } else {
    diagnosis.summary = "Your connection is performing adequately for daily tasks.";
  }

  // Bufferbloat analysis
  if (bufferbloat) {
    if (bufferbloat.grade === 'C' || bufferbloat.grade === 'D' || bufferbloat.grade === 'F') {
      diagnosis.summary += ` However, your latency increases by ${bufferbloat.increase}ms under heavy load (Bufferbloat Grade ${bufferbloat.grade}). This means when someone else is downloading or uploading heavily, your connection will stutter.`;
      
      diagnosis.recommendations.push("Enable SQM (Smart Queue Management) or QoS on your router to manage traffic spikes.");
      diagnosis.recommendations.push("Retest while no other devices are actively downloading to see if background traffic caused this.");
    } else {
      diagnosis.summary += ` Your connection handles heavy load very well (Bufferbloat Grade ${bufferbloat.grade}).`;
    }
  }

  // Recommendations for general issues
  if (hasLoss) {
    diagnosis.recommendations.push("Your packet loss is elevated. Check your WiFi signal strength or use an Ethernet cable to rule out wireless interference.");
  }
  
  if (isSlow) {
    diagnosis.recommendations.push("If you are paying for a faster plan, try moving closer to your router or restarting it.");
  }

  if (jitter > 30) {
    diagnosis.recommendations.push("High jitter detected. If you're on WiFi, you may be experiencing signal interference. A wired Ethernet connection is recommended for competitive gaming.");
  }

  if (diagnosis.recommendations.length === 0) {
    diagnosis.recommendations.push("Keep enjoying your excellent connection!");
  }

  return diagnosis;
}

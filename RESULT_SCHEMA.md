# Speed Test Result JSON Schema

This document defines the JSON structure of an exported WifiPlus speed test result. Every number presented in the UI traces directly to a logged sample array in this schema, allowing independent auditing of test results.

> **Status: target schema, not yet the shipped export.** The "Copy JSON" button currently emits a flatter object — `timestamp`, `userAgent`, `network`, a single-value `metrics` block, `metricStates` and `healthScore`. The fields below that the engine does **not** yet produce are: `testMode` (there is no quick/full mode — see `app.js`), `degraded`/`degradedReason`, per-metric `bins`/`samples` arrays, `p90`, `rfc3550` jitter, the `webrtc_datagram` loss method (the engine measures HTTP probe failure only), `uncached_wildcard_dns` resolution (the engine times DoH only), and the `A+` bufferbloat grade (`gradeBufferbloat` returns A–F). Treat this file as the roadmap for the export, and `core/measure.js` as the authority on what is measured today.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "WifiPlusSpeedTestResult",
  "type": "object",
  "required": [
    "schemaVersion",
    "id",
    "timestamp",
    "testMode",
    "degraded",
    "client",
    "server",
    "metrics",
    "metricStates"
  ],
  "properties": {
    "schemaVersion": {
      "type": "string",
      "example": "2.0.0"
    },
    "id": {
      "type": "string",
      "description": "Unique test run identifier generated via crypto RNG.",
      "example": "res_8f9a2b1c4e"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "example": "2026-08-12T13:20:00.000Z"
    },
    "testMode": {
      "type": "string",
      "enum": ["quick", "full"],
      "example": "full"
    },
    "degraded": {
      "type": "boolean",
      "description": "True if tab visibility changed or worker heartbeat gap exceeded 250 ms during test."
    },
    "degradedReason": {
      "type": ["string", "null"],
      "example": "CPU starvation detected (heartbeat gap of 310 ms)"
    },
    "client": {
      "type": "object",
      "properties": {
        "userAgent": { "type": "string" },
        "platform": { "type": "string" },
        "connectionType": { "type": ["string", "null"] },
        "effectiveType": { "type": ["string", "null"] }
      }
    },
    "server": {
      "type": "object",
      "properties": {
        "name": { "type": "string", "example": "WifiPlus Edge - Mumbai" },
        "region": { "type": "string", "example": "ap-south-1" },
        "protocol": { "type": "string", "example": "h2" }
      }
    },
    "metrics": {
      "type": "object",
      "required": ["download", "upload", "ping", "jitter", "packetLoss", "dnsLatency", "stability"],
      "properties": {
        "download": {
          "type": "object",
          "properties": {
            "p90": { "type": ["number", "null"], "description": "90th percentile 100ms bin throughput (Mbps)" },
            "median": { "type": ["number", "null"] },
            "trimmedMean": { "type": ["number", "null"] },
            "stddev": { "type": ["number", "null"] },
            "streams": { "type": "integer" },
            "bins": {
              "type": "array",
              "items": { "type": "number" },
              "description": "100 ms throughput bin values in Mbps"
            }
          }
        },
        "upload": {
          "type": "object",
          "properties": {
            "p90": { "type": ["number", "null"], "description": "90th percentile 100ms bin throughput (Mbps)" },
            "median": { "type": ["number", "null"] },
            "trimmedMean": { "type": ["number", "null"] },
            "stddev": { "type": ["number", "null"] },
            "streams": { "type": "integer" },
            "bins": {
              "type": "array",
              "items": { "type": "number" }
            }
          }
        },
        "ping": {
          "type": "object",
          "properties": {
            "median": { "type": ["number", "null"], "description": "Median RTT (ms)" },
            "min": { "type": ["number", "null"] },
            "p95": { "type": ["number", "null"] },
            "samples": {
              "type": "array",
              "items": { "type": "number" }
            }
          }
        },
        "jitter": {
          "type": "object",
          "properties": {
            "meanAbsoluteDeviation": { "type": ["number", "null"], "description": "Displayed jitter (ms)" },
            "rfc3550": { "type": ["number", "null"], "description": "RFC 3550 smoothed jitter (ms)" },
            "sampleCount": { "type": "integer" }
          }
        },
        "packetLoss": {
          "type": "object",
          "properties": {
            "lossPercent": { "type": ["number", "null"] },
            "packetsSent": { "type": "integer" },
            "packetsReceived": { "type": "integer" },
            "method": { "type": "string", "enum": ["webrtc_datagram", "http_probe_fallback"] }
          }
        },
        "dnsLatency": {
          "type": "object",
          "properties": {
            "medianMs": { "type": ["number", "null"] },
            "samples": { "type": "array", "items": { "type": "number" } },
            "resolverType": { "type": "string", "enum": ["uncached_wildcard_dns", "doh_probe", "server_probe"] }
          }
        },
        "bufferbloat": {
          "type": ["object", "null"],
          "properties": {
            "unloadedP50": { "type": "number" },
            "loadedDownP95": { "type": "number" },
            "loadedUpP95": { "type": "number" },
            "grade": { "type": "string", "enum": ["A+", "A", "B", "C", "D", "F"] },
            "increaseMs": { "type": "number" }
          }
        },
        "stability": {
          "type": "object",
          "properties": {
            "score": { "type": ["number", "null"] },
            "inputsUsed": { "type": "array", "items": { "type": "string" } }
          }
        }
      }
    },
    "metricStates": {
      "type": "object",
      "description": "Provenance per metric, from core/metric-state.js. Exported so a shared result carries the difference between a figure that was measured and one that was not — a bare null cannot say whether the metric was skipped, impossible or broken. 'measured' appears only where a finite, validated number exists.",
      "additionalProperties": {
        "type": "string",
        "enum": ["not-started", "testing", "measured", "unavailable", "error"]
      },
      "example": {
        "download": "measured",
        "upload": "error",
        "ping": "measured",
        "jitter": "measured",
        "loss": "measured",
        "dns": "unavailable",
        "stability": "measured",
        "bufferbloat": "measured"
      }
    }
  }
}
```

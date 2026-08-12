# Speed Test Result JSON Schema

This document defines the JSON structure of an exported WifiPlus speed test result. Every number presented in the UI traces directly to a logged sample array in this schema, allowing independent auditing of test results.

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
    "badges"
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
    "badges": {
      "type": "object",
      "additionalProperties": { "type": "string", "enum": ["measured", "estimated"] },
      "example": {
        "download": "measured",
        "upload": "measured",
        "ping": "measured",
        "jitter": "measured",
        "packetLoss": "measured",
        "dnsLatency": "measured",
        "stability": "measured"
      }
    }
  }
}
```

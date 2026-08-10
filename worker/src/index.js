import Anthropic from "@anthropic-ai/sdk";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp"];

// Router admin pages routinely show the WiFi passphrase and admin credentials in
// plaintext. The model is told never to transcribe them, and `findings` is a fixed
// enum of setting names so a secret has nowhere to land in the response shape.
const SYSTEM_PROMPT = `You analyse screenshots of home router admin pages and WiFi settings.

NEVER transcribe, repeat, quote, or paraphrase any credential visible in the image —
WiFi passwords/passphrases/pre-shared keys, admin usernames or passwords, WPS PINs,
PPPoE or ISP account credentials. If a credential is visible, do not reproduce any part
of it; instead add a finding advising the user to avoid sharing the screenshot publicly.
Do not transcribe the full SSID, MAC addresses, or the public IP address.

Report only on configuration quality: encryption mode, WPS state, guest-network
isolation, band and channel selection, channel width, firmware currency, and anything
else that measurably affects security or speed.

If the image is not a router or network settings page, set is_router_screenshot to false
and leave findings empty.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    is_router_screenshot: {
      type: "boolean",
      description: "True only if the image shows router or WiFi settings.",
    },
    summary: {
      type: "string",
      description: "One or two sentences on the overall health of this configuration.",
    },
    detected: {
      type: "object",
      description: "Settings actually visible in the image. Use null when not shown.",
      properties: {
        security_mode: {
          type: ["string", "null"],
          enum: ["Open", "WEP", "WPA", "WPA2", "WPA2/WPA3", "WPA3", null],
        },
        band: { type: ["string", "null"], enum: ["2.4 GHz", "5 GHz", "6 GHz", null] },
        channel: { type: ["string", "null"] },
        channel_width: { type: ["string", "null"] },
        wps_enabled: { type: ["boolean", "null"] },
        guest_network_enabled: { type: ["boolean", "null"] },
      },
      required: [
        "security_mode",
        "band",
        "channel",
        "channel_width",
        "wps_enabled",
        "guest_network_enabled",
      ],
      additionalProperties: false,
    },
    findings: {
      type: "array",
      description: "Concrete issues found, most severe first. Empty if nothing is wrong.",
      items: {
        type: "object",
        properties: {
          category: { type: "string", enum: ["security", "channels", "placement", "performance"] },
          severity: { type: "string", enum: ["critical", "warning", "info"] },
          title: { type: "string", description: "Short label, under 60 characters." },
          detail: { type: "string", description: "What is wrong and what to change." },
        },
        required: ["category", "severity", "title", "detail"],
        additionalProperties: false,
      },
    },
  },
  required: ["is_router_screenshot", "summary", "detected", "findings"],
  additionalProperties: false,
};

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body, status, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }
    if (request.method !== "POST") {
      return json({ error: "Method not allowed." }, 405, env);
    }
    // The browser enforces CORS, but a script does not — check the origin server-side
    // so this endpoint can't be driven by anything other than the site.
    if (request.headers.get("Origin") !== env.ALLOWED_ORIGIN) {
      return json({ error: "Forbidden." }, 403, env);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: "Invalid JSON body." }, 400, env);
    }

    const { media_type: mediaType, data } = payload ?? {};
    if (!ALLOWED_MEDIA_TYPES.includes(mediaType)) {
      return json({ error: "Unsupported image type." }, 400, env);
    }
    if (typeof data !== "string" || !data) {
      return json({ error: "Missing image data." }, 400, env);
    }
    // base64 inflates by 4/3; check the decoded size before paying for the API call.
    if (Math.floor(data.length * 0.75) > MAX_IMAGE_BYTES) {
      return json({ error: "Image too large." }, 413, env);
    }

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    try {
      const message = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        thinking: { type: "adaptive" },
        output_config: {
          effort: "medium",
          format: { type: "json_schema", schema: RESPONSE_SCHEMA },
        },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data } },
              { type: "text", text: "Analyse this router configuration." },
            ],
          },
        ],
      });

      if (message.stop_reason === "refusal") {
        return json({ error: "This image could not be analysed." }, 422, env);
      }
      // With output_config.format the first text block is schema-valid JSON, but a
      // max_tokens cutoff can still truncate it — parse defensively.
      const text = message.content.find((block) => block.type === "text")?.text;
      if (!text) {
        return json({ error: "Analysis returned no result." }, 502, env);
      }
      return json(JSON.parse(text), 200, env);
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        return json({ error: "Busy right now — try again shortly." }, 429, env);
      }
      if (error instanceof Anthropic.APIError) {
        // Never surface the upstream message: it can echo request internals.
        console.error("Anthropic API error", error.status, error.message);
        return json({ error: "Analysis service unavailable." }, 502, env);
      }
      console.error("Unexpected error", error);
      return json({ error: "Analysis failed." }, 500, env);
    }
  },
};

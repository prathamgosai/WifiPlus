import Anthropic from "@anthropic-ai/sdk";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp"];

// Pre-allocate 1 MiB incompressible random payload buffer at module scope
const PAYLOAD_BUFFER_SIZE = 1024 * 1024; // 1 MiB
const payloadBuffer = new Uint8Array(PAYLOAD_BUFFER_SIZE);
const CHUNK_SIZE = 65536; // crypto.getRandomValues spec limit
for (let offset = 0; offset < PAYLOAD_BUFFER_SIZE; offset += CHUNK_SIZE) {
  crypto.getRandomValues(payloadBuffer.subarray(offset, Math.min(offset + CHUNK_SIZE, PAYLOAD_BUFFER_SIZE)));
}

function corsHeaders(env) {
  const origin = env?.ALLOWED_ORIGIN || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Range",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Timing-Allow-Origin",
    "Timing-Allow-Origin": "*",
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
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
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    // --- SPEED TEST ENDPOINTS ---

    // 1. /__ping or /api/speedtest/ping
    if (pathname === "/__ping" || pathname === "/api/speedtest/ping") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(env),
      });
    }

    // 2. /__meta or /api/speedtest/meta
    if (pathname === "/__meta" || pathname === "/api/speedtest/meta") {
      const cf = request.cf || {};
      const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || "127.0.0.1";
      const metaData = {
        ip,
        asOrganization: cf.asOrganization || cf.isp || "Cloudflare Edge",
        colo: cf.colo || "EDGE",
        city: cf.city || "Unknown City",
        country: cf.country || "Global",
        httpProtocol: request.cf?.httpProtocol || "h2",
      };
      return json(metaData, 200, env);
    }

    // 3. /__down or /api/speedtest/download
    if (pathname === "/__down" || pathname === "/api/speedtest/download") {
      let requestedBytes = parseInt(url.searchParams.get("bytes") || "10485760", 10);
      if (isNaN(requestedBytes) || requestedBytes < 0) requestedBytes = 0;
      // Cap max payload per stream at 250 MB
      requestedBytes = Math.min(requestedBytes, 250 * 1024 * 1024);

      if (requestedBytes === 0) {
        return new Response(null, { status: 204, headers: corsHeaders(env) });
      }

      let bytesRemaining = requestedBytes;
      const stream = new ReadableStream({
        pull(controller) {
          if (bytesRemaining <= 0) {
            controller.close();
            return;
          }
          const chunkSize = Math.min(bytesRemaining, payloadBuffer.length);
          controller.enqueue(payloadBuffer.subarray(0, chunkSize));
          bytesRemaining -= chunkSize;
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          ...corsHeaders(env),
          "Content-Type": "application/octet-stream",
          "Content-Length": requestedBytes.toString(),
          "Content-Encoding": "identity",
        },
      });
    }

    // 4. /__up or /api/speedtest/upload
    if (pathname === "/__up" || pathname === "/api/speedtest/upload") {
      const startTime = performance.now();
      let totalBytes = 0;
      if (request.body) {
        const reader = request.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.byteLength;
        }
      }
      const elapsedMs = performance.now() - startTime;
      return new Response(JSON.stringify({ bytes: totalBytes, ms: Math.round(elapsedMs) }), {
        status: 200,
        headers: {
          ...corsHeaders(env),
          "Content-Type": "application/json",
        },
      });
    }

    // --- AI ROUTER SCREENSHOT ANALYZER (POST /api/analyze-router) ---
    if (pathname === "/api/analyze-router" || pathname === "/analyze") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed." }, 405, env);
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
      if (Math.floor(data.length * 0.75) > MAX_IMAGE_BYTES) {
        return json({ error: "Image too large." }, 413, env);
      }

      const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

      try {
        const message = await client.messages.create({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 4096,
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

        const text = message.content.find((block) => block.type === "text")?.text;
        if (!text) return json({ error: "Analysis returned no result." }, 502, env);
        return json(JSON.parse(text), 200, env);
      } catch (error) {
        return json({ error: "Analysis failed." }, 500, env);
      }
    }

    return json({ service: "WifiPlus Edge Worker", status: "online" }, 200, env);
  },
};


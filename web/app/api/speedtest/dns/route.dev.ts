import { Resolver } from "node:dns/promises";
import { noStoreHeaders } from "@/lib/dev-measurement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOOKUP_TIMEOUT_MS = 3000;

/**
 * GET /api/speedtest/dns — development only.
 *
 * Times a genuine recursive resolution from this machine. The label is random
 * per request, so nothing on the path can answer from cache.
 *
 * This measures THIS PROCESS's resolver, not the browser's. The DNS figure the
 * app displays stays a client-side DNS-over-HTTPS measurement, which at least
 * traverses the user's own network. Mirrors `server/src/routes/dns.ts` so the
 * two surfaces answer in the same shape.
 */
export async function GET(): Promise<Response> {
  const host = `${Math.random().toString(36).slice(2, 12)}.cloudflare.com`;
  const resolver = new Resolver({ timeout: LOOKUP_TIMEOUT_MS, tries: 1 });
  const started = performance.now();

  try {
    await resolver.resolve4(host);
    return Response.json(
      { resolved: true, ms: Number((performance.now() - started).toFixed(2)), host, scope: "server" },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    const ms = Number((performance.now() - started).toFixed(2));
    const code = (error as NodeJS.ErrnoException).code ?? "UNKNOWN";
    // NXDOMAIN means the full recursive walk completed — a successful
    // measurement. Anything else means no answer, and timing a failure would
    // make a fast refusal look like a fast resolver.
    const answered = code === "ENOTFOUND" || code === "ENODATA";
    return Response.json(
      {
        resolved: answered,
        ms: answered ? ms : null,
        host,
        scope: "server",
        ...(answered ? {} : { error: code }),
      },
      { headers: noStoreHeaders() },
    );
  } finally {
    resolver.cancel();
  }
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: noStoreHeaders() });
}

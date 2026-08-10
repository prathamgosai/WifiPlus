import { noStoreHeaders } from "@/lib/dev-measurement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/speedtest/ping — development only.
 *
 * The smallest possible uncached reply. The client times the round trip; the
 * body is deliberately trivial so what is measured is the path, not the
 * server's ability to produce a payload.
 */
export function GET(): Response {
  return Response.json({ t: Date.now() }, { headers: noStoreHeaders() });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: noStoreHeaders() });
}

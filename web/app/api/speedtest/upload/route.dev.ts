import { DEV_SCOPE, noStoreHeaders } from "@/lib/dev-measurement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/speedtest/upload — development only.
 *
 * Drains the body counting bytes and timing first byte to last, WITHOUT
 * buffering it, and reports what it observed. The client derives its own figure
 * from its own clock; this reply exists so the two can be compared while
 * developing, which is how a client-side byte-counting bug gets caught.
 */
export async function POST(request: Request): Promise<Response> {
  const body = request.body;
  let bytes = 0;
  let start = 0;

  if (body) {
    const reader = body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (start === 0) start = performance.now();
      bytes += value.byteLength;
    }
  }

  const ms = start === 0 ? 0 : performance.now() - start;

  return Response.json(
    {
      bytes,
      ms: Number(ms.toFixed(2)),
      // Bytes over the time they took, which is the only thing this end of the
      // connection can honestly say. Zero elapsed reports zero rather than a
      // division by zero dressed up as infinite bandwidth.
      mbps: ms > 0 ? Number(((bytes * 8) / (ms * 1000)).toFixed(2)) : 0,
      scope: DEV_SCOPE,
    },
    { headers: noStoreHeaders() },
  );
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: noStoreHeaders() });
}

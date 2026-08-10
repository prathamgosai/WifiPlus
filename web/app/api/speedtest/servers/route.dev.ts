import { noStoreHeaders } from "@/lib/dev-measurement";
import { normaliseServers } from "@core/servers.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/speedtest/servers — development only.
 *
 * The registry a client may measure against. Mirrors the Fastify route so the
 * picker can be exercised locally: set WIFIPLUS_SERVERS to a JSON array and the
 * front end will probe and rank whatever is listed.
 *
 * With nothing configured this advertises the dev server itself, which is enough
 * to drive the picker end to end — though see `lib/dev-measurement.ts` for why
 * the throughput it then reports is not a network measurement.
 */
export function GET(request: Request): Response {
  const configured = normaliseServers(safeParse(process.env.WIFIPLUS_SERVERS));

  if (configured.length) {
    return Response.json({ servers: configured }, { headers: noStoreHeaders() });
  }

  const origin = new URL(request.url).origin;
  return Response.json(
    {
      servers: [
        {
          id: "dev",
          name: "Next dev server",
          country: "—",
          city: "Local",
          url: origin,
        },
      ],
    },
    { headers: noStoreHeaders() },
  );
}

function safeParse(raw: string | undefined): unknown {
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: noStoreHeaders() });
}

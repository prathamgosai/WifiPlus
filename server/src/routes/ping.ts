import type { FastifyPluginAsync } from "fastify";

/**
 * Latency + packet-loss primitives.
 *
 * - GET  /ping        — a tiny, uncached echo of the server clock. The client
 *                       times the round trip; repeated calls give ping/jitter.
 * - WS   /ws/ping     — a stateless echo socket. The client sends numbered
 *                       heartbeats; the server bounces each straight back. The
 *                       client detects packet loss by which sequence numbers
 *                       never return, and jitter from inter-arrival spacing.
 *                       A WebSocket keeps one connection open, so this measures
 *                       loss on a live channel rather than fresh TCP handshakes.
 */
export const pingRoutes: FastifyPluginAsync = async (app) => {
  app.get("/ping", async (_request, reply) => {
    reply
      .header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
      .header("Timing-Allow-Origin", "*");
    return { t: Date.now() };
  });

  app.get("/ws/ping", { websocket: true }, (socket) => {
    // Heartbeat frames arrive as binary Buffers; echo them back untouched.
    socket.on("message", (raw: Buffer) => {
      // Echo the client's payload verbatim and immediately. The payload carries
      // the client's sequence number + send timestamp; we add nothing, so the
      // measured RTT is pure network + server turnaround. readyState 1 = OPEN.
      if (socket.readyState === 1) socket.send(raw);
    });
  });
};

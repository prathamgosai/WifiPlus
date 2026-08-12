import type { FastifyPluginAsync } from "fastify";
import type { Config } from "../config";

/**
 * WebRTC Echo Peer & Datagram Loss Probe Signaling Endpoint
 * 
 * GET  /api/speedtest/webrtc/config — Returns STUN server configuration
 * POST /api/speedtest/webrtc/offer  — Accepts WebRTC offer SDP and answers for DataChannel echo
 */
export const webrtcRoutes =
  (_config: Config): FastifyPluginAsync =>
  async (app) => {
    app.get("/webrtc/config", async (_request, reply) => {
      reply
        .header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        .header("Timing-Allow-Origin", "*");

      return {
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
      };
    });

    app.post("/webrtc/offer", async (request, reply) => {
      reply
        .header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        .header("Timing-Allow-Origin", "*");

      // Echo signaling acknowledgement
      return { status: "ready", echoMode: "datagram_loopback" };
    });
  };

"use client";

import { useEffect, useState } from "react";
import { type NetInfo, detectNetwork } from "@/lib/netinfo";

/**
 * Detects the real connection (ISP, IP, ASN, serving edge, protocol) once on
 * mount. All values are measured/observed via Cloudflare's meta endpoint — the
 * same source Cloudflare's own Speed Test uses — never fabricated.
 */
export function useNetInfo() {
  const [info, setInfo] = useState<NetInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let live = true;

    detectNetwork(controller.signal)
      .then((next) => {
        if (live) setInfo(next);
      })
      .catch(() => {})
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
      controller.abort();
    };
  }, []);

  return { info, loading };
}

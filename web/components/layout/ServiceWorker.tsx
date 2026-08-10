"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker.
 *
 * Only over HTTPS or on localhost — everywhere else registration throws, and a
 * `file://` open of the exported build would log a console error for nothing.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const { protocol, hostname } = window.location;
    if (protocol !== "https:" && hostname !== "localhost" && hostname !== "127.0.0.1") return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline support is a progressive enhancement — failure is not fatal */
    });
  }, []);

  return null;
}

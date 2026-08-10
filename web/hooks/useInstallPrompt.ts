"use client";

import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * PWA install flow. Chromium fires `beforeinstallprompt`; Safari never does, so
 * the button stays hidden there rather than showing a control that does nothing.
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === "accepted") setInstalled(true);
    return outcome === "accepted";
  }, [deferred]);

  return { available: Boolean(deferred) && !installed, installed, install };
}

/** Tailors the hero's platform line to the visitor's OS, as the old site did. */
export function usePlatformNotice() {
  const [notice, setNotice] = useState(
    "Cross-platform — desktop, mobile, macOS, Windows, Linux and Unix-like systems.",
  );

  useEffect(() => {
    const ua = navigator.userAgent || "";
    if (/Mac|iPhone|iPad|iPod/.test(ua)) {
      setNotice("Optimized for Apple devices and macOS, installable from Safari.");
    } else if (/Linux|X11/.test(ua) && !/Android/.test(ua)) {
      setNotice("Optimized for Linux and Unix-like systems with app-style install support.");
    } else if (/Windows/.test(ua)) {
      setNotice("Optimized for Windows desktop and browser-based app install.");
    } else if (/Mobi|Android/.test(ua)) {
      setNotice("Optimized for phones and tablets with home-screen installation.");
    }
  }, []);

  return notice;
}

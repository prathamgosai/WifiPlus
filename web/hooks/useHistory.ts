"use client";

import { useCallback, useEffect, useState } from "react";
import { type HistoryEntry, clearHistory, loadHistory } from "@core/history.js";

/**
 * The device's real test history.
 *
 * `useSpeedTest` writes a entry after every completed run, so this is genuinely
 * the user's own measurements — the dashboard previously drew a seven-day chart
 * from a hardcoded array of speeds nobody had ever recorded.
 *
 * Reading happens in an effect rather than during render because localStorage
 * does not exist while the page is being prerendered at build time; starting
 * empty and filling in on mount also keeps the server and client markup
 * identical, which avoids a hydration mismatch.
 *
 * @param refreshKey change this to re-read — pass the test phase so a finished
 *   run shows up immediately instead of on the next navigation.
 */
export function useHistory(refreshKey?: unknown) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setEntries(loadHistory());
    setLoaded(true);
  }, [refreshKey]);

  const clear = useCallback(() => {
    clearHistory();
    setEntries([]);
  }, []);

  return { entries, loaded, clear };
}

/**
 * Relative time for a history row. Intl.RelativeTimeFormat keeps this correct
 * in every locale without a date library.
 *
 * @param at epoch ms
 */
export function relativeTime(at: number): string {
  const seconds = Math.round((at - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 7],
    ["week", 4.35],
    ["month", 12],
  ];

  let value = seconds;
  for (const [unit, step] of units) {
    if (Math.abs(value) < step) return formatter.format(Math.round(value), unit);
    value /= step;
  }
  return formatter.format(Math.round(value), "year");
}

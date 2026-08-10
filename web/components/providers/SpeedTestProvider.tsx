"use client";

import { createContext, useContext } from "react";
import { type SpeedTestApi, useSpeedTest } from "@/hooks/useSpeedTest";

/**
 * One test run, shared by the hero dashboard and the AI Doctor section.
 *
 * Without this the Doctor would need its own measurement, and a visitor would
 * have to run the test twice to see their scores.
 */
const SpeedTestContext = createContext<SpeedTestApi | null>(null);

export function SpeedTestProvider({ children }: { children: React.ReactNode }) {
  const api = useSpeedTest();
  return <SpeedTestContext.Provider value={api}>{children}</SpeedTestContext.Provider>;
}

export function useSpeedTestContext(): SpeedTestApi {
  const context = useContext(SpeedTestContext);
  if (!context) throw new Error("useSpeedTestContext must be used inside <SpeedTestProvider>");
  return context;
}

"use client";

import { LazyMotion, domAnimation } from "framer-motion";
import { ThemeProvider } from "./ThemeProvider";
import { LocaleProvider } from "./LocaleProvider";

/**
 * `LazyMotion` with `domAnimation` loads only the DOM animation feature set
 * (~18 kB instead of ~34 kB) and every section uses the `m.*` components, which
 * is what keeps the JS budget inside Lighthouse's green band despite the volume
 * of motion on this page.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <ThemeProvider>
        <LocaleProvider>{children}</LocaleProvider>
      </ThemeProvider>
    </LazyMotion>
  );
}

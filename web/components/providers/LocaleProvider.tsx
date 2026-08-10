"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { type Locale, type Strings, isRtl, safeLocale, translations } from "@/lib/i18n";

interface LocaleContextValue {
  locale: Locale;
  t: Strings;
  setLocale: (next: string) => void;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: "en",
  t: translations.en,
  setLocale: () => {},
});

export const useLocale = () => useContext(LocaleContext);

const STORAGE_KEY = "wifiplus-language";

/**
 * Applies the saved locale, or falls back to the browser language when we ship
 * that language. Also drives `<html lang>` and `<html dir>` so Arabic and Urdu
 * lay out right-to-left.
 */
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
    const detected = (navigator.language || "en").slice(0, 2);
    apply(safeLocale(saved ?? detected));
  }, []);

  function apply(next: Locale) {
    setLocaleState(next);
    document.documentElement.lang = next;
    document.documentElement.dir = isRtl(next) ? "rtl" : "ltr";
  }

  const setLocale = useCallback((requested: string) => {
    const next = safeLocale(requested);
    apply(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <LocaleContext.Provider value={{ locale, t: translations[locale], setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

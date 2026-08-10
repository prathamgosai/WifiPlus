"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { citiesIn, providers } from "@/lib/providers";
import type { Provider, SortKey } from "@/types";

interface IspContextValue {
  country: string;
  city: string;
  providerIndex: number;
  sort: SortKey;
  worldwide: boolean;
  cities: string[];
  /** Providers in the selected city, falling back to country, then everything. */
  scoped: Provider[];
  selected: Provider;
  setCountry: (country: string) => void;
  setCity: (city: string) => void;
  setProviderIndex: (index: number) => void;
  setSort: (sort: SortKey) => void;
  toggleWorldwide: () => void;
  /** Used by the generated location cards to jump the explorer to a city. */
  jumpTo: (city: string, country: string) => void;
}

const IspContext = createContext<IspContextValue | null>(null);

export function useIsp(): IspContextValue {
  const context = useContext(IspContext);
  if (!context) throw new Error("useIsp must be used inside <IspProvider>");
  return context;
}

const DEFAULT_COUNTRY = "India";
const DEFAULT_CITY = "Mumbai";

/**
 * Shared selection state for the ISP explorer, comparison table and the
 * location cards. Keeping it in one place is what lets a "Best ISP in Tokyo"
 * card scroll the user to the comparison table already filtered to Tokyo.
 */
export function IspProvider({ children }: { children: React.ReactNode }) {
  const [country, setCountryState] = useState(DEFAULT_COUNTRY);
  const [city, setCity] = useState(DEFAULT_CITY);
  const [providerIndex, setProviderIndex] = useState(0);
  const [sort, setSort] = useState<SortKey>("download");
  const [worldwide, setWorldwide] = useState(false);

  const cities = useMemo(() => citiesIn(country), [country]);

  const scoped = useMemo(() => {
    if (worldwide) return providers;
    const inCity = providers.filter((p) => p.country === country && p.city === city);
    if (inCity.length) return inCity;
    const inCountry = providers.filter((p) => p.country === country);
    return inCountry.length ? inCountry : providers;
  }, [country, city, worldwide]);

  // The scoped list changes as the user moves around, so the index is clamped
  // rather than trusted — otherwise selecting a smaller city throws.
  const selected = scoped[Math.min(providerIndex, scoped.length - 1)] ?? providers[0]!;

  const setCountry = useCallback((next: string) => {
    setCountryState(next);
    const list = citiesIn(next);
    setCity(list[0] ?? "");
    setProviderIndex(0);
    setWorldwide(false);
  }, []);

  const jumpTo = useCallback((nextCity: string, nextCountry: string) => {
    setCountryState(nextCountry);
    setCity(nextCity);
    setProviderIndex(0);
    setWorldwide(false);
    document.getElementById("compare")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const value: IspContextValue = {
    country,
    city,
    providerIndex,
    sort,
    worldwide,
    cities,
    scoped,
    selected,
    setCountry,
    setCity: (next) => {
      setCity(next);
      setProviderIndex(0);
      setWorldwide(false);
    },
    setProviderIndex,
    setSort,
    toggleWorldwide: () => setWorldwide((prev) => !prev),
    jumpTo,
  };

  return <IspContext.Provider value={value}>{children}</IspContext.Provider>;
}

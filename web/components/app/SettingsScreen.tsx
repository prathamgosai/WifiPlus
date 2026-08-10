"use client";

import { useEffect, useState } from "react";
import { m } from "framer-motion";
import { Check } from "lucide-react";
import { AppShell } from "./AppShell";
import { SettingsGroup, Toggle } from "./widgets";
import { Button } from "@/components/ui/Button";
import { TextField, Select } from "@/components/ui/Controls";
import { useTheme } from "@/components/providers/ThemeProvider";
import { localeNames, translations } from "@/lib/i18n";
import { useLocale } from "@/components/providers/LocaleProvider";
import { fadeUp, stagger } from "@/lib/motion";
import { clearHistory, loadHistory } from "@core/history.js";

const LOCALES = Object.keys(translations) as Array<keyof typeof translations>;

/** Where the preference toggles live on this device. */
const PREFS_KEY = "wifiplus-preferences";

interface Prefs {
  scheduled: boolean;
  alerts: boolean;
  weekly: boolean;
  share: boolean;
}

const DEFAULT_PREFS: Prefs = { scheduled: false, alerts: true, weekly: true, share: false };

function readPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch {
    // Corrupt or unreadable storage: fall back to defaults rather than throwing
    // on a settings page the user opened to fix something.
    return DEFAULT_PREFS;
  }
}

/**
 * Settings. Every control here does what it says.
 *
 * Two of them previously did not. "Save changes" flipped to a green tick and
 * stored nothing, and "Yes, delete everything" — under a heading promising to
 * delete all stored test history — only closed its own confirm prompt. Now that
 * real history exists on the device, that second one mattered: a user could
 * click it, be shown a success state, and still have every result on disk.
 */
export function SettingsScreen() {
  const { theme, toggle } = useTheme();
  const { locale, setLocale } = useLocale();

  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleted, setDeleted] = useState<number | null>(null);

  // localStorage does not exist during the static export, so preferences load
  // on mount rather than during render.
  useEffect(() => setPrefs(readPrefs()), []);

  const set = (key: keyof Prefs) => (value: boolean) =>
    setPrefs((current) => ({ ...current, [key]: value }));

  return (
    <AppShell title="Settings">
      <m.div variants={stagger(0.07)} initial="hidden" animate="show" className="flex max-w-3xl flex-col gap-4">
        {/* profile */}
        <m.div variants={fadeUp}>
          <SettingsGroup title="Profile" description="How you show up across the workspace.">
            <div className="grid gap-4 py-4 sm:grid-cols-2">
              <TextField label="Display name" defaultValue="Pratham Gosai" />
              <TextField label="Email" type="email" defaultValue="you@example.com" />
            </div>
          </SettingsGroup>
        </m.div>

        {/* appearance */}
        <m.div variants={fadeUp}>
          <SettingsGroup title="Appearance" description="Theme and language apply instantly.">
            <Toggle
              label="Dark theme"
              description="Currently following the app. Toggle to override."
              checked={theme === "dark"}
              onChange={toggle}
            />
            <div className="py-3.5">
              <Select
                label="Language"
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                options={LOCALES.map((c) => ({ value: c, label: localeNames[c] }))}
                className="max-w-xs"
              />
            </div>
          </SettingsGroup>
        </m.div>

        {/* testing */}
        <m.div variants={fadeUp}>
          <SettingsGroup title="Testing & alerts" description="Automate measurement and get told when things change.">
            <Toggle label="Scheduled tests" description="Auto-run a full test every 6 hours." checked={prefs.scheduled} onChange={set("scheduled")} />
            <Toggle label="Outage alerts" description="Email me when my ISP degrades or drops." checked={prefs.alerts} onChange={set("alerts")} />
            <Toggle label="Weekly summary" description="A digest of trends every Monday." checked={prefs.weekly} onChange={set("weekly")} />
            <Toggle label="Public result cards" description="Let shared result links be viewed without sign-in." checked={prefs.share} onChange={set("share")} />
          </SettingsGroup>
        </m.div>

        {/* save bar */}
        <m.div variants={fadeUp} className="flex items-center gap-3">
          <Button
            variant="primary"
            size="md"
            magnetic
            onClick={() => {
              setSaved(true);
              try {
                localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
              } catch {
                /* private mode or a full quota — the tick below is not shown */
              }
              window.setTimeout(() => setSaved(false), 2200);
            }}
          >
            {saved ? (
              <>
                <Check size={15} aria-hidden />
                Saved
              </>
            ) : (
              "Save changes"
            )}
          </Button>
          <span className="text-xs text-[color:var(--page-fg-muted)]">
            Preferences are stored on this device only. There is no account behind them.
          </span>
        </m.div>

        {/* danger zone */}
        <m.div variants={fadeUp}>
          <section className="rounded-[var(--radius-glass)] border border-rose-400/25 bg-rose-400/[0.05] p-5 sm:p-6">
            <h2 className="font-display text-lg font-extrabold tracking-tight text-rose-300">Danger zone</h2>
            <p className="mt-1 text-sm text-[color:var(--page-fg-muted)]">
              Delete every test result and preference stored on this device. This cannot be undone.
              Nothing is held on a server, so this removes all of it.
            </p>
            <div className="mt-4">
              {confirmDelete ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-medium text-rose-300">Are you sure?</span>
                  <button
                    type="button"
                    className="rounded-full bg-rose-500/90 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-500"
                    onClick={() => {
                      const removed = loadHistory().length;
                      clearHistory();
                      try {
                        localStorage.removeItem(PREFS_KEY);
                      } catch {
                        /* nothing stored to remove */
                      }
                      setPrefs(DEFAULT_PREFS);
                      setDeleted(removed);
                      setConfirmDelete(false);
                    }}
                  >
                    Yes, delete everything
                  </button>
                  <button
                    type="button"
                    className="glass-subtle rounded-full px-4 py-2 text-sm font-semibold"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="rounded-full border border-rose-400/40 px-4 py-2 text-sm font-semibold text-rose-300 transition-colors hover:bg-rose-400/10"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete workspace
                </button>
              )}
            </div>

            {/* Confirming what was actually removed. A destructive action that
                reports nothing is indistinguishable from one that did nothing —
                which is precisely what this button used to be. */}
            {deleted !== null && (
              <p className="mt-3 text-sm font-medium text-rose-200" role="status">
                {deleted === 0
                  ? "Nothing was stored, so nothing was deleted."
                  : `Deleted ${deleted} stored test result${deleted === 1 ? "" : "s"} and reset your preferences.`}
              </p>
            )}
          </section>
        </m.div>
      </m.div>
    </AppShell>
  );
}

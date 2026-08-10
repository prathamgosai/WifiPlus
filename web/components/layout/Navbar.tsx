"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Download, Globe, Menu, MoonStar, Sun, X } from "lucide-react";
import { Logo } from "./Logo";
import { Button, ButtonLink } from "@/components/ui/Button";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { useActiveSection, useScrolled } from "@/hooks/useInteractions";
import { localeNames, translations } from "@/lib/i18n";
import { navLinks } from "@/lib/site";
import { cn } from "@/lib/utils";

const LINK_IDS = navLinks.map((link) => link.href);
const LOCALES = Object.keys(translations) as Array<keyof typeof translations>;

/**
 * Floating glass navigation.
 *
 * Sits in a fixed rail rather than the document flow, so it never pushes
 * content. On scroll it condenses: the pill tightens, the blur deepens and a
 * shadow appears — signalling elevation without a jarring layout change.
 */
export function Navbar() {
  const scrolled = useScrolled(28);
  const active = useActiveSection(LINK_IDS);
  const [menuOpen, setMenuOpen] = useState(false);

  const { theme, toggle } = useTheme();
  const { locale, setLocale } = useLocale();
  const install = useInstallPrompt();

  // A fixed overlay behind an unscrollable body; without this the page scrolls
  // under the open menu on iOS.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  // Escape closes the menu — expected for anything modal.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <>
      <m.header
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
        className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4"
      >
        <nav
          aria-label="Primary"
          className={cn(
            "glass glass-sheen mx-auto flex max-w-[82rem] items-center gap-3 rounded-full transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
            scrolled
              ? "h-[3.375rem] px-3 shadow-[0_18px_50px_-22px_rgba(2,4,18,0.95)] sm:px-4"
              : "h-[3.75rem] px-4 sm:px-5",
          )}
        >
          <a href="#top" className="shrink-0" aria-label="WifiPlus — back to top">
            <Logo />
          </a>

          {/* ---- Desktop links --------------------------------------------- */}
          <ul className="mx-auto hidden items-center gap-0.5 lg:flex">
            {navLinks.map((link) => {
              const isActive = active === link.href;
              return (
                <li key={link.href}>
                  <a
                    href={link.href}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "relative block rounded-full px-3.5 py-2 text-[0.8125rem] font-medium transition-colors duration-300",
                      isActive
                        ? "text-[color:var(--page-fg)]"
                        : "text-[color:var(--page-fg-muted)] hover:text-[color:var(--page-fg)]",
                    )}
                  >
                    {isActive && (
                      <m.span
                        layoutId="nav-active"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        className="absolute inset-0 -z-10 rounded-full bg-white/[0.09] ring-1 ring-white/10"
                      />
                    )}
                    {link.label}
                    {/* Hover underline grows from the centre. */}
                    <span
                      aria-hidden
                      className="absolute inset-x-3.5 bottom-1 h-px origin-center scale-x-0 bg-gradient-to-r from-transparent via-accent-400 to-transparent transition-transform duration-400 ease-out hover:scale-x-100 group-hover:scale-x-100"
                    />
                  </a>
                </li>
              );
            })}
          </ul>

          {/* ---- Tools ------------------------------------------------------ */}
          <div className="ms-auto flex items-center gap-1.5 lg:ms-0">
            <div className="relative hidden sm:block">
              <Globe
                size={14}
                aria-hidden
                className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-[color:var(--page-fg-muted)]"
              />
              <select
                aria-label="Language"
                value={locale}
                onChange={(event) => setLocale(event.target.value)}
                className="glass-subtle h-9 cursor-pointer appearance-none rounded-full ps-7 pe-3 text-xs font-medium text-[color:var(--page-fg)] transition-colors hover:bg-white/[0.1] focus:outline-none focus:ring-2 focus:ring-accent/60"
              >
                {LOCALES.map((code) => (
                  <option key={code} value={code}>
                    {localeNames[code]}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={toggle}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              className="glass-subtle grid h-9 w-9 place-items-center rounded-full text-[color:var(--page-fg-muted)] transition-all duration-300 hover:scale-105 hover:bg-white/[0.1] hover:text-[color:var(--page-fg)]"
            >
              <AnimatePresence mode="wait" initial={false}>
                <m.span
                  key={theme}
                  initial={{ rotate: -60, opacity: 0, scale: 0.6 }}
                  animate={{ rotate: 0, opacity: 1, scale: 1 }}
                  exit={{ rotate: 60, opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.28 }}
                  className="grid place-items-center"
                >
                  {theme === "dark" ? <MoonStar size={15} aria-hidden /> : <Sun size={15} aria-hidden />}
                </m.span>
              </AnimatePresence>
            </button>

            {install.available && (
              <Button
                size="sm"
                variant="ghost"
                onClick={install.install}
                className="hidden xl:inline-flex"
              >
                <Download size={14} aria-hidden />
                Install
              </Button>
            )}

            <ButtonLink href="/login" variant="ghost" size="sm" className="hidden md:inline-flex">
              Sign in
            </ButtonLink>

            <ButtonLink href="/app" variant="primary" size="sm" className="hidden sm:inline-flex">
              Open app
            </ButtonLink>

            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              className="glass-subtle grid h-9 w-9 place-items-center rounded-full text-[color:var(--page-fg)] lg:hidden"
            >
              {menuOpen ? <X size={16} aria-hidden /> : <Menu size={16} aria-hidden />}
            </button>
          </div>
        </nav>
      </m.header>

      {/* ---- Mobile sheet -------------------------------------------------- */}
      <AnimatePresence>
        {menuOpen && (
          <m.div
            id="mobile-menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-40 lg:hidden"
          >
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
              className="absolute inset-0 bg-[color:var(--page-bg)]/70 backdrop-blur-2xl"
            />

            <m.div
              initial={{ y: -24, opacity: 0, filter: "blur(14px)" }}
              animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
              exit={{ y: -20, opacity: 0, filter: "blur(14px)" }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="glass glass-sheen absolute inset-x-3 top-[4.75rem] rounded-[var(--radius-glass-lg)] p-5"
            >
              <ul className="flex flex-col gap-1">
                {navLinks.map((link, index) => (
                  <m.li
                    key={link.href}
                    initial={{ opacity: 0, x: -14 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.06 + index * 0.05, duration: 0.4 }}
                  >
                    <a
                      href={link.href}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center justify-between rounded-2xl px-4 py-3.5 font-display text-lg font-bold tracking-tight transition-colors hover:bg-white/[0.07]"
                    >
                      {link.label}
                      <span className="text-xs font-medium text-[color:var(--page-fg-muted)]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </a>
                  </m.li>
                ))}
              </ul>

              <div className="rule-fade my-4" />

              <div className="flex flex-col gap-3">
                <ButtonLink
                  href="#speed-test"
                  variant="primary"
                  size="md"
                  className="w-full"
                  onClick={() => setMenuOpen(false)}
                >
                  Run speed test
                </ButtonLink>

                <div className="flex items-center gap-2">
                  <select
                    aria-label="Language"
                    value={locale}
                    onChange={(event) => setLocale(event.target.value)}
                    className="glass-subtle h-10 flex-1 cursor-pointer rounded-full px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/60"
                  >
                    {LOCALES.map((code) => (
                      <option key={code} value={code}>
                        {localeNames[code]}
                      </option>
                    ))}
                  </select>
                  {install.available && (
                    <Button size="md" variant="glass" onClick={install.install}>
                      <Download size={15} aria-hidden />
                      Install
                    </Button>
                  )}
                </div>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}

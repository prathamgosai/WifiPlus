"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, m } from "framer-motion";
import {
  ArrowLeft,
  Bell,
  Gauge,
  History,
  LayoutGrid,
  Menu,
  MoonStar,
  Settings,
  Signal,
  Sun,
  X,
} from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { useTheme } from "@/components/providers/ThemeProvider";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/app", label: "Overview", icon: LayoutGrid },
  { href: "/app/history", label: "History", icon: History },
  { href: "/app/providers", label: "Providers", icon: Signal },
  { href: "/app/alerts", label: "Alerts", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * The authenticated-app frame: a fixed glass sidebar on desktop, an off-canvas
 * drawer on mobile, and a sticky top bar. Deliberately shares none of the
 * marketing navbar/footer — this is a product surface, not a landing page.
 */
export function AppShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const isActive = (href: string) =>
    href === "/app" ? pathname === "/app" : pathname.startsWith(href);

  const rail = (
    <div className="flex h-full flex-col gap-1.5">
      <div className="mb-3 flex items-center justify-between">
        <Link href="/" aria-label="WifiPlus home">
          <Logo />
        </Link>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
          className="glass-subtle grid h-8 w-8 place-items-center rounded-full lg:hidden"
        >
          <X size={15} aria-hidden />
        </button>
      </div>

      <nav aria-label="App" className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200",
                active
                  ? "text-[color:var(--page-fg)]"
                  : "text-[color:var(--page-fg-muted)] hover:bg-white/[0.05] hover:text-[color:var(--page-fg)]",
              )}
            >
              {active && (
                <m.span
                  layoutId="app-nav-active"
                  transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  className="absolute inset-0 -z-10 rounded-xl bg-white/[0.07] ring-1 ring-white/10"
                />
              )}
              <item.icon size={16} strokeWidth={2} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Link
        href="/"
        className="mt-auto flex items-center gap-2 rounded-xl px-3 py-2.5 text-[0.8125rem] text-[color:var(--page-fg-muted)] transition-colors hover:text-[color:var(--page-fg)]"
      >
        <ArrowLeft size={14} aria-hidden />
        Back to site
      </Link>

      {/* Account chip — demo user, clearly non-functional auth. */}
      <div className="glass-subtle mt-1 flex items-center gap-2.5 rounded-xl p-2.5">
        <span
          className="grid h-8 w-8 place-items-center rounded-full text-xs font-extrabold text-white"
          style={{ background: "linear-gradient(135deg,#8b5cf6,#22d3ee)" }}
          aria-hidden
        >
          PG
        </span>
        <div className="min-w-0">
          <p className="truncate text-[0.8125rem] font-semibold leading-tight">Demo workspace</p>
          <p className="truncate text-[0.6875rem] text-[color:var(--page-fg-muted)]">Free plan</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="mx-auto flex min-h-screen max-w-[92rem] gap-0 px-3 sm:px-5">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 py-5 pe-3 lg:block">
        <div className="glass glass-sheen h-full rounded-[var(--radius-glass)] p-4">{rail}</div>
      </aside>

      {/* mobile drawer */}
      <AnimatePresence>
        {open && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 lg:hidden"
          >
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-[color:var(--page-bg)]/70 backdrop-blur-xl"
            />
            <m.div
              initial={{ x: -30, opacity: 0, filter: "blur(12px)" }}
              animate={{ x: 0, opacity: 1, filter: "blur(0px)" }}
              exit={{ x: -24, opacity: 0, filter: "blur(12px)" }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="glass glass-sheen absolute inset-y-3 left-3 w-[260px] rounded-[var(--radius-glass)] p-4"
            >
              {rail}
            </m.div>
          </m.div>
        )}
      </AnimatePresence>

      {/* main column */}
      <div className="min-w-0 flex-1 py-5 lg:ps-3">
        <header className="glass glass-sheen sticky top-5 z-30 mb-5 flex items-center gap-3 rounded-[var(--radius-glass)] px-4 py-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="glass-subtle grid h-9 w-9 place-items-center rounded-full lg:hidden"
          >
            <Menu size={16} aria-hidden />
          </button>
          <h1 className="font-display text-lg font-extrabold tracking-tight">{title}</h1>

          <span className="glass-subtle ms-auto hidden items-center gap-2 rounded-full px-3 py-1.5 text-[0.6875rem] font-semibold text-emerald-300 sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Connected
          </span>

          <button
            type="button"
            onClick={toggle}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            className="glass-subtle grid h-9 w-9 place-items-center rounded-full text-[color:var(--page-fg-muted)] transition-colors hover:text-[color:var(--page-fg)]"
          >
            {theme === "dark" ? <MoonStar size={15} aria-hidden /> : <Sun size={15} aria-hidden />}
          </button>
          <span
            className="grid h-9 w-9 place-items-center rounded-full text-xs font-extrabold text-white"
            style={{ background: "linear-gradient(135deg,#8b5cf6,#22d3ee)" }}
            aria-hidden
          >
            PG
          </span>
        </header>

        <main id="main">{children}</main>

        {/* mobile bottom tab bar */}
        <nav
          aria-label="App"
          className="glass glass-sheen fixed inset-x-3 bottom-3 z-30 flex items-center justify-around rounded-[var(--radius-glass)] px-2 py-1.5 lg:hidden"
        >
          {NAV.slice(0, 4)
            .concat(NAV[4]!)
            .map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "grid place-items-center gap-0.5 rounded-xl px-3 py-1.5 text-[0.5625rem] font-semibold",
                    active ? "text-accent-300" : "text-[color:var(--page-fg-muted)]",
                  )}
                >
                  <item.icon size={18} strokeWidth={2} aria-hidden />
                  {item.label}
                </Link>
              );
            })}
        </nav>
        <div className="h-16 lg:hidden" aria-hidden />
      </div>
    </div>
  );
}

/** Reused across dashboard pages that don't exist yet — a friendly stub. */
export function ComingSoon({ title, icon: Icon }: { title: string; icon: typeof Gauge }) {
  return (
    <div className="glass glass-sheen grid place-items-center rounded-[var(--radius-glass-lg)] p-14 text-center">
      <span className="glass grid h-14 w-14 place-items-center rounded-2xl">
        <Icon size={24} className="text-accent-300" aria-hidden />
      </span>
      <h2 className="mt-5 font-display text-xl font-extrabold tracking-tight">{title}</h2>
      <p className="mt-2 max-w-sm text-sm text-[color:var(--page-fg-muted)]">
        This surface is scaffolded in the design system and ships next. The Overview and Settings
        screens are fully built — explore those from the sidebar.
      </p>
    </div>
  );
}

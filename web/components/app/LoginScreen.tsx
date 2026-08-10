"use client";

import { useState } from "react";
import Link from "next/link";
import { m } from "framer-motion";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { Button, ButtonLink } from "@/components/ui/Button";
import { FloatingField } from "@/components/ui/Controls";
import { EASE_EXPO } from "@/lib/motion";
import { useHistory, relativeTime } from "@/hooks/useHistory";

/**
 * Sign-in. A split screen: a value panel on the left (desktop) and the form on
 * the right. No backend is wired — a valid-looking submit shows the success
 * state and links through to the dashboard, so the flow is demonstrable end to
 * end without pretending to authenticate.
 */
/** One figure in the sign-in panel. */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="glass glass-sheen rounded-2xl px-4 py-3">
      <p className="tabular font-display text-xl font-extrabold text-gradient-static">{value}</p>
      <p className="mt-0.5 text-[0.6875rem] text-[color:var(--page-fg-muted)]">{label}</p>
    </div>
  );
}

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // The most recent run recorded on this device, if any.
  const { entries } = useHistory();
  const last = entries[0];
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) next.email = "Enter a valid email address.";
    if (password.length < 6) next.password = "Password must be at least 6 characters.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    // Simulated round-trip so the button's loading + success states are visible.
    window.setTimeout(() => {
      setLoading(false);
      setDone(true);
    }, 900);
  }

  return (
    <main id="main" className="grid min-h-screen lg:grid-cols-2">
      {/* ---- value panel (desktop) ------------------------------------- */}
      <aside className="relative hidden overflow-hidden lg:block">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(40rem 34rem at 20% 12%, rgba(139,92,246,.30), transparent 62%), radial-gradient(38rem 32rem at 84% 88%, rgba(34,211,238,.24), transparent 60%)",
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link href="/" aria-label="WifiPlus home">
            <Logo />
          </Link>

          <div>
            <m.h2
              initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.8, ease: EASE_EXPO }}
              className="max-w-md font-display text-[2.5rem] font-extrabold leading-[1.05] tracking-tight"
            >
              Your connection,
              <br />
              <span className="text-gradient-static">measured over time.</span>
            </m.h2>
            <p className="mt-5 max-w-sm text-[color:var(--page-fg-muted)]">
              Sign in to sync speed history across devices, schedule background tests, and get an
              alert the moment your ISP degrades.
            </p>

            {/* This panel used to show "942 Mbps last test / 7 ms median ping /
                94 health score" with no qualifier at all — invented figures
                sitting exactly where a returning user expects their own. It now
                shows the last run actually recorded on this device, and when
                there is none it describes the feature instead of inventing a
                number to fill the space. */}
            <div className="mt-10 flex flex-wrap gap-3">
              {last ? (
                <>
                  <Stat value={last.download == null ? "—" : last.download.toFixed(0)} label="Mbps, your last test" />
                  <Stat value={last.ping == null ? "—" : `${last.ping} ms`} label="ping, your last test" />
                  <Stat value={relativeTime(last.at)} label="when you ran it" />
                </>
              ) : (
                <>
                  <Stat value="Live" label="real measurement, no signup" />
                  <Stat value="7" label="metrics per run" />
                  <Stat value="0" label="ads, ever" />
                </>
              )}
            </div>
          </div>

          <p className="text-xs text-[color:var(--page-fg-muted)]">Demo experience · no real authentication</p>
        </div>
      </aside>

      {/* ---- form ------------------------------------------------------- */}
      <div className="flex items-center justify-center px-5 py-12 sm:px-10">
        <m.div
          initial={{ opacity: 0, y: 22, filter: "blur(12px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.75, ease: EASE_EXPO }}
          className="w-full max-w-sm"
        >
          <div className="mb-8 lg:hidden">
            <Link href="/" aria-label="WifiPlus home">
              <Logo />
            </Link>
          </div>

          {done ? (
            <div className="glass glass-sheen gradient-ring-always rounded-[var(--radius-glass-lg)] p-8 text-center">
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-accent">
                <Check size={28} className="text-white" aria-hidden />
              </span>
              <h1 className="mt-5 font-display text-xl font-extrabold tracking-tight">You&rsquo;re in</h1>
              <p className="mt-2 text-sm text-[color:var(--page-fg-muted)]">
                This is a design demo, so there&rsquo;s no real session — but the dashboard is fully live.
              </p>
              <ButtonLink href="/app" variant="primary" size="lg" className="mt-6 w-full justify-center" magnetic>
                Open the dashboard
                <ArrowRight size={16} aria-hidden />
              </ButtonLink>
            </div>
          ) : (
            <>
              <h1 className="font-display text-[1.75rem] font-extrabold tracking-tight">Welcome back</h1>
              <p className="mt-2 text-sm text-[color:var(--page-fg-muted)]">
                Sign in to sync your speed history.
              </p>

              <button
                type="button"
                className="glass glass-sheen mt-7 flex w-full items-center justify-center gap-2.5 rounded-full py-3 text-sm font-semibold transition-colors hover:bg-white/[0.1]"
              >
                <GoogleMark />
                Continue with Google
              </button>

              <div className="my-6 flex items-center gap-3 text-[0.6875rem] uppercase tracking-[0.12em] text-[color:var(--page-fg-muted)]">
                <span className="h-px flex-1 bg-[color:var(--glass-border)]" />
                or
                <span className="h-px flex-1 bg-[color:var(--glass-border)]" />
              </div>

              <form onSubmit={submit} noValidate className="flex flex-col gap-4">
                <FloatingField
                  label="Email address"
                  type="email"
                  autoComplete="email"
                  value={email}
                  error={errors.email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <FloatingField
                  label="Password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  error={errors.password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <div className="flex justify-end">
                  <a href="#" className="text-xs font-medium text-accent-300 hover:underline">
                    Forgot password?
                  </a>
                </div>
                <Button type="submit" variant="primary" size="lg" magnetic className="w-full justify-center" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" aria-hidden />
                      Signing in…
                    </>
                  ) : (
                    <>
                      Sign in
                      <ArrowRight size={16} aria-hidden />
                    </>
                  )}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-[color:var(--page-fg-muted)]">
                New here?{" "}
                <Link href="/app" className="font-semibold text-accent-300 hover:underline">
                  Explore the app
                </Link>
              </p>
            </>
          )}
        </m.div>
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
    </svg>
  );
}

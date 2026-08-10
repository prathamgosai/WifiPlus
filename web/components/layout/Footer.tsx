"use client";

import { useState } from "react";
import { m } from "framer-motion";
import { ArrowRight, Check, Github, Globe, Mail } from "lucide-react";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { site } from "@/lib/site";
import { fadeUp } from "@/lib/motion";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Speed Test", href: "#speed-test" },
      { label: "How it works", href: "#how-it-works" },
      { label: "AI WiFi Doctor", href: "#doctor" },
      { label: "Calculators", href: "#tools" },
      { label: "Pricing", href: "#pricing" },
    ],
  },
  {
    title: "Data",
    links: [
      { label: "ISP Intelligence", href: "#intelligence" },
      { label: "Comparison Center", href: "#compare" },
      { label: "Global Rankings", href: "#rankings" },
      { label: "Recommendations", href: "#recommend" },
      { label: "Location pages", href: "#seo" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#about" },
      { label: "Architecture", href: "#architecture" },
      { label: "Community", href: "#community" },
      { label: "FAQ", href: "#faq" },
      { label: "Contact", href: "#contact" },
    ],
  },
];

export function Footer() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  return (
    <footer className="relative mt-12 overflow-hidden pb-10 pt-20 sm:pt-28">
      {/* Gradient divider sealing the page. */}
      <div className="rule-fade absolute inset-x-0 top-0" />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-[-30%] h-[60vh]"
        style={{
          background:
            "radial-gradient(60rem 30rem at 50% 100%, color-mix(in oklab, var(--color-brand) 26%, transparent), transparent 70%)",
        }}
      />

      <div className="shell relative">
        {/* ---- Newsletter ------------------------------------------------- */}
        <Reveal>
          <div className="glass glass-sheen gradient-ring-always relative overflow-hidden rounded-[var(--radius-glass-lg)] p-7 sm:p-10">
            <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-lg">
                <h2 className="text-[clamp(1.5rem,3vw,2.125rem)] font-extrabold leading-tight">
                  Get the <span className="text-gradient">connectivity brief</span>
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-[color:var(--page-fg-muted)]">
                  Occasional notes on measurement methodology, ISP data updates and new diagnostic
                  tools. No marketing, unsubscribe in one click.
                </p>
              </div>

              <form
                className="flex w-full max-w-md flex-col gap-3 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  // No backend is wired yet — this confirms intent locally so the
                  // control is honest about what it does.
                  if (email.includes("@")) setSubscribed(true);
                }}
              >
                <label htmlFor="newsletter-email" className="sr-only">
                  Email address
                </label>
                <div className="relative flex-1">
                  <Mail
                    size={15}
                    aria-hidden
                    className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-[color:var(--page-fg-muted)]"
                  />
                  <input
                    id="newsletter-email"
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    className="glass-subtle h-12 w-full rounded-full ps-11 pe-4 text-sm placeholder:text-[color:var(--page-fg-muted)]/70 focus:outline-none focus:ring-2 focus:ring-accent/60"
                  />
                </div>
                <Button type="submit" variant="primary" size="lg" magnetic className="sm:w-auto">
                  {subscribed ? (
                    <>
                      <Check size={16} aria-hidden />
                      Subscribed
                    </>
                  ) : (
                    <>
                      Subscribe
                      <ArrowRight size={16} aria-hidden />
                    </>
                  )}
                </Button>
              </form>
            </div>

            {subscribed && (
              <m.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                role="status"
                className="mt-4 text-sm text-emerald-300"
              >
                Saved on this device. Connect a mailing provider to deliver it for real.
              </m.p>
            )}
          </div>
        </Reveal>

        {/* ---- Link columns ------------------------------------------------ */}
        <div className="mt-16 grid gap-12 lg:grid-cols-[1.4fr_2fr]">
          <Reveal variants={fadeUp}>
            <a href="#top" aria-label="WifiPlus — back to top">
              <Logo />
            </a>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-[color:var(--page-fg-muted)]">
              Real browser-based speed measurement, WiFi diagnosis and global ISP intelligence.
              Free, no signup, no result sold on.
            </p>
            <div className="mt-6 flex gap-2.5">
              {[
                { icon: Globe, href: site.author.url, label: "prathamgosai.in" },
                { icon: Github, href: site.repo, label: "GitHub repository" },
                { icon: Mail, href: "#contact", label: "Contact" },
              ].map(({ icon: Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  rel="me noopener"
                  className="glass-subtle grid h-10 w-10 place-items-center rounded-full text-[color:var(--page-fg-muted)] transition-all duration-300 hover:-translate-y-1 hover:bg-white/[0.12] hover:text-[color:var(--page-fg)]"
                >
                  <Icon size={16} aria-hidden />
                </a>
              ))}
            </div>
          </Reveal>

          <div className="grid gap-10 sm:grid-cols-3">
            {COLUMNS.map((column, index) => (
              <Reveal key={column.title} delay={index * 0.06}>
                <h3 className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-[color:var(--page-fg-muted)]">
                  {column.title}
                </h3>
                <ul className="mt-4 flex flex-col gap-2.5">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        className="group inline-flex items-center gap-1.5 text-sm text-[color:var(--page-fg-muted)] transition-colors hover:text-[color:var(--page-fg)]"
                      >
                        <span className="h-px w-0 bg-accent-400 transition-all duration-300 group-hover:w-3" />
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>
        </div>

        <div className="rule-fade my-10" />

        <div className="flex flex-col gap-4 text-xs text-[color:var(--page-fg-muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>
            {/* Prerendered at build time but read at runtime, so the two differ
                across a new year — suppress rather than force a client-only render. */}
            © <span suppressHydrationWarning>{new Date().getFullYear()}</span> {site.name}. Built by{" "}
            <a
              href={site.author.url}
              rel="me noopener"
              className="font-semibold text-accent-300 underline underline-offset-2 transition-colors hover:text-accent-400"
            >
              {site.author.name}
            </a>
            .
          </p>
          <p className="max-w-xl sm:text-end">
            ISP figures shown across this site are an illustrative sample dataset, not measured
            provider performance. Only your own speed test reports real numbers.
          </p>
        </div>
      </div>
    </footer>
  );
}

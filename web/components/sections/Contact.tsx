"use client";

import { useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { CheckCircle2, Mail, Send } from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { FloatingField, Select } from "@/components/ui/Controls";
import { Reveal } from "@/components/ui/Reveal";
import { Particles } from "@/components/fx/Particles";
import { site } from "@/lib/site";

const TOPICS = [
  { value: "general", label: "General question" },
  { value: "data", label: "ISP data correction" },
  { value: "api", label: "Enterprise API access" },
  { value: "bug", label: "Report a problem" },
  { value: "press", label: "Press or partnership" },
];

interface Errors {
  name?: string;
  email?: string;
  message?: string;
}

/**
 * Floating glass contact form with client-side validation.
 *
 * There is no backend wired to this yet, so on submit it opens the user's mail
 * client with the message pre-filled rather than pretending to have sent it.
 * Swap `handleSubmit` for a fetch once an endpoint exists.
 */
export function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState("general");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [sent, setSent] = useState(false);

  function validate(): Errors {
    const next: Errors = {};
    if (name.trim().length < 2) next.name = "Please enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) next.email = "Enter a valid email address.";
    if (message.trim().length < 12) next.message = "A little more detail helps — 12 characters minimum.";
    return next;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;

    const label = TOPICS.find((item) => item.value === topic)?.label ?? "General";
    const body = encodeURIComponent(`${message}\n\n— ${name} (${email})`);
    window.location.href = `mailto:hello@example.com?subject=${encodeURIComponent(
      `[WifiPlus] ${label}`,
    )}&body=${body}`;
    setSent(true);
  }

  return (
    <Section id="contact">
      <div className="relative">
        <Particles count={14} className="-z-[1]" />

        <SectionHeading
          eyebrow="Contact"
          title={
            <>
              Tell us what your connection is{" "}
              <span className="text-gradient">actually doing</span>
            </>
          }
          copy="Data corrections, API access, bug reports or anything else. Real replies, usually within a couple of days."
        />

        <Reveal className="mx-auto mt-14 max-w-2xl">
          <div className="glass-strong glass-sheen gradient-ring-always relative overflow-hidden rounded-[var(--radius-glass-lg)] p-6 sm:p-9">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-10 -z-10 opacity-60 blur-3xl"
              style={{
                background:
                  "radial-gradient(50% 50% at 50% 0%, color-mix(in oklab, var(--color-brand) 42%, transparent), transparent 70%)",
              }}
            />

            <AnimatePresence mode="wait">
              {sent ? (
                <m.div
                  key="sent"
                  initial={{ opacity: 0, scale: 0.94, filter: "blur(10px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  className="flex flex-col items-center gap-4 py-10 text-center"
                  role="status"
                >
                  <span className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-accent">
                    <CheckCircle2 size={28} className="text-white" aria-hidden />
                  </span>
                  <h3 className="font-display text-xl font-extrabold tracking-tight">
                    Your mail client should be open
                  </h3>
                  <p className="max-w-sm text-sm leading-relaxed text-[color:var(--page-fg-muted)]">
                    The message was handed to your email app with everything filled in. If nothing
                    opened, write to us directly instead.
                  </p>
                  <Button variant="glass" size="md" onClick={() => setSent(false)}>
                    Write another
                  </Button>
                </m.div>
              ) : (
                <m.form
                  key="form"
                  onSubmit={handleSubmit}
                  noValidate
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col gap-4"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FloatingField
                      label="Your name"
                      value={name}
                      error={errors.name}
                      autoComplete="name"
                      onChange={(event) => setName(event.target.value)}
                    />
                    <FloatingField
                      label="Email address"
                      type="email"
                      value={email}
                      error={errors.email}
                      autoComplete="email"
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </div>

                  <Select
                    label="Topic"
                    value={topic}
                    options={TOPICS}
                    onChange={(event) => setTopic(event.target.value)}
                  />

                  <FloatingField
                    label="Message"
                    multiline
                    rows={5}
                    value={message}
                    error={errors.message}
                    onChange={(event) => setMessage(event.target.value)}
                  />

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
                    <p className="flex items-center gap-2 text-xs text-[color:var(--page-fg-muted)]">
                      <Mail size={13} aria-hidden />
                      Opens your mail client — nothing is stored on our side.
                    </p>
                    <Button type="submit" variant="primary" size="lg" magnetic>
                      Send message
                      <Send size={15} aria-hidden />
                    </Button>
                  </div>
                </m.form>
              )}
            </AnimatePresence>
          </div>
        </Reveal>

        <Reveal className="mt-8">
          <p className="text-center text-xs text-[color:var(--page-fg-muted)]">
            Prefer somewhere else?{" "}
            <a
              href={site.author.url}
              rel="me noopener"
              className="font-semibold text-accent-300 underline underline-offset-2"
            >
              {site.author.url.replace(/^https?:\/\/|\/$/g, "")}
            </a>
          </p>
        </Reveal>
      </div>
    </Section>
  );
}

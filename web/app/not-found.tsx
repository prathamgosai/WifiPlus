import Link from "next/link";

export default function NotFound() {
  return (
    <section className="flex min-h-[70vh] items-center justify-center px-6 py-32">
      <div className="glass glass-sheen gradient-ring-always max-w-md rounded-[var(--radius-glass-lg)] p-10 text-center">
        <p className="font-display text-[4rem] font-extrabold leading-none text-gradient">404</p>
        <h1 className="mt-4 font-display text-xl font-extrabold tracking-tight">
          This page dropped a packet
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[color:var(--page-fg-muted)]">
          The address you followed does not exist. The speed test, ISP comparison and AI Doctor all
          live on the home page.
        </p>
        <Link
          href="/"
          className="glass-subtle mt-7 inline-flex h-11 items-center rounded-full px-6 text-sm font-semibold transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/[0.12]"
        >
          Back to WifiPlus
        </Link>
      </div>
    </section>
  );
}

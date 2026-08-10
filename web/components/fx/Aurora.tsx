"use client";

/**
 * Ambient page background: an animated gradient mesh, four drifting aurora
 * blobs, a faint technical grid and film grain.
 *
 * Fixed-position and `pointer-events-none`, so it never participates in layout
 * or hit-testing. Every moving part animates `transform` only, which keeps the
 * whole thing on the compositor — it costs no main-thread time while scrolling.
 */
export function Aurora() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{ opacity: "var(--aurora-opacity)" }}
    >
      {/* Base mesh: three overlapping radial fields, no animation cost. */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(58rem 42rem at 12% -8%, color-mix(in oklab, var(--color-brand) 34%, transparent), transparent 62%),
            radial-gradient(46rem 38rem at 88% 4%, color-mix(in oklab, var(--color-accent) 26%, transparent), transparent 60%),
            radial-gradient(52rem 46rem at 50% 108%, color-mix(in oklab, var(--color-violet) 24%, transparent), transparent 64%)
          `,
        }}
      />

      {/* Drifting blobs. Long, offset durations so the loop never reads as a loop. */}
      <div
        className="animate-blob absolute -left-[18vw] top-[-10vh] h-[52vw] w-[52vw] rounded-full blur-[110px]"
        style={{ background: "color-mix(in oklab, var(--color-brand) 46%, transparent)" }}
      />
      <div
        className="animate-blob absolute -right-[14vw] top-[6vh] h-[44vw] w-[44vw] rounded-full blur-[120px]"
        style={{
          background: "color-mix(in oklab, var(--color-accent) 38%, transparent)",
          animationDelay: "-8s",
          animationDuration: "30s",
        }}
      />
      <div
        className="animate-blob absolute bottom-[-16vh] left-[24vw] h-[46vw] w-[46vw] rounded-full blur-[130px]"
        style={{
          background: "color-mix(in oklab, var(--color-violet) 34%, transparent)",
          animationDelay: "-16s",
          animationDuration: "36s",
        }}
      />
      <div
        className="animate-blob absolute bottom-[8vh] right-[10vw] h-[30vw] w-[30vw] rounded-full blur-[100px]"
        style={{
          background: "color-mix(in oklab, var(--color-accent) 26%, transparent)",
          animationDelay: "-24s",
          animationDuration: "42s",
        }}
      />

      <div className="grid-overlay absolute inset-0" />
      <div className="noise-overlay" />

      {/* Vignette pulls focus to the centre column and hides blob edges. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 78% at 50% 40%, transparent 42%, color-mix(in oklab, var(--page-bg) 88%, transparent) 100%)",
        }}
      />
    </div>
  );
}

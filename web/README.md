# WifiPlus — Liquid Glass redesign

A complete visual rebuild of [wifiplus.prathamgosai.in](https://wifiplus.prathamgosai.in/) in
Next.js 15, TypeScript, Tailwind v4 and Framer Motion, keeping every piece of the original
functionality.

The existing hand-written build at the repo root is **untouched** — it is still what's deployed.
This folder is a parallel implementation you can preview locally and switch to when you're ready.

---

## Quick start

```bash
cd web
npm install
npm run dev        # http://localhost:3000
```

```bash
npm run build      # static export → web/out/
npm run typecheck  # tsc --noEmit
npm run lint
```

`next build` writes a plain folder of HTML/CSS/JS to `out/`. No Node runtime, no serverless
functions — it drops onto Cloudflare Pages exactly like the current site.

---

## What carried over

Everything. Nothing was dropped in the redesign:

| Feature | Where it lives now |
| --- | --- |
| Real speed test (download, upload, ping, jitter, loss, DNS, stability) | `lib/speedtest.ts` + `hooks/useSpeedTest.ts` |
| WiFi health + 6 use-case scores | `lib/scoring.ts` |
| 38-provider / 24-country ISP dataset | `lib/providers.ts` |
| Comparison, rankings, recommendation engine | `components/sections/{Compare,Rankings,Recommend}.tsx` |
| Bandwidth + gaming-ping calculators | `components/sections/Tools.tsx` |
| AI WiFi Doctor (router screenshot → Worker) | `lib/analyzer.ts` + `components/sections/Doctor.tsx` |
| Location SEO pages | `components/sections/SeoPages.tsx` |
| 15-language i18n with RTL | `lib/i18n.ts` + `components/providers/LocaleProvider.tsx` |
| Dark / light theme toggle | `components/providers/ThemeProvider.tsx` |
| PWA install prompt + service worker | `hooks/useInstallPrompt.ts`, `public/sw.js` |
| Shareable result card (canvas PNG) | `lib/result-card.ts` |
| JSON-LD, OG/Twitter cards, robots, sitemap | `app/layout.tsx`, `public/` |

The measurement engine is a **verbatim port** — same 5s windows, same 1s warm-up discard, same 6/3
parallel streams, same median-based latency. Results stay comparable with the old build. The only
additions are `AbortSignal` support (so React can cancel on unmount) and types.

## What's new

Pricing, How It Works, About, Testimonials and Contact sections, plus the whole Liquid Glass
design system.

> **Two sections ship with placeholder content** and are labelled as such on the page itself:
> - **Testimonials** — "Sample Reviewer A/B/C…". These are illustrative, not real reviews. Replace
>   with attributed quotes before launch.
> - **Pricing** — placeholder packaging with no payment provider connected. The CTAs scroll to the
>   contact form. The Free tier accurately describes what the product does today.

---

## Architecture

```
web/
├── app/
│   ├── layout.tsx        fonts, metadata, JSON-LD, theme bootstrap, page chrome
│   ├── page.tsx          server component composing 20 client sections
│   ├── globals.css       ← the design system lives here
│   └── not-found.tsx
├── components/
│   ├── providers/        theme · locale · speed test · ISP selection · LazyMotion
│   ├── fx/               Aurora · CursorGlow · NetworkCanvas · Particles
│   ├── ui/               GlassCard · Button · Reveal · Counter · Marquee · Accordion · Controls
│   ├── layout/           Navbar · Footer · ScrollProgress · Logo · ServiceWorker
│   └── sections/         one file per page section
├── hooks/                useSpeedTest · useInteractions (tilt/magnetic/spotlight) · useInstallPrompt
├── lib/                  providers · scoring · speedtest · i18n · content · analyzer · motion · site
├── types/                shared domain contracts
└── public/               icon · manifest · sw.js · robots · sitemap · _headers
```

**Two shared-state decisions worth knowing:**

- `SpeedTestProvider` wraps both the hero and the AI Doctor, so one test run feeds both. Without it
  a visitor would have to run the test twice to see their scores.
- `IspProvider` wraps Intelligence, Compare and SeoPages, which is what lets a "Best ISP in Tokyo"
  card scope the comparison table and scroll you to it.

### Design system

Everything visual reads from a CSS variable in `app/globals.css`, so the light theme is a token
swap rather than a second stylesheet. The glass primitives — `.glass`, `.glass-sheen`,
`.gradient-ring`, `.spotlight`, `.text-gradient`, `.noise-overlay` — are plain CSS classes that
compose with Tailwind utilities.

Palette is exactly as specified: `#4F46E5` primary, `#06B6D4` accent, `#050816` canvas,
`rgba(255,255,255,0.08)` cards, `rgba(255,255,255,0.12)` borders, `#B8C0CC` secondary text.

### Performance notes

`178 kB` first-load JS for the whole page. What keeps it there despite the volume of motion:

- `LazyMotion` with `domAnimation` in `strict` mode — sections use `m.*`, not `motion.*`, which
  halves the Framer runtime.
- Every ambient animation (aurora blobs, marquee, float, sheen) is **CSS**, not JS.
- Pointer interactions write to CSS custom properties or motion values, never React state. A
  `pointermove` that calls `setState` re-renders the subtree 60× a second.
- The hero canvas pauses via `IntersectionObserver` the moment it scrolls away, caps DPR at 2, and
  scales particle count with viewport area.
- `Counter` drives `textContent` through `requestAnimationFrame` rather than state.
- Scroll reveals fire **once**.
- `prefers-reduced-motion` is honoured globally in CSS *and* per-component via `useReducedMotion`.

---

## Deploying

### Preview alongside the current site

Point a Cloudflare Pages preview project at this repo with:

- **Root directory:** `web`
- **Build command:** `npm run build`
- **Output directory:** `out`

### Switching over

1. Update the Pages project's root directory / build command / output directory as above.
2. Confirm the Worker still accepts the origin — `worker/wrangler.toml` sets `ALLOWED_ORIGIN`.
3. Redeploy.

The root `index.html` and `app.js` can stay in the repo as a rollback until you're happy.

### Before launch — three real TODOs

1. **`public/og-image.png` does not exist yet.** Social previews will 404 until you generate it.
   This carried over from the original build; SVG is not accepted as an `og:image` by Facebook, X,
   LinkedIn, WhatsApp or Slack.
   ```bash
   npx sharp-cli -i public/og-image.svg -o public/og-image.png resize 1200 630
   ```
2. **The AI Doctor Worker URL is still a placeholder** (`…example.workers.dev`) in `lib/site.ts`
   and in the CSP in `public/_headers`. Deploy the Worker, then from the repo root:
   ```bash
   node scripts/set-domain.mjs wifiplus.prathamgosai.in wifiplus-router-analyzer.<you>.workers.dev
   ```
   Until then the screenshot upload will fail and the CSP will block the request.
3. **Replace the placeholder testimonials and pricing** described above.

---

## Security: the CSP regression

The old hand-written site ran a strict `script-src 'self'` with **no** `'unsafe-inline'`, because
all its JS lived in one external file.

A Next.js static export cannot do that. It inlines its hydration bootstrap
(`self.__next_f.push(...)`) directly into the HTML, so `script-src` needs `'unsafe-inline'`. A nonce
is not an option — nonces must be generated per response, and a static host has no server to
generate one.

`public/_headers` therefore ships a looser `script-src` and the tradeoff is documented inline there.
`connect-src` is still pinned to the three endpoints the app actually calls, so injected code cannot
exfiltrate anywhere else, and `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'` and
HSTS are all unchanged.

If the strict policy matters more than the framework, either put a Cloudflare Worker in front that
injects a nonce and rewrites the HTML, or keep serving the legacy build.

---

## Accessibility

- Every control is a real labelled element; the glass styling sits on top of native `<select>`,
  `<input>`, `<button>` and `<table>` rather than replacing them.
- Skip link, visible focus rings on `:focus-visible`, `aria-expanded`/`aria-controls` on the
  accordion and mobile menu, `role="status"` + `aria-live` on the test readout, `role="progressbar"`
  with values on the meter.
- The comparison table stays a real `<table>` with `<caption>` and scoped headers; it restyles to
  stacked cards below `md` instead of scrolling sideways.
- `prefers-reduced-motion` removes all ambient motion, the cursor glow, the particles and the
  typing effect, and makes counters jump straight to their final value.

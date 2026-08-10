import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";

import { AppProviders } from "@/components/providers/AppProviders";
import { Aurora } from "@/components/fx/Aurora";
import { CursorGlow } from "@/components/fx/CursorGlow";
import { ServiceWorker } from "@/components/layout/ServiceWorker";
import { site } from "@/lib/site";

/* next/font self-hosts both faces at build time, so `font-src 'self'` in the
   CSP stays intact and there is no render-blocking request to Google. */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: site.title,
    template: "%s — WifiPlus",
  },
  description: site.shortDescription,
  applicationName: site.name,
  authors: [{ name: site.author.name, url: site.author.url }],
  creator: site.author.name,
  keywords: [
    "WifiPlus",
    "internet speed test",
    "WiFi analyzer",
    "ISP comparison",
    "broadband speed checker",
    "ping test",
    "jitter test",
    "packet loss test",
    "DNS latency",
    "fiber availability",
    "AI WiFi Doctor",
  ],
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg" }],
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: site.name,
    url: site.url,
    title: site.title,
    description: site.shortDescription,
    // Must be PNG/JPEG at 1200x630 — Facebook, X, LinkedIn, WhatsApp and Slack
    // all refuse to render an SVG og:image. Generate from public/og-image.svg:
    //   npx sharp-cli -i public/og-image.svg -o public/og-image.png resize 1200 630
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "WifiPlus — internet speed test and WiFi analyzer",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "WifiPlus — Free Internet Speed Test & WiFi Analyzer",
    description:
      "Real browser-based speed testing, WiFi diagnostics and a sample ISP comparison dataset. Free, no signup.",
    images: ["/og-image.png"],
  },
  appleWebApp: {
    capable: true,
    title: site.name,
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#080b16" },
    { media: "(prefers-color-scheme: light)", color: "#f4f6fb" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark light",
};

/**
 * Applied before first paint so a saved light theme never flashes dark.
 * Must stay synchronous and inline — a deferred script paints too late.
 */
const THEME_INIT = `(function(){try{var t=localStorage.getItem("wifiplus-theme");document.documentElement.dataset.theme=(t==="light"||t==="dark")?t:"dark";}catch(e){document.documentElement.dataset.theme="dark";}})();`;

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${site.url}/#organization`,
      name: site.name,
      alternateName: ["Wifi Plus", "WiFi Plus", "WifiPlus Speed Test"],
      url: `${site.url}/`,
      logo: `${site.url}/icon.svg`,
      description:
        "Internet intelligence platform for speed testing, ISP comparison, routing diagnostics and AI WiFi analysis.",
      founder: { "@type": "Person", name: site.author.name, url: site.author.url },
      sameAs: [site.author.url, site.repo],
    },
    {
      "@type": "WebSite",
      "@id": `${site.url}/#website`,
      name: site.name,
      url: `${site.url}/`,
      description: site.shortDescription,
      inLanguage: "en",
      publisher: { "@id": `${site.url}/#organization` },
    },
    {
      "@type": "WebApplication",
      name: site.name,
      url: `${site.url}/`,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires JavaScript and a modern browser",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      featureList: [
        "Download and upload speed test",
        "Ping, jitter and packet loss measurement",
        "DNS latency measurement",
        "WiFi health scoring",
        "Global ISP comparison and rankings",
        "AI router screenshot analysis",
      ],
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${inter.variable} ${manrope.variable}`}>
      <head>
        {/* The speed test fires at these origins the moment a user hits start;
            warming the handshake removes ~100-300ms from the first measurement. */}
        <link rel="preconnect" href="https://speed.cloudflare.com" crossOrigin="" />
        <link rel="preconnect" href="https://cloudflare-dns.com" crossOrigin="" />
        <link rel="dns-prefetch" href="https://speed.cloudflare.com" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
      </head>
      <body id="top" className="antialiased">
        <a
          href="#main"
          className="glass sr-only rounded-full px-5 py-3 text-sm font-semibold focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70]"
        >
          Skip to content
        </a>

        {/* Root owns only the global atmosphere + providers. Each route group
            (marketing / app / auth) supplies its own chrome and its own <main>,
            so the dashboard never inherits the marketing navbar and footer. */}
        <AppProviders>
          <Aurora />
          <CursorGlow />
          {children}
          <ServiceWorker />
        </AppProviders>
      </body>
    </html>
  );
}

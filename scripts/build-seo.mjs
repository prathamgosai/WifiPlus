#!/usr/bin/env node
/**
 * Builds the search-intent landing pages, their translations and the sitemap.
 *
 *   node scripts/build-seo.mjs
 *
 * Output is committed, not generated per request — the site is static and has no
 * build step, so the generated HTML is the deliverable. Re-run after editing
 * seo/pages.mjs or seo/locales.mjs, then commit what changes.
 *
 * Every page is self-contained: its own <title>, description, canonical, H1,
 * copy and FAQ, plus JSON-LD (WebPage + BreadcrumbList + WebApplication +
 * FAQPage) so the FAQ is eligible for rich results.
 *
 * Translated pages form an hreflang cluster: each URL lists every language
 * version including itself, plus x-default pointing at English. Google treats a
 * one-sided hreflang as unconfirmed and ignores it, so the links must be mutual.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PAGES, SITE } from "../seo/pages.mjs";
import { LOCALES, TRANSLATIONS, UI } from "../seo/locales.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Escapes text for HTML body content and attribute values. */
function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// No build clock anywhere: <lastmod> comes from the declared content date in
// seo/pages.mjs, so regenerating on any day produces byte-identical output and
// CI can verify the committed pages are current.

/**
 * Every generated variant of one source page: English plus each translation.
 * `key` is the English slug, which ties the cluster together.
 *
 * @param {import("../seo/pages.mjs").SeoPage} page
 */
function variantsOf(page) {
  const variants = [
    { locale: "en", hreflang: "en", dir: "ltr", path: `/${page.slug}/`, content: page },
  ];

  for (const locale of Object.values(LOCALES)) {
    const translated = TRANSLATIONS[locale.code]?.[page.slug];
    if (!translated) continue; // a locale earns a page only once it is written
    variants.push({
      locale: locale.code,
      hreflang: locale.hreflang,
      dir: locale.dir,
      path: `/${locale.code}/${translated.slug}/`,
      // `related` and `metric` are structural, so they come from the source page.
      content: { ...page, ...translated },
    });
  }

  return variants;
}

/** Locale strings with English as the fallback for anything untranslated. */
function stringsFor(locale) {
  const base = UI.en;
  const overlay = UI[locale] ?? {};
  return {
    ...base,
    ...overlay,
    metrics: { ...base.metrics, ...(overlay.metrics ?? {}) },
    phases: { ...base.phases, ...(overlay.phases ?? {}) },
    status: { ...base.status, ...(overlay.status ?? {}) },
    verdicts: { ...base.verdicts, ...(overlay.verdicts ?? {}) },
  };
}

function jsonLd(variant, url) {
  const page = variant.content;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: page.title,
        description: page.description,
        inLanguage: variant.locale,
        isPartOf: { "@id": `${SITE.url}/#website` },
        primaryImageOfPage: { "@type": "ImageObject", url: `${SITE.url}/og-image.png` },
        breadcrumb: { "@id": `${url}#breadcrumb` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: stringsFor(variant.locale).home, item: `${SITE.url}/` },
          { "@type": "ListItem", position: 2, name: page.h1, item: url },
        ],
      },
      {
        "@type": "WebApplication",
        name: `${SITE.name} — ${page.h1}`,
        url,
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Any",
        browserRequirements: "Requires JavaScript and a modern browser",
        inLanguage: variant.locale,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        creator: { "@type": "Person", name: SITE.author },
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        inLanguage: variant.locale,
        mainEntity: page.faq.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  };
}

/**
 * @param {ReturnType<typeof variantsOf>[number]} variant
 * @param {ReturnType<typeof variantsOf>} cluster every language version of this page
 * @param {Map<string, ReturnType<typeof variantsOf>>} allClusters for related links
 */
function render(variant, cluster, allClusters) {
  const page = variant.content;
  const t = stringsFor(variant.locale);
  const url = `${SITE.url}${variant.path}`;

  // Mutual hreflang: every version lists every version, itself included.
  const alternates = [
    ...cluster.map(
      (sibling) =>
        `<link rel="alternate" hreflang="${sibling.hreflang}" href="${SITE.url}${sibling.path}">`,
    ),
    `<link rel="alternate" hreflang="x-default" href="${SITE.url}${cluster[0].path}">`,
  ].join("\n");

  // Related tests stay inside the reader's language where a translation exists.
  const related = page.related
    .map((slug) => {
      const siblings = allClusters.get(slug);
      if (!siblings) return "";
      const target = siblings.find((s) => s.locale === variant.locale) ?? siblings[0];
      return `<li><a href="${target.path}"><strong>${esc(target.content.h1)}</strong><span>${esc(target.content.standfirst)}</span></a></li>`;
    })
    .filter(Boolean)
    .join("\n        ");

  const languageSwitcher =
    cluster.length > 1
      ? `<nav class="langs" aria-label="${esc(t.otherLanguages)}">
    ${cluster
      .map((sibling) =>
        sibling.path === variant.path
          ? `<span aria-current="true">${esc(sibling.locale === "en" ? "English" : (LOCALES[sibling.locale]?.name ?? sibling.locale))}</span>`
          : `<a href="${sibling.path}" hreflang="${sibling.hreflang}" lang="${sibling.locale}">${esc(sibling.locale === "en" ? "English" : (LOCALES[sibling.locale]?.name ?? sibling.locale))}</a>`,
      )
      .join("\n    ")}
  </nav>`
      : "";

  return `<!doctype html>
<html lang="${variant.locale}" dir="${variant.dir}" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://speed.cloudflare.com https://cloudflare-dns.com; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<meta name="author" content="${esc(SITE.author)}">
<link rel="canonical" href="${url}">
${alternates}
<meta property="og:type" content="article">
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:locale" content="${variant.locale}">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(page.title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:image" content="${SITE.url}/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(page.title)}">
<meta name="twitter:description" content="${esc(page.description)}">
<meta name="twitter:image" content="${SITE.url}/og-image.png">
<meta name="theme-color" content="#071116">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="stylesheet" href="/landing.css">
<link rel="preconnect" href="https://speed.cloudflare.com" crossorigin>
<link rel="dns-prefetch" href="https://cloudflare-dns.com">
<link rel="modulepreload" href="/landing.js">
<link rel="modulepreload" href="/core/measure.js">
<script type="application/ld+json">${JSON.stringify(jsonLd(variant, url))}</script>
</head>
<body>
<a class="skip-link" href="#main">${esc(t.skip)}</a>

<header class="bar">
  <a class="brand" href="/">WifiPlus</a>
  <nav aria-label="Primary">
    <a href="/">${esc(t.fullTest)}</a>
  </nav>
</header>

<main id="main">
  <nav class="crumbs" aria-label="Breadcrumb">
    <ol>
      <li><a href="/">${esc(t.home)}</a></li>
      <li aria-current="page">${esc(page.h1)}</li>
    </ol>
  </nav>

  <article>
    <h1>${esc(page.h1)}</h1>
    <p class="standfirst">${esc(page.standfirst)}</p>
    ${languageSwitcher}

    <!-- The live test. Same engine as the full tool: real bytes, no simulation.
         Localised strings arrive as data attributes because CSP forbids inline
         script, and landing.js reads them from here. -->
    <section class="tool" aria-label="${esc(page.h1)}"
      data-phase-ping="${esc(t.phases.ping)}"
      data-phase-download="${esc(t.phases.download)}"
      data-phase-upload="${esc(t.phases.upload)}"
      data-status-latency="${esc(t.status.latency)}"
      data-status-download="${esc(t.status.download)}"
      data-status-upload="${esc(t.status.upload)}"
      data-status-failed="${esc(t.status.failed)}"
      data-label-again="${esc(t.again)}"
      data-verdict-good="${esc(t.verdicts.good)}"
      data-verdict-queueing="${esc(t.verdicts.queueing)}"
      data-verdict-severe="${esc(t.verdicts.severe)}">
      <div class="stage">
        <button class="go" id="goButton" type="button">${esc(t.go)}</button>
        <p class="caption" id="goCaption">${esc(t.caption)}</p>
        <div class="readout" id="readout" hidden>
          <p class="phase" id="phase">${esc(t.phases.ping)}</p>
          <p class="value"><span id="value">0.00</span> <span class="unit" id="unit">ms</span></p>
          <div class="track"><span id="bar"></span></div>
        </div>
      </div>
      <dl class="results" id="results" hidden>
        <div><dt>${esc(t.metrics.download)}</dt><dd id="rDownload">--<span>Mbps</span></dd></div>
        <div><dt>${esc(t.metrics.upload)}</dt><dd id="rUpload">--<span>Mbps</span></dd></div>
        <div><dt>${esc(t.metrics.ping)}</dt><dd id="rPing">--<span>ms</span></dd></div>
        <div><dt>${esc(t.metrics.jitter)}</dt><dd id="rJitter">--<span>ms</span></dd></div>
        <div><dt>${esc(t.metrics.loss)}</dt><dd id="rLoss">--<span>%</span></dd></div>
        <div><dt>${esc(t.metrics.dns)}</dt><dd id="rDns">--<span>ms</span></dd></div>
        <div><dt>${esc(t.metrics.bufferbloat)}</dt><dd id="rBloat">--<span>${esc(t.metrics.grade)}</span></dd></div>
        <div><dt>${esc(t.metrics.stability)}</dt><dd id="rStability">--<span>%</span></dd></div>
      </dl>
      <p class="status" id="status" role="status" aria-live="polite">${esc(t.ready)}</p>
    </section>

    ${page.intro.map((paragraph) => `<p>${esc(paragraph)}</p>`).join("\n    ")}

    ${page.sections
      .map((section) => `<h2>${esc(section.heading)}</h2>\n    <p>${esc(section.body)}</p>`)
      .join("\n\n    ")}

    <h2>${esc(t.faqHeading)}</h2>
    <div class="faq">
      ${page.faq
        .map((item) => `<details><summary><h3>${esc(item.q)}</h3></summary><p>${esc(item.a)}</p></details>`)
        .join("\n      ")}
    </div>

    <h2>${esc(t.relatedHeading)}</h2>
    <ul class="related">
        ${related}
    </ul>

    <p class="cta"><a href="/">${esc(t.cta)}</a></p>
  </article>
</main>

<footer class="bar foot">
  <p>${esc(t.footer)}</p>
</footer>

<script type="module" src="/landing.js"></script>
</body>
</html>
`;
}

/**
 * Sitemap with xhtml:link alternates. Listing the cluster inside each entry is
 * what tells Google the translations belong together rather than competing.
 */
function sitemap(clusters) {
  const entries = [
    `  <url>\n    <loc>${SITE.url}/</loc>\n    <lastmod>${SITE.updated}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>`,
  ];

  for (const cluster of clusters.values()) {
    for (const variant of cluster) {
      const alternates = cluster
        .map(
          (sibling) =>
            `\n    <xhtml:link rel="alternate" hreflang="${sibling.hreflang}" href="${SITE.url}${sibling.path}"/>`,
        )
        .join("");
      entries.push(
        `  <url>\n    <loc>${SITE.url}${variant.path}</loc>\n    <lastmod>${variant.content.updated ?? SITE.updated}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${variant.locale === "en" ? "0.8" : "0.7"}</priority>${alternates}\n  </url>`,
      );
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join("\n")}
</urlset>
`;
}

// ---- build ----------------------------------------------------------------
/** @type {Map<string, ReturnType<typeof variantsOf>>} */
const clusters = new Map(PAGES.map((page) => [page.slug, variantsOf(page)]));

let count = 0;
for (const [slug, cluster] of clusters) {
  for (const variant of cluster) {
    const dir = join(ROOT, variant.path.replace(/^\/|\/$/g, ""));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), render(variant, cluster, clusters), "utf8");
    count += 1;
  }
  const langs = cluster.map((variant) => variant.locale).join(", ");
  console.log(`  ${slug.padEnd(18)} ${cluster.length} version(s): ${langs}`);
}

writeFileSync(join(ROOT, "sitemap.xml"), sitemap(clusters), "utf8");
console.log(`\nWrote ${count} pages + sitemap.xml (${count + 1} URLs).`);

const untranslated = PAGES.filter((page) => variantsOf(page).length === 1).map((page) => page.slug);
if (untranslated.length) {
  console.log(`English only (add content to seo/locales.mjs to translate): ${untranslated.join(", ")}`);
}

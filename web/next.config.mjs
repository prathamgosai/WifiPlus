/**
 * Static export keeps the deploy identical to the old site: `next build` writes a
 * plain folder of HTML/CSS/JS that Cloudflare Pages serves directly. No Node
 * runtime, no serverless functions, no change to the Worker or the domain setup.
 *
 * The local measurement API is the one thing that cannot survive that: route
 * handlers need a server. They are therefore named `route.dev.ts` and picked up
 * ONLY by the development `pageExtensions` below — during `next build` the
 * extension is not registered, so those files are inert and the export stays a
 * pure static folder. This is why the API exists for development without
 * weakening the production deploy, rather than being gated at runtime by a
 * check that could be got wrong.
 *
 * @type {import('next').NextConfig}
 */
const isProductionBuild = process.env.NODE_ENV === "production";

const nextConfig = {
  // `output: export` and route handlers are mutually exclusive, so the export is
  // only declared for the build that actually produces it.
  ...(isProductionBuild
    ? { output: "export" }
    : {
        // `trailingSlash` below makes the dev server answer /api/speedtest/ping
        // with a 308 to /api/speedtest/ping/. A browser follows it silently, so
        // nothing looks broken — but every latency probe then costs two round
        // trips and the reported ping is roughly double the real one. Measuring
        // through a redirect is measuring the redirect.
        //
        // Only the dev server has runtime routing at all: a static export has no
        // server to redirect, so this cannot affect production.
        skipTrailingSlashRedirect: true,
      }),
  pageExtensions: isProductionBuild ? ["ts", "tsx"] : ["ts", "tsx", "dev.ts"],
  // There is no image optimization server on a static host, so next/image has to
  // emit the source URL untouched. All artwork here is inline SVG anyway.
  images: { unoptimized: true },
  reactStrictMode: true,
  // Emits /about/index.html style paths, which is what Pages' static router expects.
  trailingSlash: true,
  productionBrowserSourceMaps: false,
};

export default nextConfig;

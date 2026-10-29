import type { NextConfig } from "next";

/**
 * Crawlers and link-preview bots get page metadata (title, description,
 * canonical, Open Graph) in <head> before the body streams. Without this,
 * Next.js streams metadata into the body for most clients, and search engines
 * ignore a canonical link outside <head>.
 */
const CRAWLERS =
  /bot|crawl|spider|slurp|google|bing|duckduck|baidu|yandex|applebot|facebookexternalhit|facebot|twitter|linkedin|slack|discord|whatsapp|telegram|pinterest|embedly|quora|skypeuripreview|vkshare|preview|lighthouse|chrome-lighthouse/i;

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Full URLs (with private booking tokens) never leave the site in Referer.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

// Belt and braces for pages that already set noindex in their metadata.
const PRIVATE_PATHS = ["/dashboard/:path*", "/onboarding/:path*", "/auth/:path*", "/invite/:path*", "/booking/:path*", "/api/:path*"];

const nextConfig: NextConfig = {
  // E2E tests build into their own folder (pointed at local Supabase) so they
  // never clobber the regular .next output.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    agentFeedback: true,
    serverActions: {
      // Logo uploads go up to 2 MB (see libs/supabase/storage.ts) plus multipart overhead.
      bodySizeLimit: "3mb",
    },
  },
  htmlLimitedBots: CRAWLERS,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      ...PRIVATE_PATHS.map((source) => ({ source, headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] })),
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

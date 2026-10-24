import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
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

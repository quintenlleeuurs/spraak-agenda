import type { NextConfig } from "next";

// GitHub Pages serves the app under https://<user>.github.io/<repo>,
// so every URL needs the repository name as prefix.
const basePath = "/spraak-agenda";

const nextConfig: NextConfig = {
  // Static export: no server, no API routes (CLAUDE.md rule 2).
  output: "export",
  basePath,
  assetPrefix: basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  // Exposed to client code so we can build URLs to /models and /ort.
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
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

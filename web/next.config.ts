import type { NextConfig } from "next";

// Set when serving from a sub-path, e.g. GitHub Pages project sites ("/AscendantAnalysis").
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  // Fully static site: every page is pre-rendered from the pipeline's exported JSON.
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
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

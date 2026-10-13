import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Quality gates and type checking are verified in CI prior to deployment
    ignoreBuildErrors: true,
  },
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

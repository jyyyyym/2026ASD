import path from "path";
import type { NextConfig } from "next";

const root = path.join(__dirname);
const isPages = process.env.GITHUB_PAGES === "1";
const repo = process.env.GITHUB_REPOSITORY?.split("/")[1] || "2026ASD";

const nextConfig: NextConfig = {
  ...(isPages
    ? {
        output: "export" as const,
        basePath: `/${repo}`,
        assetPrefix: `/${repo}/`,
      }
    : {}),
  trailingSlash: true,
  images: { unoptimized: true },
  outputFileTracingRoot: root,
  turbopack: {
    root,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "80mb",
    },
  },
};

export default nextConfig;

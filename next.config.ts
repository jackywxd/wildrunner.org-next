import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  staticPageGenerationTimeout: 600,
  eslint: {
    // Legacy site has many pre-existing lint warnings/errors; keep CI green during migration.
    ignoreDuringBuilds: true,
  },
  images: {
    formats: ["image/webp", "image/avif"],
    // Standard Next.js breakpoints so /_next/image width params resolve correctly
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    dangerouslyAllowSVG: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.wildrunner.org",
      },
      {
        protocol: "https",
        hostname: "pub-3ea1cd399d6642049d046bde97886fe3.r2.dev",
      },
    ],
  },
  headers: async () => [
    // Broad default first; more specific sources below override Cache-Control
    {
      source: "/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=3600, must-revalidate",
        },
      ],
    },
    {
      source: "/fonts/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=31536000, immutable",
        },
      ],
    },
    {
      source: "/:all*(svg|jpg|jpeg|png|webp|woff|woff2|ttf|otf)",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=31536000, immutable",
        },
      ],
    },
    {
      source: "/og",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=86400, stale-while-revalidate=604800",
        },
      ],
    },
  ],
};

export default nextConfig;

initOpenNextCloudflareForDev();

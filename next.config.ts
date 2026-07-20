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
    deviceSizes: [162, 322, 482, 642, 1026, 1282, 1922, 3842],
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
    {
      source: "/:all*(svg|jpg|jpeg|png|webp)",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=31536000, immutable",
        },
      ],
    },
    {
      source: "/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=3600, must-revalidate",
        },
      ],
    },
  ],
};

export default nextConfig;

initOpenNextCloudflareForDev();

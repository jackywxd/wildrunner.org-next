import type { NextConfig } from "next";
import { withPayload } from "@payloadcms/next/withPayload";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  staticPageGenerationTimeout: 600,
  experimental: {
    // Next fans static generation out across one worker per CPU, and each
    // worker opens its own miniflare instance over the *same* local SQLite
    // file. That contention makes local D1 fail outright ("D1_ERROR: Failed
    // to parse body as JSON, got: Error: internal error"). A deploy build
    // doesn't hit this because it prerenders against remote D1; a build
    // without Cloudflare credentials (CI) falls back to local and does.
    // Set NEXT_BUILD_CPUS=1 there to serialize it.
    //
    // Remote D1 only removes the *file* contention, not the fan-out. Every
    // one of those workers still boots Payload and still runs
    // `prodMigrations`, so a build with a pending migration has them racing
    // to apply it against the same real database — which is how the first
    // `add_race_records` staging deploy failed. Migrations are therefore
    // applied in their own step before the build (.github/workflows/
    // deploy.yml), not left to whichever worker gets there first.
    cpus: Number(process.env.NEXT_BUILD_CPUS) || undefined,
  },
  eslint: {
    // Legacy site has many pre-existing lint warnings/errors; keep CI green during migration.
    ignoreDuringBuilds: true,
  },
  // Packages with Cloudflare Workers (workerd) specific code
  // Read more: https://opennext.js.org/cloudflare/howtos/workerd
  serverExternalPackages: ["jose", "pg-cloudflare"],
  images: {
    formats: ["image/webp", "image/avif"],
    // Standard Next.js breakpoints so /_next/image width params resolve correctly
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    dangerouslyAllowSVG: true,
    localPatterns: [
      {
        pathname: "/static/**",
      },
      {
        pathname: "/api/media/file/**",
      },
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.wildrunner.org",
      },
      {
        protocol: "https",
        hostname: "pub-3ea1cd399d6642049d046bde97886fe3.r2.dev",
      },
      {
        // Staging's own R2 bucket. Staging uploads land here rather than in
        // the production bucket; migrated media still points at
        // images.wildrunner.org, which staging only reads.
        protocol: "https",
        hostname: "pub-f82e5464c241415f9ea3f879e8f46e7f.r2.dev",
      },
    ],
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve = webpackConfig.resolve ?? {};
    webpackConfig.resolve.extensionAlias = {
      ".cjs": [".cts", ".cjs"],
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return webpackConfig;
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
    // Payload's REST responses are per-user: /api/media is own-only, and
    // /api/members/storage-usage is one member's own figure. Under the
    // broad rule above they were served `public, max-age=3600`, so a shared
    // cache could hand one member another's library. Deliberately placed
    // BEFORE the static-extension rule below, which still needs to win for
    // /api/media/file/<name>.<ext> — those bytes are public content.
    {
      source: "/api/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "private, no-store, max-age=0, must-revalidate",
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
    // Overrides the broad "/:path*" default above (later entries win) so
    // drafts and other members-only data are never cached at the edge.
    {
      source: "/members/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "private, no-store, max-age=0, must-revalidate",
        },
      ],
    },
  ],
};

export default withPayload(nextConfig, { devBundleServerPackages: false });

// `remoteBindings: false` explicitly: this reads the same wrangler.jsonc
// binding flags the production build relies on, and would otherwise open a
// remote session on every `next dev`. That needs Cloudflare credentials,
// which CI has none of — the dev server then fails to start and the whole
// e2e suite dies before its first test. Local development wants the local
// emulated D1/R2 anyway; only `build:prod` needs the real ones.
initOpenNextCloudflareForDev({ remoteBindings: false });

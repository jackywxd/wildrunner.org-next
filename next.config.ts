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
  // Packages with Cloudflare Workers (workerd) specific code
  // Read more: https://opennext.js.org/cloudflare/howtos/workerd
  // `drizzle-kit` is here because of how Turbopack rewrites specifiers.
  // `@payloadcms/drizzle` reaches it through `createRequire` +
  // `require('drizzle-kit/api')`, which webpack left alone. Turbopack
  // rewrites it to an internal hashed name, and OpenNext's esbuild pass
  // then fails with `Could not resolve "drizzle-kit-<hash>/api"`.
  //
  // Nothing needs it at runtime: it exists for drizzle's schema push, and
  // this adapter runs with `push: false` (see payload.config.ts) because
  // push recreates indexes D1 already has. Marking it external keeps the
  // dynamic require intact and out of the bundle.
  serverExternalPackages: ["jose", "pg-cloudflare", "drizzle-kit"],
  images: {
    // Every `<Image>` builds its own URL — see src/lib/image-loader.ts for
    // why the Worker must not be the thing that resizes. `formats`,
    // `remotePatterns` and `dangerouslyAllowSVG` below only ever configured
    // `/_next/image`, which nothing reaches now; they are left in place
    // because turning the loader off has to be a one-line change, not an
    // archaeology exercise.
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
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
  // BOTH builders are configured, on purpose.
  //
  // `next dev` uses Turbopack — the Next 16 default, and dramatically
  // faster: the dev server is ready in ~340ms rather than seconds.
  // Turbopack resolves TypeScript extensions itself and needs nothing here.
  //
  // The production build opts back out with `next build --webpack` (see the
  // `build` script). Turbopack rewrites module specifiers, and
  // `@payloadcms/drizzle` reaches drizzle-kit through `createRequire` +
  // `require('drizzle-kit/api')`; Turbopack turns that into an internal
  // hashed name and OpenNext's esbuild pass then fails with
  // `Could not resolve "drizzle-kit-<hash>/api"` on five chunks.
  // `serverExternalPackages` does not prevent the rewrite. Nothing needs
  // drizzle-kit at runtime — it is for drizzle's schema push, and this
  // adapter runs `push: false` — so the fix is to keep Turbopack away from
  // it, using the opt-out Next 16 documents.
  //
  // Webpack does need the alias below: Payload and Lexical ship ESM whose
  // relative imports carry a `.js` extension that only exists as `.ts`.
  turbopack: {},
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
    //
    // max-age=0 rather than 3600, which is not a tuning choice.
    //
    // Next serves three different bodies at this one URL — the HTML
    // document, the RSC payload a Link click fetches, and the near-empty
    // payload a Link *prefetch* fetches (234 bytes for /races, because a
    // force-dynamic route prefetches no data) — and Vary here is only
    // `Sec-CH-Prefers-Color-Scheme`, never `RSC`. A cache allowed to reuse
    // without revalidating therefore cannot tell those three apart at all.
    //
    // Caching them for an hour was self-defeating on its own terms. Every
    // page under this rule is force-dynamic and recomputes registration
    // state per request precisely so the schedule turns over at midnight
    // with no job running; an hour of browser cache preserved a stale answer
    // without saving any of the work. Shared caches may still store and
    // revalidate — this is not no-store — and these responses carry no ETag,
    // so a revalidation refetches rather than risking a 304 that re-serves
    // the wrong body.
    //
    // Not to be confused with the "clicking 月曆 does nothing until I
    // refresh" bug, which looked like this and was not: that one was
    // PageTransitionEffect keying on pathname alone, and it reproduced
    // against `next dev`, which sends no-store. Fixed there, not here.
    {
      source: "/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=0, must-revalidate",
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
    //
    // The bare path is listed separately from `/:path*` on purpose. Whether
    // Next matches `/members` with `/members/:path*` is a detail of its
    // path matching that has changed shape between versions, and this is
    // the one rule where being wrong means a shared cache holding a page
    // that depends on who asked. Stating both costs nothing.
    //
    // `next dev` overrides Cache-Control on page responses whatever
    // `headers()` returns, so this cannot be verified locally at all —
    // e2e/public/cache-headers.spec.ts runs against staging and is what
    // actually checks it.
    {
      source: "/members",
      headers: [
        {
          key: "Cache-Control",
          value: "private, no-store, max-age=0, must-revalidate",
        },
      ],
    },
    {
      source: "/members/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "private, no-store, max-age=0, must-revalidate",
        },
      ],
    },
    // The admin panel, on the same reasoning as /members — and it was the
    // one authenticated area nobody carved out. Under the broad rule it
    // shipped `public, max-age=3600`: the logged-out login screen was cached
    // for an hour under /admin, so signing in and returning to the panel
    // re-served that login screen until the page was manually reloaded.
    // `public` on a response behind a session is the same shape as the
    // /api/* problem noted above, and no shared cache should be invited to
    // hold an admin's page at all.
    // Same pair for the same reason.
    {
      source: "/admin",
      headers: [
        {
          key: "Cache-Control",
          value: "private, no-store, max-age=0, must-revalidate",
        },
      ],
    },
    {
      source: "/admin/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "private, no-store, max-age=0, must-revalidate",
        },
      ],
    },
  ],

  /**
   * Every public address, pointed at the default language's copy of itself.
   *
   * WHY NOT `proxy.ts`, which is what this started as and is what the Next
   * docs reach for first. Next 16 renamed middleware to Proxy and moved it to
   * the **Node.js runtime**, and it says plainly that you cannot opt out:
   * "the `runtime` config option is not available in Proxy files. Setting the
   * `runtime` config option in Proxy will throw an error"
   * (node_modules/next/dist/docs/.../proxy.md). `@opennextjs/cloudflare`
   * accepts only an edge middleware — `useNodeMiddleware()` in its build
   * looks for `middleware["/"]` in the manifest and exits 1 on the Node one,
   * with "Node.js middleware is not currently supported". So on this stack a
   * Proxy cannot ship at all. `next build` was perfectly happy; the adapter
   * refused afterwards, which is why CI's `build` job is the only thing that
   * could have caught it.
   *
   * WHY `beforeFiles`, and why a list rather than one catch-all. The rewrite
   * has to happen before route matching, because `app/[lang]` is a single
   * dynamic segment and `/posts` would otherwise match it with `lang` =
   * "posts" and render the home page at `/posts`. `beforeFiles` is the only
   * phase early enough — and it is early enough to be dangerous: OpenNext's
   * router checks public files *after* it (`routingHandler.js`), so a
   * `/:path*` catch-all would swallow `/icon.svg` and `/fonts/…` on the way
   * past. Naming the ten segments the site actually has costs a line each and
   * cannot do that.
   *
   * `/api`, `/admin` and `/print` are absent on purpose: Payload owns the
   * first two, the third is a second root layout reached by machine, and none
   * of them is a page in a language.
   *
   * THE POINT OF ALL OF THIS is that no address changes. Every URL this site
   * has published is unprefixed — the articles, the share cards whose
   * `og:url` is already printed into images in other people's chat
   * histories, the PDFs with the address in their footer. A redirect would
   * keep them working and still move the site out from under them; a rewrite
   * is invisible from outside.
   */
  rewrites: async () => ({
    beforeFiles: [
      { source: "/", destination: "/zh-hant" },
      ...[
        "about",
        "design-preview",
        "gallery",
        "members",
        "og",
        "posts",
        "races",
        "riders",
        "share",
        "wx",
      ].map((segment) => ({
        source: `/${segment}/:path*`,
        destination: `/zh-hant/${segment}/:path*`,
      })),
    ],
    afterFiles: [],
    fallback: [],
  }),
};

export default withPayload(nextConfig, { devBundleServerPackages: false });

// `remoteBindings: false` explicitly: this reads the same wrangler.jsonc
// binding flags the production build relies on, and would otherwise open a
// remote session on every `next dev`. That needs Cloudflare credentials,
// which CI has none of — the dev server then fails to start and the whole
// e2e suite dies before its first test. Local development wants the local
// emulated D1/R2 anyway; only `build:prod` needs the real ones.
initOpenNextCloudflareForDev({ remoteBindings: false });

import fs from 'fs'
import path from 'path'
import { sqliteD1Adapter } from '@payloadcms/db-d1-sqlite'
import {
  lexicalEditor,
  BlocksFeature,
  CodeBlock,
  EXPERIMENTAL_TableFeature,
  FixedToolbarFeature,
  TextStateFeature,
} from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import { CloudflareContext, getCloudflareContext } from '@opennextjs/cloudflare'
import { GetPlatformProxyOptions } from 'wrangler'
import { r2Storage } from '@payloadcms/storage-r2'
import { en } from '@payloadcms/translations/languages/en'
import { zhTw } from '@payloadcms/translations/languages/zhTw'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Authors } from './collections/Authors'
import { Posts } from './collections/Posts'
import { Galleries } from './collections/Galleries'
import { RaceCategories } from './collections/RaceCategories'
import { RaceEditions } from './collections/RaceEditions'
import { RaceEvents } from './collections/RaceEvents'
import { RaceRecords } from './collections/RaceRecords'
import { RaceSchedule } from './collections/RaceSchedule'
import { HtmlEmbedBlock } from './blocks/HtmlEmbedBlock'
import { Site } from './globals/Site'
import { migrations } from './migrations'
import { aiExpandPostEndpoint } from './endpoints/aiExpandPost'
import { inviteMemberEndpoint } from './endpoints/inviteMember'
import { storageUsageEndpoint } from './endpoints/storageUsage'
import { directUploadInitEndpoint } from './endpoints/directUploadInit'
import { processMediaImageEndpoint } from './endpoints/processMediaImage'
import { transcodeMediaEndpoint } from './endpoints/transcodeMedia'
import { transcodeResultEndpoint } from './endpoints/transcodeResult'
import { transcodeSweepEndpoint } from './endpoints/transcodeSweep'
import { raceScheduleMaintenanceEndpoint } from './endpoints/raceScheduleMaintenance'
import { isEmailConfigured, resendAdapter } from './lib/email'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const realpath = (value: string) => (fs.existsSync(value) ? fs.realpathSync(value) : undefined)

// Anything run from a terminal rather than inside the Worker: the Payload
// CLI, or any of this repo's own scripts. These need bindings via
// getPlatformProxy, since getCloudflareContext only exists at runtime in a
// deployed Worker. Matching the whole scripts/ directory rather than
// listing files one by one — the previous per-file allowlist meant a new
// script failed with a misleading "call initOpenNextCloudflareForDev" error.
const scriptsDir = path.resolve(dirname, '..', 'scripts')
const isCLI = process.argv.some((value) => {
  const resolved = realpath(value)
  if (!resolved) return false
  return (
    resolved.endsWith(path.join('payload', 'bin.js')) ||
    resolved.startsWith(scriptsDir + path.sep)
  )
})
const isProduction = process.env.NODE_ENV === 'production'

const createLog =
  (level: string, fn: typeof console.log) => (objOrMsg: object | string, msg?: string) => {
    if (typeof objOrMsg === 'string') {
      fn(JSON.stringify({ level, msg: objOrMsg }))
    } else {
      fn(JSON.stringify({ level, ...objOrMsg, msg: msg ?? (objOrMsg as { msg?: string }).msg }))
    }
  }

const cloudflareLogger = {
  level: process.env.PAYLOAD_LOG_LEVEL || 'info',
  trace: createLog('trace', console.debug),
  debug: createLog('debug', console.debug),
  info: createLog('info', console.log),
  warn: createLog('warn', console.warn),
  error: createLog('error', console.error),
  fatal: createLog('fatal', console.error),
  silent: () => {},
} as any // Use PayloadLogger type when it's exported

// In a deployed Worker getCloudflareContext returns the real runtime
// bindings. During `next build` there is no Worker, so it resolves them
// through wrangler instead — and because wrangler.jsonc marks the
// production D1/R2 bindings `remote: true`, that opens a remote proxy
// session against the live resources. That is what a deploy build wants:
// pages prerender against real content, and local SQLite deadlocks under
// Next's parallel static generation (SQLITE_BUSY).
//
// It needs Cloudflare credentials, which CI has none of. There the build
// only has to prove the app compiles, and local emulated bindings do that
// fine — so fall back to them rather than failing.
//
// The fallback is on the error, not on a prior guess about credentials:
// this runs inside Next's static-generation worker processes, and the
// credential lookup spans env vars, ~/.wrangler config and an OAuth
// session, so it can't be predicted reliably from here.
//
// Only the CLI calls getPlatformProxy directly. `next dev` must not: it
// runs app code inside a pool of jest-worker child processes, and this
// module is evaluated once per process, so a direct call meant every worker
// booted its *own* miniflare over the same local SQLite file. Measured on
// one 23-second spec run: 12 worker processes, 14 miniflare instances,
// intermittent `SQLITE_BUSY: database is locked` that surfaced in CI as
// ECONNRESET during test teardown and made red runs unreadable. Routing dev
// through getCloudflareContext instead reuses the single instance
// `initOpenNextCloudflareForDev()` already starts in next.config.ts — same
// run measured 0 instances created here, 0 SQLITE_BUSY, 0 500s.
//
// `experimental.cpus` does not help: it bounds the *build*'s worker pool
// and leaves the dev pool untouched (measured — 12 children either way).
//
// That reuse, though, only ever held in the process
// `initOpenNextCloudflareForDev` happens to run in. `next dev` also forks a
// *fresh child process per dynamic route* to ask it for
// `generateStaticParams` — see
// next/dist/server/dev/next-dev-server.js, `getStaticPathsWorker`, whose own
// comment reads "we don't re-use workers so destroy the used one" — and that
// child evaluates this module with an empty global scope. getCloudflareContext
// then falls back to wrangler *itself*, passing no options, so it asks for the
// remote bindings wrangler.jsonc declares; with no Cloudflare credentials that
// handshake spends seconds and fails, and we used to answer by building a
// second miniflare over the same local SQLite file the dev server is serving
// from. Two workerd processes per fork, for a query the fork does not make.
//
// Which is what `SQLITE_BUSY: database is locked` was. Measured on CI run
// 32990903548 shard 1: 40 of these in one dev server's lifetime, then
// workerd's own `database is locked` one second before /gallery 500'd and
// took V-RACEALBUM-T1 with it. Reproduced locally by pointing wrangler at an
// account that does not exist: `lsof` on .wrangler/state/v3/d1 shows the extra
// workerd, and its parent is jest-worker's `processChild.js`.
//
// So outside a production build, go straight to the local emulated bindings
// the dev server wants anyway. The remote handshake is kept for exactly the
// case it exists for — `build:staging` / `build:prod`, which prerender against
// real content — and so is the warning below, which used to fire 40 times a
// CI run for a condition that was neither news nor a problem there.
const cloudflareContextSymbol = Symbol.for('__cloudflare-context__')

const cloudflare = isCLI ? await getCloudflareContextFromWrangler() : await getRuntimeContext()

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    components: {
      graphics: {
        // Logo is the login screen, Icon is the nav. Both inline their SVG
        // rather than pointing at /static/brand/ because the login logo has
        // to inherit the panel's text colour — the admin theme is
        // user-switchable and the wordmark's ink would vanish on dark.
        Logo: '@/components/admin/BrandLogo#BrandLogo',
        Icon: '@/components/admin/BrandIcon#BrandIcon',
      },
      beforeNavLinks: ['@/components/admin/MemberAreaLink#MemberAreaLink'],
    },
    meta: {
      titleSuffix: ' — 野馬營',
      icons: [{ url: '/static/brand/mark-purple.svg', type: 'image/svg+xml' }],
    },
  },
  // Traditional Chinese first: every member and the admin are Chinese
  // speakers, and it matches the language the site's own copy and email
  // templates are already in (see src/lib/invite.ts, Users.ts's
  // generateEmailSubject). English stays available from /admin/account —
  // Payload stores that choice in a `payload-lng` cookie, not on the user
  // document, so it is per-browser and does not survive a cleared cookie.
  i18n: {
    supportedLanguages: { en, 'zh-TW': zhTw },
    // Only consulted when the request carries no `payload-lng` cookie and no
    // Accept-Language that matches a supported key — see Payload's
    // getRequestLanguage. A browser sending `en-US` therefore gets English,
    // because `en` is supported here; that is the language switcher working,
    // not the fallback failing. Tests must pin their locale to see zh-TW.
    fallbackLanguage: 'zh-TW',
  },
  // RaceSchedule is still here and still what /races reads. The three new
  // collections are populated but unread — see the migration. Switching the
  // read path is a separate change, so that "the new tables are right" and
  // "the pages still work" are two claims that fail independently.
  collections: [
    Users,
    Media,
    Authors,
    Posts,
    Galleries,
    RaceEvents,
    RaceCategories,
    RaceEditions,
    RaceRecords,
    RaceSchedule,
  ],
  globals: [Site],
  endpoints: [
    aiExpandPostEndpoint,
    inviteMemberEndpoint,
    storageUsageEndpoint,
    directUploadInitEndpoint,
    processMediaImageEndpoint,
    transcodeMediaEndpoint,
    transcodeResultEndpoint,
    transcodeSweepEndpoint,
    raceScheduleMaintenanceEndpoint,
  ],
  // Left undefined without a Resend key: Payload then logs mail to the
  // console, and the invite endpoint hands the admin a link instead.
  email: isEmailConfigured() ? resendAdapter : undefined,
  // Default feature set (bold/italic/headings/lists/links/upload/etc.) plus
  // table, code block with syntax highlighting, text color, and a fixed
  // toolbar for a more Notion-like editing experience.
  editor: lexicalEditor({
    features: ({ defaultFeatures }) => [
      ...defaultFeatures,
      EXPERIMENTAL_TableFeature(),
      BlocksFeature({ blocks: [CodeBlock(), HtmlEmbedBlock] }),
      TextStateFeature(),
      FixedToolbarFeature(),
    ],
  }),
  secret: process.env.PAYLOAD_SECRET || '',
  // Without this, Payload's generateFilePathOrURL falls back to
  // `startsWith(serverURL || '')`, and every string starts with '', so it
  // can never detect an externally-hosted media `url` (e.g. our R2 CDN
  // URLs) as external — it always rewrites to /media/file/<filename>.
  serverURL: process.env.NEXT_PUBLIC_SITE_URL || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: sqliteD1Adapter({
    binding: cloudflare.env.D1,
    // Drizzle push recreates indexes that already exist on D1 and crashes /admin.
    // Schema changes go through Payload migrations instead.
    push: false,
    prodMigrations: migrations,
  }),
  logger: isProduction ? cloudflareLogger : undefined,
  plugins: [
    r2Storage({
      bucket: cloudflare.env.R2,
      // Upload straight from the browser to R2 in ~5 MB multipart chunks
      // instead of streaming the whole file through the Worker.
      //
      // Cloudflare caps a Worker's request body (100 MB on the lower
      // plans), and exceeding it doesn't surface as an error the admin UI
      // can show — the request is cut off at the edge, so a large video
      // upload just silently does nothing. Gallery videos here run to
      // 600 MB+, so this isn't an edge case for this site.
      //
      // Access defaults to the collection's own `create` rule, so members
      // can upload and anonymous visitors still can't.
      clientUploads: true,
      // No `generateFileURL` here on purpose: the cloud-storage plugin's
      // afterRead hook applies it to *every* read once set, recomputing the
      // URL from `filename` unconditionally. Migrated media's real R2 key
      // has slash-separated path segments (e.g. `posts/2023/utmb/cover.webp`)
      // while its `filename` column is a flattened, sanitized value
      // (`posts--2023--utmb--cover.webp`) — generateFileURL has no access to
      // the original stored url to fall back to, so it silently rewrote
      // every migrated image's url to a 404. New uploads get an absolute
      // URL written explicitly instead, in Media's own beforeChange hook
      // (setMediaUrl) — see media-url.ts.
      collections: { media: true },
    }),
  ],
})

// The slot the deployed Worker's entrypoint and `initOpenNextCloudflareForDev`
// both write, and the first thing getCloudflareContext reads — see
// @opennextjs/cloudflare's cloudflare-context.js. Reading it here is how this
// tells "there is a context to reuse" apart from "asking for one will open a
// remote proxy session", which is the whole distinction the comment above is
// about. A hoisted declaration, because the top-level await that calls it runs
// before any `const` below it is initialized.
function getRuntimeContext(): Promise<CloudflareContext> {
  const parked = (globalThis as { [cloudflareContextSymbol]?: CloudflareContext })[
    cloudflareContextSymbol
  ]
  if (parked) return Promise.resolve(parked)
  if (!isProduction) return getCloudflareContextFromWrangler({ remoteBindings: false })
  return getCloudflareContext({ async: true }).catch((error) => {
    // Loud on purpose: a deploy build landing here would prerender against an
    // empty local D1 and ship a contentless site.
    console.warn(
      `[payload.config] remote Cloudflare bindings unavailable, falling back to local ` +
        `emulated bindings. During a deploy build this means the prerendered pages ` +
        `will be missing content — check \`wrangler whoami\`. ` +
        `Cause: ${(error as Error).message?.split('\n')[0]}`,
    )
    return getCloudflareContextFromWrangler({ remoteBindings: false })
  })
}

// Adapted from https://github.com/opennextjs/opennextjs-cloudflare/blob/d00b3a13e42e65aad76fba41774815726422cc39/packages/cloudflare/src/api/cloudflare-context.ts#L328C36-L328C46
function getCloudflareContextFromWrangler(
  overrides: Partial<GetPlatformProxyOptions> = {},
): Promise<CloudflareContext> {
  return import(/* webpackIgnore: true */ `${'__wrangler'.replaceAll('_', '')}`).then(
    ({ getPlatformProxy }) =>
      getPlatformProxy({
        environment: process.env.CLOUDFLARE_ENV,
        // Repo scripts run with NODE_ENV=production when they mean to act
        // on the real D1/R2 (migrations, content refresh); without this
        // they would silently operate on the local emulated copy instead.
        remoteBindings: isProduction,
        ...overrides,
      } satisfies GetPlatformProxyOptions),
  )
}

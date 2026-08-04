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
import { RaceRecords } from './collections/RaceRecords'
import { RaceSchedule } from './collections/RaceSchedule'
import { Site } from './globals/Site'
import { migrations } from './migrations'
import { aiExpandPostEndpoint } from './endpoints/aiExpandPost'
import { inviteMemberEndpoint } from './endpoints/inviteMember'
import { storageUsageEndpoint } from './endpoints/storageUsage'
import { directUploadInitEndpoint } from './endpoints/directUploadInit'
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

/**
 * Refuse to reach production from a workstation unless it was asked for.
 *
 * `next build` sets NODE_ENV=production on its own, which flips
 * `remoteBindings` on below. With CLOUDFLARE_ENV unset that resolves to the
 * top-level binding — production — and collecting page data boots Payload,
 * which runs `prodMigrations`. So a plain `pnpm build`, and a
 * `pnpm deploy:staging` whose inner build never saw CLOUDFLARE_ENV, both
 * migrated the live database while appearing to do nothing of the sort.
 * Both happened on 2026-08-04; the second left production's schema changed
 * but unrecorded, which only surfaces at the *next* deploy.
 *
 * Nothing here distinguishes an intentional production run from an accident
 * except intent, so intent has to be stated. CI is exempt because its
 * production job is already gated on a human approval, and every script that
 * means production sets the flag in package.json.
 */
function assertProductionAccessIsIntended(environment: string | undefined): void {
  if (!isProduction) return
  if (environment && environment !== 'production') return
  if (process.env.CI === 'true') return
  if (process.env.ALLOW_REMOTE_PRODUCTION === '1') return

  throw new Error(
    [
      'Refusing to open remote PRODUCTION bindings.',
      '',
      'NODE_ENV=production and no CLOUDFLARE_ENV means the top-level',
      'wrangler environment, which is the live database. If that is what you',
      'want, say so:  ALLOW_REMOTE_PRODUCTION=1 <command>',
      '',
      'If you meant staging, set CLOUDFLARE_ENV=staging.',
      'If you meant local, drop NODE_ENV=production (plain `pnpm build` sets',
      'it for you — use `pnpm typecheck` to check compilation instead).',
    ].join('\n'),
  )
}

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
// Before either branch, not inside one. The CLI path and the build path
// reach production by different routes — `next build` takes the
// getCloudflareContext branch below, which is how a plain `pnpm build`
// migrated the live database while a guard sitting only in
// getCloudflareContextFromWrangler watched it happen.
assertProductionAccessIsIntended(process.env.CLOUDFLARE_ENV)

const cloudflare =
  isCLI || !isProduction
    ? await getCloudflareContextFromWrangler()
    : await getCloudflareContext({ async: true }).catch(async (error) => {
        // Loud on purpose: a deploy build landing here would prerender
        // against an empty local D1 and ship a contentless site.
        console.warn(
          `[payload.config] remote Cloudflare bindings unavailable, falling back to local ` +
            `emulated bindings. Expected in CI; during a deploy build this means the ` +
            `prerendered pages will be missing content — check \`wrangler whoami\`. ` +
            `Cause: ${(error as Error).message?.split('\n')[0]}`,
        )
        return getCloudflareContextFromWrangler({ remoteBindings: false })
      })

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
  // generateEmailSubject). English stays available per-account from
  // /admin/account — Payload persists the choice on the user, so switching
  // once is permanent, not a per-request negotiation.
  i18n: {
    supportedLanguages: { en, 'zh-TW': zhTw },
    fallbackLanguage: 'zh-TW',
  },
  collections: [Users, Media, Authors, Posts, Galleries, RaceRecords, RaceSchedule],
  globals: [Site],
  endpoints: [
    aiExpandPostEndpoint,
    inviteMemberEndpoint,
    storageUsageEndpoint,
    directUploadInitEndpoint,
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
      BlocksFeature({ blocks: [CodeBlock()] }),
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

// Adapted from https://github.com/opennextjs/opennextjs-cloudflare/blob/d00b3a13e42e65aad76fba41774815726422cc39/packages/cloudflare/src/api/cloudflare-context.ts#L328C36-L328C46
function getCloudflareContextFromWrangler(
  overrides: Partial<GetPlatformProxyOptions> = {},
): Promise<CloudflareContext> {
  const environment = process.env.CLOUDFLARE_ENV

  return import(/* webpackIgnore: true */ `${'__wrangler'.replaceAll('_', '')}`).then(
    ({ getPlatformProxy }) =>
      getPlatformProxy({
        environment,
        // Repo scripts run with NODE_ENV=production when they mean to act
        // on the real D1/R2 (migrations, content refresh); without this
        // they would silently operate on the local emulated copy instead.
        remoteBindings: isProduction,
        ...overrides,
      } satisfies GetPlatformProxyOptions),
  )
}

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

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Authors } from './collections/Authors'
import { Posts } from './collections/Posts'
import { Galleries } from './collections/Galleries'
import { Site } from './globals/Site'
import { migrations } from './migrations'
import { aiExpandPostEndpoint } from './endpoints/aiExpandPost'
import { inviteMemberEndpoint } from './endpoints/inviteMember'
import { storageUsageEndpoint } from './endpoints/storageUsage'
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

const cloudflare =
  isCLI || !isProduction
    ? await getCloudflareContextFromWrangler()
    : await getCloudflareContext({ async: true })

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media, Authors, Posts, Galleries],
  globals: [Site],
  endpoints: [aiExpandPostEndpoint, inviteMemberEndpoint, storageUsageEndpoint],
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
function getCloudflareContextFromWrangler(): Promise<CloudflareContext> {
  return import(/* webpackIgnore: true */ `${'__wrangler'.replaceAll('_', '')}`).then(
    ({ getPlatformProxy }) =>
      getPlatformProxy({
        environment: process.env.CLOUDFLARE_ENV,
        remoteBindings: isProduction,
      } satisfies GetPlatformProxyOptions),
  )
}

/**
 * Refuse to deploy a bundle containing credentials that shouldn't ship.
 *
 * OpenNext inlines the whole build environment into
 * `.open-next/cloudflare/next-env.mjs`, so whatever is exported when
 * `next build` runs ends up readable inside the deployed artifact. Locally
 * `.env.local` holds S3_* — the R2 *write* credentials used by the offline
 * Velite pipeline — and those must never reach a Worker.
 *
 * `build:prod` blanks them, and this verifies the blanking actually worked
 * rather than trusting it. Checks the real values from .env.local against
 * the built output, so a rename or a change in how OpenNext inlines env
 * can't quietly defeat it.
 *
 * PAYLOAD_SECRET is deliberately NOT checked: Payload cannot boot without
 * it, so it has to be in the bundle. That's inherent to this setup.
 */
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const bundleDir = path.join(root, '.open-next')

if (!fs.existsSync(bundleDir)) {
  console.error('assert-no-secrets: .open-next not found — build first.')
  process.exit(1)
}

/**
 * Values that must not appear anywhere in the build output.
 *
 * S3_* are R2 write credentials for the offline Velite pipeline.
 * PAYLOAD_SECRET and RESEND_API_KEY are supplied as Worker secrets
 * instead — OpenNext's populateProcessEnv assigns Cloudflare vars/secrets
 * before falling back to build-time values (`??=`), so the runtime secret
 * wins and nothing sensitive needs to ship inside the artifact.
 */
const FORBIDDEN_KEYS = [
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'PAYLOAD_SECRET',
  'RESEND_API_KEY',
  // Authorises the daily race-schedule maintenance call. Supplied as a
  // Worker secret like RESEND_API_KEY, so it has no business in the bundle.
  'RACE_MAINTENANCE_SECRET',
]

/**
 * What to do about each key, printed when that key is the one found.
 *
 * Keyed off the same list rather than written as one fixed paragraph. The
 * paragraph was the R2 story — "these are R2 write credentials", remedies
 * for `S3_*` and `PAYLOAD_*` — and it stayed that way while the list above
 * grew `RESEND_API_KEY` and `RACE_MAINTENANCE_SECRET`. A `RACE_MAINTENANCE_SECRET`
 * hit then printed advice matching neither the credential nor its fix, and
 * the reader had to re-derive what the check already knew. A guard that
 * stops the right thing and points somewhere else costs about as much as
 * no guard.
 */
const REMEDY = {
  S3_ACCESS_KEY_ID: 'R2 write credentials for the offline Velite pipeline — blank it in the build env file (build:prod already does).',
  S3_SECRET_ACCESS_KEY: 'R2 write credentials for the offline Velite pipeline — blank it in the build env file (build:prod already does).',
  PAYLOAD_SECRET: 'Supply as a Worker secret: `wrangler secret put PAYLOAD_SECRET --env <env>`.',
  RESEND_API_KEY: 'Supply as a Worker secret: `wrangler secret put RESEND_API_KEY --env <env>`.',
  RACE_MAINTENANCE_SECRET: 'Supply as a Worker secret: `wrangler secret put RACE_MAINTENANCE_SECRET --env <env>`.',
}

const envLocal = path.join(root, '.env.local')
const secrets = []
if (fs.existsSync(envLocal)) {
  for (const line of fs.readFileSync(envLocal, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!match) continue
    const [, key, rawValue] = match
    const value = rawValue.trim().replace(/^["']|["']$/g, '')
    // Short values would match by coincidence all over a JS bundle.
    // Compares against the REAL values from .env.local, so the harmless
    // build-time placeholder in .env.<mode> is not flagged.
    if (FORBIDDEN_KEYS.includes(key) && value.length >= 12) {
      secrets.push({ key, value })
    }
  }
}

if (secrets.length === 0) {
  console.log('assert-no-secrets: no S3 credentials configured locally — nothing to check.')
  process.exit(0)
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else yield full
  }
}

const hits = []
for (const file of walk(bundleDir)) {
  let contents
  try {
    contents = fs.readFileSync(file, 'utf8')
  } catch {
    continue // binary/unreadable assets
  }
  for (const { key, value } of secrets) {
    if (contents.includes(value)) {
      hits.push({ key, file: path.relative(root, file) })
    }
  }
}

if (hits.length > 0) {
  console.error('\nassert-no-secrets: REFUSING TO DEPLOY\n')
  for (const { key, file } of hits) {
    console.error(`  ${key} found in ${file}`)
  }
  console.error(
    '\nWhatever is exported when `next build` runs is inlined into the\n' +
      'bundle, so these would be readable inside the deployed Worker.\n',
  )
  for (const key of [...new Set(hits.map((hit) => hit.key))]) {
    console.error(`  ${key}\n    ${REMEDY[key] ?? 'Must not be present at build time.'}`)
  }
  // The value is matched against .env.local, so a hit means .env.<mode>
  // carries the same real value — which is the thing to change, not the
  // local file the check reads from.
  //
  // Spelling out "present and empty" because the obvious reading of "blank
  // it" is to delete the line, and that is the one fix that puts the
  // credential back. Next gives .env.local HIGHER precedence than
  // .env.<mode>, so an absent key is not an empty one — with-env.mjs keeps
  // empty values for exactly this reason, and says so at its own loop.
  console.error(
    '\nThe real value belongs in `wrangler secret put`; the build env file\n' +
      '(.env.staging / .env.production) should carry a blank or a placeholder.\n' +
      'The line must be PRESENT AND EMPTY (`KEY=`). Deleting it is not the\n' +
      "same thing: .env.local outranks .env.<mode>, so a missing line hands\n" +
      'the real value straight back — silently.\n',
  )
  process.exit(1)
}

// Also report what the bundle was actually built with. A build that picked
// up the wrong environment file is the failure this whole setup exists to
// prevent, and it is invisible otherwise — a staging URL in a production
// bundle produces no error, just an admin whose every write is silently
// rejected by Payload's CSRF check.
const envFile = path.join(bundleDir, 'cloudflare', 'next-env.mjs')
if (fs.existsSync(envFile)) {
  const text = fs.readFileSync(envFile, 'utf8')
  const inlined = {}
  for (const key of ['NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_ENV', 'R2_PUBLIC_URL']) {
    const found = text.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`))
    inlined[key] = found ? found[1] : '(absent)'
  }
  console.log('assert-no-secrets: bundle built with')
  for (const [key, value] of Object.entries(inlined)) {
    console.log(`  ${key.padEnd(22)} ${value}`)
  }
}

console.log(
  `assert-no-secrets: OK — ${secrets.length} credential(s) checked, none present in the bundle.`,
)

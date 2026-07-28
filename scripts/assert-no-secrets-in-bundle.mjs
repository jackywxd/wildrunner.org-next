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

/** Values that must not appear anywhere in the build output. */
const FORBIDDEN_KEYS = ['S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']

const envLocal = path.join(root, '.env.local')
const secrets = []
if (fs.existsSync(envLocal)) {
  for (const line of fs.readFileSync(envLocal, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!match) continue
    const [, key, rawValue] = match
    const value = rawValue.trim().replace(/^["']|["']$/g, '')
    // Short values would match by coincidence all over a JS bundle.
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
    '\nThese are R2 write credentials and would be readable inside the\n' +
      'deployed Worker. Build with `pnpm build:prod`, which blanks them.\n',
  )
  process.exit(1)
}

console.log(
  `assert-no-secrets: OK — ${secrets.length} credential(s) checked, none present in the bundle.`,
)

/**
 * Pre-merge check for the production auto-deploy.
 *
 * Cloudflare Workers Builds deploys `main` on every push, and several
 * things it depends on live outside this repo (Dashboard build variables,
 * D1 tables created out-of-band). This asserts the parts that *are*
 * checkable from here, so a merge doesn't discover them in production.
 *
 *   pnpm preflight:prod
 *
 * Queries D1 by shelling out to `wrangler d1 execute --remote` rather than
 * through getPlatformProxy: the top-level (production) bindings are not
 * marked `remote: true`, so a proxy silently reads the *local* emulated
 * database instead — this script's first version did exactly that and
 * cheerfully reported on the wrong database.
 */
import 'dotenv/config'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'

const PROD_DB = 'wildrunner-org-next'

function query<T>(sql: string): T[] {
  const raw = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', PROD_DB, '--remote', '--json', '--command', sql],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 },
  )
  const parsed = JSON.parse(raw.slice(raw.indexOf('['))) as { results: T[] }[]
  return parsed[0]?.results ?? []
}

type Check = { name: string; ok: boolean; detail: string; fatal: boolean }
const checks: Check[] = []
const add = (name: string, ok: boolean, detail: string, fatal = true) =>
  checks.push({ name, ok, detail, fatal })

// --- schema -----------------------------------------------------------
const tableNames = new Set(
  query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").map(
    (r) => r.name,
  ),
)

add(
  'D1 has Payload tables',
  tableNames.has('posts') && tableNames.has('users') && tableNames.has('media'),
  `${tableNames.size} tables`,
)

// Created by scripts/sql/opennext-tag-cache.sql, not by a Payload
// migration — Payload would drop a table it doesn't know about.
add(
  'D1 has `revalidations` (tag cache)',
  tableNames.has('revalidations'),
  tableNames.has('revalidations')
    ? 'present'
    : 'MISSING — run scripts/sql/opennext-tag-cache.sql. Without it every ' +
      'revalidatePath silently does nothing and published edits never appear.',
)

const appliedNames = new Set(
  query<{ name: string }>('SELECT name FROM payload_migrations').map((r) => r.name),
)
const { migrations } = await import('../src/migrations/index.js')
const pending = migrations.filter((m) => !appliedNames.has(m.name))
add(
  'Payload migrations applied',
  pending.length === 0,
  pending.length
    ? `${pending.length} pending: ${pending.map((m) => m.name).join(', ')}. ` +
      'Note Workers Builds runs `payload migrate` with NODE_ENV unset, which ' +
      "targets the build container's LOCAL D1 — apply them first with " +
      'NODE_ENV=production pnpm payload migrate'
    : `${appliedNames.size} applied, 0 pending`,
)

// --- content ----------------------------------------------------------
const [counts] = query<{
  posts: number
  media: number
  admins: number
  test_accounts: number
}>(
  `SELECT (SELECT COUNT(*) FROM posts) AS posts,
          (SELECT COUNT(*) FROM media) AS media,
          (SELECT COUNT(*) FROM users WHERE role='admin') AS admins,
          (SELECT COUNT(*) FROM users WHERE email LIKE '%.test') AS test_accounts`,
)

add('D1 has content', counts.posts > 0, `${counts.posts} posts, ${counts.media} media`)
add(
  'At least one admin account',
  counts.admins > 0,
  `${counts.admins} admin(s)` +
    (counts.admins > 0
      ? ''
      : ' — nobody could log in, and the first-user bootstrap only fires on a ' +
        'completely empty users table'),
)
add(
  'No .test accounts left',
  counts.test_accounts === 0,
  counts.test_accounts === 0
    ? 'none'
    : `${counts.test_accounts} e2e fixture account(s) present — they have ` +
      'known passwords and must not exist in production',
)

// --- build-time env ---------------------------------------------------
// OpenNext inlines the build environment into the bundle
// (.open-next/cloudflare/next-env.mjs), so these must be set as *build*
// variables in Workers Builds, not as Worker runtime secrets.
for (const [key, expected] of Object.entries({
  NEXT_PUBLIC_SITE_URL: 'https://wildrunner.org',
  R2_PUBLIC_URL: 'https://images.wildrunner.org',
})) {
  const actual = process.env[key]
  add(
    `${key} is the production value`,
    actual === expected,
    actual === expected
      ? expected
      : `got ${JSON.stringify(actual)}, expected ${expected}` +
        (key === 'NEXT_PUBLIC_SITE_URL'
          ? " — this also seeds Payload's CSRF allow-list; a wrong value makes " +
            'every admin write fail silently'
          : ''),
  )
}
add('PAYLOAD_SECRET is set', Boolean(process.env.PAYLOAD_SECRET), 'required for Payload to boot')

// S3_* are Velite-only, local-only credentials.
const leaked = ['S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'].filter((k) => process.env[k])
add(
  'No S3 credentials in build env',
  leaked.length === 0,
  leaked.length
    ? `${leaked.join(', ')} present. OpenNext inlines the build env into the ` +
      'worker bundle, so these R2 write credentials would ship inside the ' +
      'deployed artifact. Fine locally; must NOT be set in Workers Builds.'
    : 'none',
  false,
)

// --- env coverage -----------------------------------------------------
// Cross-checks what the code reads against what production actually
// provides, so a newly introduced variable shows up here rather than as a
// silent undefined in production.
function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

const referenced = new Set<string>()
for (const file of sourceFiles('src')) {
  for (const m of readFileSync(file, 'utf8').matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) {
    referenced.add(m[1])
  }
}

// Supplied by the platform or the framework, never by us.
const PROVIDED_BY_RUNTIME = new Set([
  'NODE_ENV',
  'NEXTJS_ENV',
  'CLOUDFLARE_ENV',
  'AI_IN_DEV',
  'PAYLOAD_LOG_LEVEL',
  'STREAM_INGEST_IN_DEV',
])
// Offline Velite pipeline only; must NOT reach production (checked above).
const LOCAL_ONLY = new Set([
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_ENDPOINT',
  'S3_BUCKET',
])
// Optional: absence is a supported configuration, not a misconfiguration.
const OPTIONAL = new Set([
  'NEXT_PUBLIC_CF_STREAM_CUSTOMER_CODE',
  'NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN',
  'STREAM_INGEST',
])

const wranglerVars = new Set(
  Object.keys(
    JSON.parse(
      readFileSync('wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, ''),
    ).vars ?? {},
  ),
)
// Ask the deployed Worker what secrets it actually has, rather than
// trusting a list in this file to stay in sync.
let workerSecrets = new Set<string>()
try {
  const raw = execFileSync('npx', ['wrangler', 'secret', 'list'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  workerSecrets = new Set(
    (JSON.parse(raw.slice(raw.indexOf('['))) as { name: string }[]).map((s) => s.name),
  )
} catch {
  // Leave empty: an unreadable secret list should surface as a missing
  // variable rather than a silent pass.
}

const missing: string[] = []
for (const key of [...referenced].sort()) {
  if (PROVIDED_BY_RUNTIME.has(key) || LOCAL_ONLY.has(key) || OPTIONAL.has(key)) continue
  const supplied =
    wranglerVars.has(key) || workerSecrets.has(key) || Boolean(process.env[key])
  if (!supplied) missing.push(key)
}

add(
  'Every required env var is supplied',
  missing.length === 0,
  missing.length
    ? `not provided by wrangler vars, Worker secrets, or the build env: ${missing.join(', ')}`
    : `${referenced.size} referenced; ${workerSecrets.size} Worker secret(s), ` +
      `${wranglerVars.size} wrangler var(s)`,
)

// --- report -----------------------------------------------------------
let blocking = 0
for (const c of checks) {
  if (!c.ok && c.fatal) blocking += 1
  console.log(`${c.ok ? 'PASS' : c.fatal ? 'FAIL' : 'WARN'}  ${c.name}\n      ${c.detail}`)
}
console.log(
  `\n${checks.filter((c) => c.ok).length}/${checks.length} passed` +
    (blocking ? `, ${blocking} blocking` : ''),
)
process.exit(blocking ? 1 : 0)

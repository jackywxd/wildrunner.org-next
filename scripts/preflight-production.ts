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

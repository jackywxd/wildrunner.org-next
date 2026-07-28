/**
 * Run a command with a specific env file loaded, overriding everything.
 *
 *   node scripts/with-env.mjs .env.production opennextjs-cloudflare build
 *
 * Why this exists rather than `next build` picking up `.env.production`
 * itself: Next auto-loads `.env.local` on every build and gives it HIGHER
 * precedence than `.env.<mode>`, so a mode file cannot override a local
 * one. Values placed directly in `process.env` outrank all of them, which
 * is what this does — that is the only way to guarantee a staging build
 * never inherits a production value, or either of them inherits the
 * `S3_*` write credentials that live in `.env.local` for the offline
 * Velite pipeline.
 *
 * Deliberately overrides pre-existing process.env entries (unlike Node's
 * own --env-file): the whole point is that the file is authoritative for
 * that environment. It also can't invoke the CLI through node directly —
 * `node_modules/.bin/*` are shell wrappers, not JS.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const [envFile, command, ...args] = process.argv.slice(2)

if (!envFile || !command) {
  console.error('usage: node scripts/with-env.mjs <env-file> <command> [args...]')
  process.exit(1)
}

const resolved = path.resolve(process.cwd(), envFile)
if (!fs.existsSync(resolved)) {
  console.error(
    `with-env: ${envFile} not found.\n` +
      `Copy the matching .example and fill it in — see docs/production-cutover.md.`,
  )
  process.exit(1)
}

const env = { ...process.env }
const loaded = []
for (const line of fs.readFileSync(resolved, 'utf8').split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq === -1) continue
  const key = trimmed.slice(0, eq).trim()
  // Keep empty values: `S3_ACCESS_KEY_ID=` is how the file neutralises
  // whatever .env.local would otherwise supply. Dropping it would silently
  // reintroduce the credential.
  env[key] = trimmed
    .slice(eq + 1)
    .trim()
    .replace(/^["']|["']$/g, '')
  loaded.push(key)
}

console.log(`with-env: ${envFile} → ${loaded.length} vars (${command})`)

const child = spawn(command, args, { env, stdio: 'inherit', shell: true })
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)))
child.on('error', (error) => {
  console.error(`with-env: failed to start ${command}:`, error.message)
  process.exit(1)
})

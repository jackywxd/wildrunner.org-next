/**
 * Narrate one article on this Mac, through a local TTS server, into an MP3
 * the site will play.
 *
 *   pnpm narrate:local --post 33                 # production's post 33
 *   pnpm narrate:local --post 33 --env staging   # staging's
 *   pnpm narrate:local --post 33 --voice ryan --bitrate 48k
 *
 * WHY THIS EXISTS. The Worker path (`narrateArticle`) sends the whole script to
 * `minimax/speech-2.8-hd` in one call, and post 33 is 134,839 characters —
 * thirteen times what that model accepts, and about ten hours of audio, which
 * is more than a Worker can hold in memory or finish inside a request. Nothing
 * here has those limits: the voice runs locally (oMLX serving Qwen3-TTS, chosen
 * by listening — `scripts/tts-audition.py`), one sentence at a time, and ffmpeg
 * joins the sentences into one file.
 *
 * THE KEY IS THE ONE THE PAGE ASKS FOR. `articleAudioKeyForPost` is the only
 * way anything computes a narration key — the generator, the sweep and the
 * page all go through it, because the alternative once put three paid-for MP3s
 * on production under keys no render would ever request. This script imports
 * it rather than re-deriving it, so the file it writes is found by
 * `findNarration` the moment it is uploaded.
 *
 * NARRATED AS WRITTEN. The Worker path runs the script through a model first
 * (`spoken-script.ts`) to say `307` as a marathon time; that needs the `AI`
 * binding, which a laptop does not have. `spokenScript` already falls back to
 * the script unchanged whenever it cannot rewrite, and its header explains why
 * that fallback is a real, correct script rather than a stand-in. So this is
 * the same output that path produces when its model is unavailable.
 *
 * READS WITH WRANGLER, WRITES NOTHING REMOTE. The post comes from
 * `wrangler d1 execute --remote`, which touches nothing — never from booting
 * Payload, which applies pending migrations on connect when
 * NODE_ENV=production (AGENTS.md, "The two environment variables"). The
 * finished files are not uploaded: the script prints the two
 * `wrangler r2 object put` commands, because a write to the production bucket
 * is for a person to run.
 *
 * RESUMABLE, BECAUSE IT RUNS FOR HOURS. Post 33 measured RTF 0.50 on an M2 Max
 * — about five hours of generation. Each sentence's audio is cached under a
 * hash of (model, voice, sentence), so a run that is interrupted, or an article
 * edited by one paragraph, regenerates only the sentences it does not already
 * have. Run it under `caffeinate -i` so the Mac does not sleep through it.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { articleAudioKeyForPost, articleScript } from '@/lib/reader/article-audio'

const { values: args } = parseArgs({
  options: {
    post: { type: 'string' },
    env: { type: 'string', default: 'production' },
    omlx: { type: 'string', default: process.env.OMLX ?? 'http://127.0.0.1:8000' },
    model: { type: 'string', default: 'Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16' },
    voice: { type: 'string', default: 'ryan' },
    language: { type: 'string', default: 'chinese' },
    bitrate: { type: 'string', default: '48k' },
    out: { type: 'string', default: 'narration-out' },
  },
})

/** Database and bucket per environment, as `wrangler.jsonc` defines them. */
const TARGETS = {
  production: { db: 'wildrunner-org-next', bucket: 'wildrunner-storage' },
  staging: { db: 'wildrunner-org-next-staging', bucket: 'wildrunner-storage-staging' },
} as const

/**
 * Pause between sentences. Each sentence is generated on its own and Qwen3-TTS
 * leaves almost no silence at either end, so without this the joined file runs
 * every sentence into the next.
 */
const GAP_SECONDS = 0.3

/**
 * `wrangler r2 object put` refuses objects over 300 MiB; past that the upload
 * has to go through the S3 API's multipart path, which this script does not
 * print. At 48 kbit/s mono, ten hours is about 216 MB.
 */
const WRANGLER_PUT_LIMIT_BYTES = 300 * 1024 * 1024

function fail(message: string): never {
  console.error(`\n✗ ${message}`)
  process.exit(1)
}

function wranglerRows<T>(db: string, sql: string): T[] {
  const raw = execFileSync('npx', ['wrangler', 'd1', 'execute', db, '--remote', '--json', '--command', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  })
  // wrangler can print notices before the JSON; take the first array that parses.
  for (let i = raw.indexOf('['); i !== -1; i = raw.indexOf('[', i + 1)) {
    try {
      const parsed = JSON.parse(raw.slice(i)) as { results?: T[] }[]
      if (Array.isArray(parsed) && parsed[0]?.results) return parsed[0].results
    } catch {
      // not JSON at this offset
    }
  }
  fail(`could not parse wrangler's answer — the post was not read:\n${raw}`)
}

/** The sample rate in a canonical 44-byte-header WAV, which is what oMLX returns. */
function wavSampleRate(file: string): number {
  return readFileSync(file).readUInt32LE(24)
}

function hhmmss(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h${String(m).padStart(2, '0')}m`
}

async function speak(text: string, file: string): Promise<void> {
  const response = await fetch(`${args.omlx}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: args.model,
      input: text,
      voice: args.voice,
      language: args.language,
      response_format: 'wav',
    }),
  })
  if (!response.ok) {
    fail(`oMLX answered ${response.status} for: ${text}\n${await response.text()}`)
  }
  // Written beside the final name and renamed, so an interrupted run never
  // leaves a truncated file the next run would mistake for a finished one.
  const partial = `${file}.partial`
  writeFileSync(partial, Buffer.from(await response.arrayBuffer()))
  renameSync(partial, file)
}

async function main(): Promise<void> {
  const target = TARGETS[args.env as keyof typeof TARGETS]
  if (!target) fail(`--env must be production or staging, not ${args.env}`)
  const postId = Number(args.post)
  if (!Number.isInteger(postId) || postId <= 0) fail('--post <id> is required')

  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
  } catch {
    fail('ffmpeg is not installed — `brew install ffmpeg`')
  }
  const models = await fetch(`${args.omlx}/v1/models`).catch(() => null)
  if (!models?.ok) fail(`oMLX is not answering at ${args.omlx} — is it running?`)

  console.log(`Reading post ${postId} from ${target.db} …`)
  const [post] = wranglerRows<{ id: number; title: string | null; content: string | null; _status: string }>(
    target.db,
    `SELECT id, title, content, _status FROM posts WHERE id = ${postId}`,
  )
  if (!post) fail(`post ${postId} does not exist in ${target.db}`)
  // The sweep and the download endpoint both narrate published articles only.
  if (post._status !== 'published') fail(`post ${postId} is ${post._status}, not published`)

  const content = post.content ? (JSON.parse(post.content) as unknown) : null
  const key = articleAudioKeyForPost({ id: post.id, title: post.title, content })
  const lines = articleScript(post.title ?? '', content)
    .split('\n')
    .filter((line) => line.trim())
  if (lines.length === 0) fail(`post ${postId} has nothing to say`)

  const chars = lines.reduce((total, line) => total + line.length, 0)
  console.log(`“${post.title}” — ${lines.length} sentences, ${chars.toLocaleString()} characters`)
  console.log(`Key: ${key}  (voice ${args.voice}, ${args.model})`)

  const cacheDir = path.join(args.out, 'sentences')
  const workDir = path.join(args.out, path.basename(key, '.mp3'))
  mkdirSync(cacheDir, { recursive: true })
  mkdirSync(workDir, { recursive: true })

  const files: string[] = []
  const started = Date.now()
  let generated = 0
  let generatedChars = 0
  for (const [index, line] of lines.entries()) {
    const digest = createHash('sha256').update(`${args.model}\n${args.voice}\n${args.language}\n${line}`).digest('hex')
    const file = path.join(cacheDir, `${digest.slice(0, 24)}.wav`)
    files.push(file)
    if (existsSync(file) && statSync(file).size > 44) continue

    await speak(line, file)
    generated += 1
    generatedChars += line.length
    if (generated % 25 === 0 || index === lines.length - 1) {
      const elapsed = (Date.now() - started) / 1000
      const remainingChars = lines.slice(index + 1).reduce((total, rest) => total + rest.length, 0)
      const eta = (elapsed / generatedChars) * remainingChars
      console.log(`  ${index + 1}/${lines.length} sentences — ${hhmmss(elapsed)} elapsed, ~${hhmmss(eta)} to go`)
    }
  }
  console.log(`Audio ready: ${generated} sentences generated, ${lines.length - generated} from cache.`)

  // One silence file at the sentences' own sample rate, so the concat demuxer
  // sees a single stream format throughout.
  const sampleRate = wavSampleRate(files[0])
  const silence = path.join(workDir, `silence-${sampleRate}.wav`)
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'lavfi',
    '-i', `anullsrc=r=${sampleRate}:cl=mono`, '-t', String(GAP_SECONDS), '-c:a', 'pcm_s16le', silence,
  ])

  const list = path.join(workDir, 'concat.txt')
  const entries = files.flatMap((file, i) => (i === 0 ? [file] : [silence, file]))
  writeFileSync(list, entries.map((file) => `file '${path.resolve(file)}'`).join('\n') + '\n')

  const mp3 = path.join(workDir, path.basename(key))
  console.log(`Joining into ${mp3} at ${args.bitrate} mono …`)
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-ac', '1', '-c:a', 'libmp3lame', '-b:a', args.bitrate, mp3,
  ])

  // The script beside the audio, as `narrateArticle` stores it, so a sentence
  // that reads wrongly can be checked against what was actually sent.
  const txt = `${mp3}.txt`
  writeFileSync(txt, lines.join('\n'))

  const bytes = statSync(mp3).size
  const duration = Number(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3], {
      encoding: 'utf8',
    }).trim(),
  )
  console.log(`\n✓ ${mp3}\n  ${hhmmss(duration)} of audio, ${(bytes / 1024 / 1024).toFixed(1)} MB`)

  if (bytes > WRANGLER_PUT_LIMIT_BYTES) {
    fail(`the MP3 is over wrangler's 300 MiB upload limit — rerun with a lower --bitrate (e.g. 32k)`)
  }

  const object = `${target.bucket}/${key}`
  console.log(
    [
      '',
      'Listen to it first. Then, to publish, run these two commands:',
      '',
      `npx wrangler r2 object put ${object} --remote --file "${mp3}" \\`,
      `  --content-type audio/mpeg --cache-control "public, max-age=31536000, immutable"`,
      `npx wrangler r2 object put ${object}.txt --remote --file "${txt}" \\`,
      `  --content-type "text/plain; charset=utf-8"`,
      '',
      'The page picks it up on its next render: `findNarration` looks for exactly this key.',
    ].join('\n'),
  )
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })

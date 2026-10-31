/**
 * Narrate one article on this Mac, through a local TTS server, into an MP3
 * the site will play.
 *
 *   pnpm narrate:local --post 33                 # production's post 33
 *   pnpm narrate:local --post 33 --env staging   # staging's
 *   pnpm narrate:local --post 31 --temperature 0.5 --tempo 1.15
 *
 * WHY THIS EXISTS. The Worker path (`narrateArticle`) sends the whole script to
 * `minimax/speech-2.8-hd` in one call, and post 33 is 134,839 characters —
 * thirteen times what that model accepts, and about ten hours of audio, which
 * is more than a Worker can hold in memory or finish inside a request. Nothing
 * here has those limits: the voice runs locally (oMLX serving Qwen3-TTS, chosen
 * by listening — `scripts/tts-audition.py`) and ffmpeg joins the pieces.
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
 * the script unchanged whenever it cannot rewrite, so this is the same output
 * that path produces when its model is unavailable.
 *
 * READS WITH WRANGLER, WRITES NOTHING REMOTE. The post comes from
 * `wrangler d1 execute --remote`, which touches nothing — never from booting
 * Payload, which applies pending migrations on connect when
 * NODE_ENV=production (AGENTS.md, "The two environment variables"). The
 * finished files are not uploaded: the script prints the two
 * `wrangler r2 object put` commands, because a write to the production bucket
 * is for a person to run.
 *
 * THE FIRST VERSION SPOKE ONE SENTENCE PER REQUEST, AND IT SOUNDED LIKE A
 * CROWD. Run on post 33, the result changed speaker, volume and pace from
 * sentence to sentence, cut sentences short, and said things that were not in
 * the text. Every request is an independent sample at Qwen3-TTS's default
 * temperature of 0.9, so over thousands of requests every degree of freedom
 * the voice has drifts, and the shortest inputs drift furthest. A 150-sentence
 * audition had sounded steady, which is how a run of thousands shipped without
 * anyone hearing it first. What answers each symptom now:
 *
 *   - A PARAGRAPH PER REQUEST, not a sentence (`chunks`). The model paces the
 *     sentences inside it itself, which is what it is good at, and there are an
 *     order of magnitude fewer seams for anything to jump at.
 *   - A LOWER TEMPERATURE (`--temperature`, default 0.6).
 *   - EVERY PIECE IS MEASURED (`plausible`). A runaway generation is far longer
 *     than its text; a truncated one is far shorter. Either is regenerated, and
 *     anything still out of range is listed with its timestamp in `review.txt`
 *     rather than passed silently into ten hours of audio.
 *   - EVERY PIECE IS LEVELLED (`levelled`) to the same speech loudness before
 *     joining.
 *   - PACE IS SET AT ENCODE (`--tempo`, ffmpeg `atempo`). Qwen3-TTS accepts a
 *     `speed` argument and ignores it — its own source says "not directly
 *     supported yet".
 *   - THE VOICE IS CHECKED BEFORE ANYTHING RUNS (`checkVoice`). oMLX drops
 *     `voice` without a word for a model that has no preset speakers — Qwen3-TTS
 *     Base is one — and every request then gets a random speaker.
 *
 * RESUMABLE, BECAUSE IT RUNS FOR HOURS. Post 33 measured RTF 0.50 on an M2 Max
 * — about five hours of generation. Each piece's audio is cached under a hash
 * of everything that shapes it, so an interrupted run, or an article edited by
 * one paragraph, regenerates only what it does not already have. Run it under
 * `caffeinate -i` so the Mac does not sleep through it.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { articleAudioKeyForPost, articleScript } from '@/lib/reader/article-audio'
import { articleSegments } from '@/lib/reader/article-text'

const { values: args } = parseArgs({
  options: {
    post: { type: 'string' },
    env: { type: 'string', default: 'production' },
    omlx: { type: 'string', default: process.env.OMLX ?? 'http://127.0.0.1:8000' },
    model: { type: 'string', default: 'Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16' },
    voice: { type: 'string', default: 'ryan' },
    language: { type: 'string', default: 'chinese' },
    temperature: { type: 'string', default: '0.6' },
    tempo: { type: 'string', default: '1.1' },
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
 * The most characters one request carries. Qwen3-TTS stops at 2,048 codec
 * tokens — 164 seconds at 12.5 Hz — and at the 3.6 characters a second ryan
 * measured on post 33, 240 characters is about 67 seconds: well inside that,
 * so a long paragraph is split at sentence boundaries rather than truncated.
 */
const MAX_CHUNK_CHARS = 240

/** Silence between pieces of one paragraph, and between paragraphs. */
const CHUNK_GAP_SECONDS = 0.35
const BLOCK_GAP_SECONDS = 0.8

/**
 * Speaking rate the duration check expects, from the measured audition:
 * 5,246 characters of post 33 took 1,461 seconds.
 */
const EXPECTED_CHARS_PER_SECOND = 3.6

/** Tries per piece before it is accepted and listed for review. */
const ATTEMPTS = 3

/** Speech loudness every piece is levelled to, and the ceiling on its peaks. */
const TARGET_RMS = 0.1
const PEAK_CEILING = 0.89

/**
 * Bumped when anything above changes what a cached piece contains, so a cache
 * from an earlier version is never mistaken for this one's.
 */
const CACHE_VERSION = 'v2'

/**
 * `wrangler r2 object put` refuses objects over 300 MiB; past that the upload
 * has to go through the S3 API's multipart path, which this script does not
 * print. At 48 kbit/s mono, ten hours is about 216 MB.
 */
const WRANGLER_PUT_LIMIT_BYTES = 300 * 1024 * 1024

type Chunk = { text: string; gapAfter: number }
type Wav = { rate: number; samples: Int16Array }

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

/**
 * The article as requests: the title alone, then each top-level block of the
 * body, a long one split at sentence boundaries into pieces of at most
 * `MAX_CHUNK_CHARS`.
 *
 * Built from `articleSegments` run over one block at a time, and checked
 * against `articleScript` over the whole article — the text the key is hashed
 * from. If the two ever disagree this refuses to run rather than narrate
 * something the key does not describe.
 */
function chunks(title: string, content: unknown): Chunk[] {
  const blocks = ((content as { root?: { children?: unknown[] } } | null)?.root?.children ?? []).map((block) =>
    articleSegments({ root: { type: 'root', children: [block] } }),
  )

  const out: Chunk[] = title ? [{ text: title, gapAfter: BLOCK_GAP_SECONDS }] : []
  for (const sentences of blocks) {
    let current: string[] = []
    const flush = (gapAfter: number) => {
      if (current.length) out.push({ text: joinSentences(current), gapAfter })
      current = []
    }
    for (const sentence of sentences) {
      if (current.length && joinSentences([...current, sentence]).length > MAX_CHUNK_CHARS) {
        flush(CHUNK_GAP_SECONDS)
      }
      current.push(sentence)
    }
    flush(BLOCK_GAP_SECONDS)
  }

  const bare = (text: string) => text.replace(/\s+/g, '')
  const expected = bare(articleScript(title, content))
  if (bare(out.map((chunk) => chunk.text).join('')) !== expected) {
    fail('splitting by block does not reproduce articleScript — refusing to narrate text the key does not describe')
  }
  return out
}

/**
 * Sentences back into running text: nothing after a full-width mark, a space
 * after anything else, so English prose reads "Canada. It's" and not
 * "Canada.It's".
 */
function joinSentences(sentences: string[]): string {
  return sentences.reduce((text, sentence) =>
    !text || /[\u3000-\u303f\uff00-\uffef」』）]$/.test(text) ? text + sentence : `${text} ${sentence}`,
  '')
}

/** A 16-bit mono WAV, found by chunk rather than assumed to be 44 bytes of header. */
function readWav(file: string): Wav {
  const buffer = readFileSync(file)
  let rate = 0
  for (let offset = 12; offset + 8 <= buffer.length; ) {
    const id = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    if (id === 'fmt ') {
      const channels = buffer.readUInt16LE(offset + 10)
      const bits = buffer.readUInt16LE(offset + 22)
      if (channels !== 1 || bits !== 16) fail(`${file} is ${channels}ch ${bits}-bit; expected 16-bit mono`)
      rate = buffer.readUInt32LE(offset + 12)
    }
    if (id === 'data') {
      const data = buffer.subarray(offset + 8, offset + 8 + size)
      const samples = new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.length))
      if (!rate) fail(`${file} has no fmt chunk before its data`)
      return { rate, samples }
    }
    offset += 8 + size + (size % 2)
  }
  fail(`${file} has no data chunk`)
}

function writeWav(file: string, { rate, samples }: Wav): void {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + samples.byteLength, 4)
  header.write('WAVEfmt ', 8, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(samples.byteLength, 40)
  const partial = `${file}.partial`
  writeFileSync(partial, Buffer.concat([header, Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)]))
  renameSync(partial, file)
}

/**
 * Is this much audio believable for this much text? Wide on purpose — the
 * point is to catch a generation that ran on, or one that stopped, not to
 * police pace. Short texts get extra room: a five-character heading is said
 * slowly, and the fixed cost of starting and ending a phrase dominates it.
 */
function plausible(seconds: number, chars: number): { ok: boolean; expected: number } {
  const expected = chars / EXPECTED_CHARS_PER_SECOND
  const slack = chars < 20 ? 2.5 : 0
  return { ok: seconds >= expected * 0.5 && seconds <= expected * 1.8 + slack, expected }
}

/**
 * The same speech loudness for every piece. Measured over 50 ms frames that
 * carry speech — the silence a model leaves at either end would otherwise make
 * a short piece read as quiet and be boosted too far — and capped so the
 * loudest peak stays under `PEAK_CEILING`.
 */
function levelled({ rate, samples }: Wav): Wav {
  const frame = Math.max(1, Math.round(rate * 0.05))
  let sum = 0
  let count = 0
  let peak = 0
  for (let start = 0; start < samples.length; start += frame) {
    let frameSum = 0
    const end = Math.min(samples.length, start + frame)
    for (let i = start; i < end; i += 1) {
      const value = samples[i] / 32768
      frameSum += value * value
      peak = Math.max(peak, Math.abs(value))
    }
    // -40 dBFS: quieter than that is a pause, not speech.
    if (frameSum / (end - start) > 1e-4) {
      sum += frameSum
      count += end - start
    }
  }
  if (!count || !peak) return { rate, samples }
  const gain = Math.min(TARGET_RMS / Math.sqrt(sum / count), PEAK_CEILING / peak)
  const out = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i += 1) {
    out[i] = Math.max(-32768, Math.min(32767, Math.round(samples[i] * gain)))
  }
  return { rate, samples: out }
}

async function speak(text: string): Promise<Buffer> {
  const response = await fetch(`${args.omlx}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: args.model,
      input: text,
      voice: args.voice,
      language: args.language,
      temperature: Number(args.temperature),
      response_format: 'wav',
    }),
  })
  if (!response.ok) {
    fail(`oMLX answered ${response.status} for: ${text}\n${await response.text()}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

/**
 * The model has to exist under exactly this name, and the voice has to be one
 * of its preset speakers. oMLX forwards `voice` only to a model with a speaker
 * table and drops it silently otherwise, so asking a Base checkpoint for
 * `ryan` returns a different stranger for every request — the failure this
 * check is here to make loud.
 */
async function checkVoice(): Promise<void> {
  const models = await fetch(`${args.omlx}/v1/models`).catch(() => null)
  if (!models?.ok) fail(`oMLX is not answering at ${args.omlx} — is it running?`)
  const ids = ((await models.json()) as { data: { id: string }[] }).data.map((model) => model.id)
  if (!ids.includes(args.model)) {
    fail(`oMLX has no model named ${args.model}. It has:\n  ${ids.join('\n  ')}\nPass the right one with --model.`)
  }

  const listed = await fetch(`${args.omlx}/v1/audio/voices?model=${encodeURIComponent(args.model)}`)
  const voices = listed.ok ? ((await listed.json()) as { voices: string[] }).voices : []
  if (!voices.map((voice) => voice.toLowerCase()).includes(args.voice.toLowerCase())) {
    fail(
      voices.length
        ? `${args.model} has no voice "${args.voice}". It has: ${voices.join(', ')}`
        : `${args.model} has no preset voices — it is not a CustomVoice model, and every request would get a random speaker.`,
    )
  }
}

function hhmmss(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

async function main(): Promise<void> {
  const target = TARGETS[args.env as keyof typeof TARGETS]
  if (!target) fail(`--env must be production or staging, not ${args.env}`)
  const postId = Number(args.post)
  if (!Number.isInteger(postId) || postId <= 0) fail('--post <id> is required')
  const tempo = Number(args.tempo)
  // atempo takes 0.5–2.0 in one stage, and anything near either end is not narration.
  if (!(tempo >= 0.8 && tempo <= 1.5)) fail('--tempo must be between 0.8 and 1.5')
  const temperature = Number(args.temperature)
  if (!(temperature > 0 && temperature <= 1.5)) fail('--temperature must be above 0 and at most 1.5')

  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
  } catch {
    fail('ffmpeg is not installed — `brew install ffmpeg`')
  }
  await checkVoice()

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
  const pieces = chunks(post.title ?? '', content)
  if (pieces.length === 0) fail(`post ${postId} has nothing to say`)

  const chars = pieces.reduce((total, piece) => total + piece.text.length, 0)
  console.log(`“${post.title}” — ${pieces.length} pieces, ${chars.toLocaleString()} characters`)
  console.log(`Key: ${key}`)
  console.log(`Voice ${args.voice} on ${args.model}, temperature ${args.temperature}, tempo ${tempo}`)

  const cacheDir = path.join(args.out, 'pieces')
  const workDir = path.join(args.out, path.basename(key, '.mp3'))
  mkdirSync(cacheDir, { recursive: true })
  mkdirSync(workDir, { recursive: true })

  const files: string[] = []
  const review: string[] = []
  const started = Date.now()
  let generatedChars = 0
  let offset = 0
  for (const [index, piece] of pieces.entries()) {
    const digest = createHash('sha256')
      .update([CACHE_VERSION, args.model, args.voice, args.language, args.temperature, piece.text].join('\n'))
      .digest('hex')
      .slice(0, 24)
    const file = path.join(cacheDir, `${digest}.wav`)
    const flagged = path.join(cacheDir, `${digest}.review`)

    if (!existsSync(file)) {
      let best: { wav: Wav; seconds: number; distance: number } | null = null
      for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
        const raw = path.join(workDir, 'attempt.wav')
        writeFileSync(raw, await speak(piece.text))
        const wav = readWav(raw)
        const seconds = wav.samples.length / wav.rate
        const check = plausible(seconds, piece.text.length)
        const distance = Math.abs(Math.log(seconds / check.expected))
        if (!best || distance < best.distance) best = { wav, seconds, distance }
        if (check.ok) break
        console.log(`  piece ${index + 1}: ${seconds.toFixed(1)}s for ${piece.text.length} chars (expected ~${check.expected.toFixed(0)}s) — try ${attempt}/${ATTEMPTS}`)
      }
      if (!best) fail('unreachable: no attempt recorded')
      if (!plausible(best.seconds, piece.text.length).ok) writeFileSync(flagged, '')
      writeWav(file, levelled(best.wav))
      generatedChars += piece.text.length
      const elapsed = (Date.now() - started) / 1000
      const remaining = pieces.slice(index + 1).reduce((total, rest) => total + rest.text.length, 0)
      if ((index + 1) % 10 === 0 || index === pieces.length - 1) {
        console.log(
          `  ${index + 1}/${pieces.length} — ${hhmmss(elapsed)} elapsed, ~${hhmmss((elapsed / generatedChars) * remaining)} to go`,
        )
      }
    }

    // Where this piece will start in the finished file, for the review list.
    const stored = readWav(file)
    const seconds = stored.samples.length / stored.rate
    if (existsSync(flagged)) {
      review.push(`${hhmmss(offset / tempo)}  piece ${index + 1}  ${seconds.toFixed(1)}s  ${piece.text}`)
    }
    offset += seconds + piece.gapAfter
    files.push(file)
  }

  const rate = readWav(files[0]).rate
  const silences = new Map<number, string>()
  for (const gap of [CHUNK_GAP_SECONDS, BLOCK_GAP_SECONDS]) {
    const silence = path.join(workDir, `silence-${rate}-${gap}.wav`)
    writeWav(silence, { rate, samples: new Int16Array(Math.round(rate * gap)) })
    silences.set(gap, silence)
  }

  const list = path.join(workDir, 'concat.txt')
  const entries = files.flatMap((file, i) =>
    i === files.length - 1 ? [file] : [file, silences.get(pieces[i].gapAfter) as string],
  )
  writeFileSync(list, entries.map((file) => `file '${path.resolve(file)}'`).join('\n') + '\n')

  const mp3 = path.join(workDir, path.basename(key))
  console.log(`Joining into ${mp3} at ${args.bitrate} mono …`)
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    ...(tempo === 1 ? [] : ['-af', `atempo=${tempo}`]),
    '-ac', '1', '-c:a', 'libmp3lame', '-b:a', args.bitrate, mp3,
  ])

  // The script beside the audio, as `narrateArticle` stores it, so a passage
  // that reads wrongly can be checked against what was actually sent.
  const txt = `${mp3}.txt`
  writeFileSync(txt, pieces.map((piece) => piece.text).join('\n'))

  const reviewFile = path.join(workDir, 'review.txt')
  writeFileSync(reviewFile, review.join('\n') + (review.length ? '\n' : ''))

  const bytes = readFileSync(mp3).length
  const duration = Number(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3], {
      encoding: 'utf8',
    }).trim(),
  )
  console.log(`\n✓ ${mp3}\n  ${hhmmss(duration)} of audio, ${(bytes / 1024 / 1024).toFixed(1)} MB`)
  console.log(
    review.length
      ? `  ${review.length} pieces stayed out of range after ${ATTEMPTS} tries — listen at the times in ${reviewFile}`
      : '  every piece passed the length check',
  )

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

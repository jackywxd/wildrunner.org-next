/**
 * Narrate one article on this Mac, through a local TTS server, into an MP3
 * the site will play.
 *
 *   pnpm narrate:local --post 33                 # production's post 33
 *   pnpm narrate:local --post 33 --env staging   # staging's
 *   pnpm narrate:local --post 33 --limit 12      # the first 12 pieces, to listen to
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
 * `findNarration` the moment it is uploaded. Nothing below changes the text
 * the key is hashed from: the rewrite and the emoji strip are applied to the
 * copy handed to the voice.
 *
 * READS WITH WRANGLER, WRITES NOTHING REMOTE. The post comes from
 * `wrangler d1 execute --remote`, which touches nothing — never from booting
 * Payload, which applies pending migrations on connect when
 * NODE_ENV=production (AGENTS.md, "The two environment variables"). The
 * finished files are not uploaded: the script prints the two
 * `wrangler r2 object put` commands, because a write to the production bucket
 * is for a person to run.
 *
 * NOBODY CAN LISTEN TO TEN HOURS, SO EVERY PIECE IS LISTENED TO BY A MODEL.
 * The first version spoke one sentence per request and sounded like a crowd;
 * the second spoke a paragraph per request at a lower temperature and was
 * checked only for length. Transcribing the second one's post 31 back with
 * Qwen3-ASR found what a length check cannot: four characters never said, an
 * emoji spoken as 「嗯」 with the words before it swallowed, `16-18公里` as
 * 「十六，毫无公里」, `3:24完赛` as a clock time, and a paragraph with nine
 * pauses of a second each. So, in order, per piece:
 *
 *   - NUMBERS ARE REWRITTEN INTO WORDS by a local LLM (`rewrite`), with the
 *     Worker path's own prompt from `spoken-script.ts` — `3:24完赛` becomes
 *     三小时二十四分完赛. Only sentences with a digit in them are sent: the
 *     prompt changes nothing else, and post 33 has 259 of 3,374. Each line is
 *     then held to `rewriteKeepsWords`: a rewrite may add the words a number
 *     is said with and remove nothing, so 「Sub 30」 → 「三小时以内」, which
 *     the model did a dozen times, is refused and said as written. Every
 *     change, and every refusal, is listed in `rewrites.txt`.
 *   - EMOJI AND OPENING DASHES ARE REMOVED (`speakable`), because the voice
 *     makes a sound for them — 「嗯」 for ❤️, laughter for a leading `——`.
 *   - A PARAGRAPH PER REQUEST (`blocks`, `pack`), so the model paces the
 *     sentences inside it and there are an order of magnitude fewer seams.
 *   - THE LENGTH IS CHECKED (`plausible`), which still catches a runaway or a
 *     truncated generation before anything else is spent on it.
 *   - PAUSES ARE TIDIED (`tidyPauses`): silence inside a piece is capped and
 *     the silence at its ends trimmed, so the gaps this script inserts are the
 *     only gaps there are. Pause length is something the model samples — the
 *     same sentence came back with 0.9 s to 5.2 s of it — so this is done to
 *     the waveform, not by regenerating until it happens to come out short.
 *   - IT IS TRANSCRIBED AND COMPARED (`editDistance`), as sounds rather than
 *     characters so the recogniser's own homophones do not count. A piece more
 *     than `MAX_HEARD_EDITS` away from its text is regenerated; one that is
 *     still wrong after `ATTEMPTS` is listed in `review.txt` with its timestamp
 *     and what was heard, so it is read before it is listened to.
 *   - EVERY PIECE IS LEVELLED (`levelled`) to the same speech loudness.
 *   - PACE IS SET AT ENCODE (`--tempo`, ffmpeg `atempo`). Qwen3-TTS accepts a
 *     `speed` argument and ignores it — its own source says "not directly
 *     supported yet".
 *   - THE MODELS AND THE VOICE ARE CHECKED BEFORE ANYTHING RUNS
 *     (`checkModels`). oMLX drops `voice` without a word for a model that has
 *     no preset speakers — Qwen3-TTS Base is one — and every request then gets
 *     a random speaker.
 *
 * ONE PIECE AT A TIME BY DEFAULT (`--concurrency`), and that is measured,
 * not cautious. oMLX does batch concurrent Qwen3-TTS requests, and for one
 * 47-character sentence four at once took 23 s against 11 s for one. For
 * paragraph-length pieces on a 32 GB Mac it is the other way round: four at
 * once pushed oMLX from 7 GB to 22.7 GB, past its memory guard, which evicted
 * the idle Qwen3-ASR and loaded it again for the next check — over and over.
 * Over post 33's opening pieces: 4.8 characters a second at four, 3.9 at
 * two, 6.6 at one with no evictions at all.
 *
 * RESUMABLE, BECAUSE IT RUNS FOR HOURS. Each piece's audio is cached under a
 * hash of everything that shapes it, with its verdict beside it, and each
 * rewrite under a hash of its sentence — so an interrupted run, or an article
 * edited by one paragraph, regenerates only what it does not already have. Run
 * it under `caffeinate -i` so the Mac does not sleep through it.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { CHUNK_LINES, SYSTEM as REWRITE_SYSTEM, reconcileSpokenScript } from '@/lib/ai/spoken-script'
import { toSimplified } from '@/lib/i18n/to-simplified'
import { articleAudioKeyForPost, articleScript } from '@/lib/reader/article-audio'
import { articleSegments } from '@/lib/reader/article-text'

import { editDistance, rewriteKeepsWords, speakable, tidyPauses, type Wav } from './lib/narration-check'

const { values: args } = parseArgs({
  options: {
    post: { type: 'string' },
    env: { type: 'string', default: 'production' },
    omlx: { type: 'string', default: process.env.OMLX ?? 'http://127.0.0.1:8000' },
    model: { type: 'string', default: 'Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16' },
    voice: { type: 'string', default: 'ryan' },
    language: { type: 'string', default: 'chinese' },
    instruct: { type: 'string' },
    temperature: { type: 'string', default: '0.6' },
    tempo: { type: 'string', default: '1.1' },
    bitrate: { type: 'string', default: '48k' },
    'asr-model': { type: 'string', default: 'Qwen3-ASR-1.7B-8bit' },
    'rewrite-model': { type: 'string', default: 'Qwen3.6-27B-MLX-4bit' },
    'no-rewrite': { type: 'boolean', default: false },
    concurrency: { type: 'string', default: '1' },
    limit: { type: 'string' },
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

/**
 * Silence between pieces of one paragraph, and between paragraphs. Each piece
 * also keeps `EDGE_SECONDS` of its own silence at either end.
 */
const CHUNK_GAP_SECONDS = 0.35
const BLOCK_GAP_SECONDS = 0.8

/**
 * The longest silence left inside a piece, and what is kept at its ends —
 * see `tidyPauses`.
 */
const MAX_PAUSE_SECONDS = 0.5
const EDGE_SECONDS = 0.05

/**
 * Speaking rate the duration check expects, from the measured audition:
 * 5,246 characters of post 33 took 1,461 seconds. Measured on the raw
 * generation, which is what the check is applied to.
 */
const EXPECTED_CHARS_PER_SECOND = 3.6

/** Codec frames a second; `max_tokens` is counted in them. */
const CODEC_HZ = 12.5

/** Tries per piece before the best one is accepted and listed for review. */
const ATTEMPTS = 4

/**
 * How many sounds a transcript may differ from its text by.
 *
 * Calibrated on post 31's eleven pieces transcribed by Qwen3-ASR: every piece
 * a listener would pass scored 0 or 1 — the 1s being a recogniser's 「的」 for
 * 「地」 and the like — and every piece with a real fault scored 2 to 5.
 */
const MAX_HEARD_EDITS = 1

/** Speech loudness every piece is levelled to, and the ceiling on its peaks. */
const TARGET_RMS = 0.1
const PEAK_CEILING = 0.89

/**
 * Bumped when anything above changes what a cached piece contains, so a cache
 * from an earlier version is never mistaken for this one's. v3: pauses are
 * tidied, and every piece carries a transcript verdict.
 */
const CACHE_VERSION = 'v3'

/**
 * `wrangler r2 object put` refuses objects over 300 MiB; past that the upload
 * has to go through the S3 API's multipart path, which this script does not
 * print. At 48 kbit/s mono, ten hours is about 216 MB.
 */
const WRANGLER_PUT_LIMIT_BYTES = 300 * 1024 * 1024

type Chunk = { text: string; gapAfter: number }

/** What is known about a cached piece, stored beside its audio. */
type Verdict = {
  seconds: number
  edits: number
  heard: string
  plausible: boolean
  attempts: number
}

function fail(message: string): never {
  console.error(`\n✗ ${message}`)
  process.exit(1)
}

function sha(...parts: string[]): string {
  return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 24)
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
 * The article as blocks of sentences: the title alone, then each top-level
 * block of the body.
 *
 * Built from `articleSegments` run over one block at a time, and checked
 * against `articleScript` over the whole article — the text the key is hashed
 * from. If the two ever disagree this refuses to run rather than narrate
 * something the key does not describe.
 */
function blocks(title: string, content: unknown): string[][] {
  const body = ((content as { root?: { children?: unknown[] } } | null)?.root?.children ?? []).map((block) =>
    articleSegments({ root: { type: 'root', children: [block] } }),
  )
  const out = [...(title ? [[title]] : []), ...body].filter((sentences) => sentences.length > 0)

  const bare = (text: string) => text.replace(/\s+/g, '')
  if (bare(out.flat().join('')) !== bare(articleScript(title, content))) {
    fail('splitting by block does not reproduce articleScript — refusing to narrate text the key does not describe')
  }
  return out
}

/**
 * Blocks into requests: each block one piece, a long one split at sentence
 * boundaries into pieces of at most `MAX_CHUNK_CHARS`.
 */
function pack(spokenBlocks: string[][]): Chunk[] {
  const out: Chunk[] = []
  for (const sentences of spokenBlocks) {
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
  return out
}

/**
 * Sentences back into running text: nothing after a full-width mark, a space
 * after anything else, so English prose reads "Canada. It's" and not
 * "Canada.It's".
 */
function joinSentences(sentences: string[]): string {
  return sentences.reduce((text, sentence) =>
    !text || /[　-〿＀-￯」』）]$/.test(text) ? text + sentence : `${text} ${sentence}`,
  '')
}

/**
 * Run `task` over `items`, at most `limit` at a time, results in input order.
 */
async function pool<T, R>(items: T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await task(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/**
 * Every sentence with a digit in it, said the way a person would say it.
 *
 * The Worker path's prompt and its line-count reconciliation, unchanged — the
 * prompt only ever touches numbers, so a sentence without a digit has nothing
 * for it to do and is not sent. Each line it returns is then held to
 * `rewriteKeepsWords`; one that fails keeps its original wording.
 *
 * One request at a time, whatever `--concurrency` says. The 27B model takes
 * 15.6 GB of the ~19.7 GB oMLX is allowed on a 32 GB Mac, and four prompts
 * prefilling at once were refused by its memory guard — some as a 400, some
 * as a 200 whose body has no `choices`, which is why that shape is checked
 * rather than assumed.
 *
 * Cached per sentence, so an edited article — or a run stopped halfway
 * through this step — rewrites only the sentences it does not have. Returns
 * the rewritten blocks and the list of changes, for `rewrites.txt`.
 */
async function rewrite(input: string[][], cacheDir: string) {
  const model = args['rewrite-model']
  const cached = (sentence: string) => path.join(cacheDir, `${sha(model, REWRITE_SYSTEM, sentence)}.txt`)
  const wanted = [...new Set(input.flat().filter((sentence) => /\d/.test(sentence)))]
  const missing = wanted.filter((sentence) => !existsSync(cached(sentence)))

  const requests: string[][] = []
  for (let i = 0; i < missing.length; i += CHUNK_LINES) requests.push(missing.slice(i, i + CHUNK_LINES))
  if (requests.length) {
    console.log(`Rewriting numbers in ${missing.length} sentences with ${model} (${requests.length} requests) …`)
  }

  let done = 0
  await pool(requests, 1, async (lines) => {
    const chunk = lines.join('\n')
    const response = await request('to rewrite numbers', () => fetch(`${args.omlx}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: REWRITE_SYSTEM },
          { role: 'user', content: chunk },
        ],
        temperature: 0,
        max_tokens: 2048,
        // Qwen3.6 thinks by default, and line-for-line number rewriting does
        // not need it — the reason `spoken-script.ts` stopped using Kimi.
        chat_template_kwargs: { enable_thinking: false },
      }),
    }))
    const body = await response.text()
    const reply = (JSON.parse(body) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message
      ?.content
    if (reply === undefined) fail(`oMLX answered the rewrite with no reply in it:\n${body}\nRerun to continue.`)
    // A reply with the wrong number of lines comes back as the chunk itself,
    // which is narrating as written — exactly as the Worker path degrades.
    const out = reconcileSpokenScript(chunk, reply).split('\n')
    lines.forEach((line, i) => writeFileSync(cached(line), out[i]))
    done += 1
    if (done % 5 === 0 || done === requests.length) console.log(`  ${done}/${requests.length} rewrite requests`)
  })

  // The prompt's rule 6 asks for Traditional, which is right for this site's
  // own writing and wrong for an article written in Simplified: post 31 came
  // back as 「紐約據說…」 and the voice garbled it on all four tries. So the
  // rewrite is put back into the article's own script. Decided per article,
  // not per sentence — `跑了307` contains nothing that tells the two apart.
  const characters = [...input.flat().join('')]
  const isSimplified =
    characters.filter((character) => toSimplified(character) !== character).length < characters.length * 0.005

  const changes: string[] = []
  const spoken = input.map((sentences) =>
    sentences.map((sentence) => {
      if (!/\d/.test(sentence)) return sentence
      const reply = readFileSync(cached(sentence), 'utf8')
      const proposed = isSimplified ? toSimplified(reply) : reply
      if (proposed === sentence) return sentence
      if (!rewriteKeepsWords(sentence, proposed)) {
        changes.push(`✗ said as written — the rewrite changed words, not only numbers\n  ${sentence}\n  ${proposed}`)
        return sentence
      }
      changes.push(`  ${sentence}\n→ ${proposed}`)
      return proposed
    }),
  )
  return { spoken, changes }
}

/** A 16-bit mono WAV, found by chunk rather than assumed to be 44 bytes of header. */
function parseWav(buffer: Buffer, name: string): Wav {
  let rate = 0
  for (let offset = 12; offset + 8 <= buffer.length; ) {
    const id = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    if (id === 'fmt ') {
      const channels = buffer.readUInt16LE(offset + 10)
      const bits = buffer.readUInt16LE(offset + 22)
      if (channels !== 1 || bits !== 16) fail(`${name} is ${channels}ch ${bits}-bit; expected 16-bit mono`)
      rate = buffer.readUInt32LE(offset + 12)
    }
    if (id === 'data') {
      const data = buffer.subarray(offset + 8, offset + 8 + size)
      const samples = new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.length))
      if (!rate) fail(`${name} has no fmt chunk before its data`)
      return { rate, samples }
    }
    offset += 8 + size + (size % 2)
  }
  fail(`${name} has no data chunk`)
}

function encodeWav({ rate, samples }: Wav): Buffer {
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
  return Buffer.concat([header, Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)])
}

/** Written beside and renamed into place, so an interrupted run leaves no half file. */
function writeAtomic(file: string, data: Buffer | string): void {
  const partial = `${file}.partial`
  writeFileSync(partial, data)
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

/**
 * One oMLX request, tried again on failure — three times, ten seconds apart.
 *
 * Not to paper over a fault in what is being checked: this is the transport,
 * on a run that lasts the night. oMLX aborts in-flight requests when memory
 * pressure turns hard (its log: "Aborted 4 requests due to memory pressure"),
 * and without this one such moment at hour three ends the run. Every failure
 * is printed; one that persists still stops everything.
 */
async function request(what: string, send: () => Promise<Response>): Promise<Response> {
  for (let attempt = 1; ; attempt += 1) {
    const response = await send().catch((error: unknown) => error as Error)
    if (response instanceof Response && response.ok) return response
    const reason = response instanceof Response ? `${response.status} ${await response.text()}` : String(response)
    if (attempt === 3) fail(`oMLX failed ${what} three times; the last answer was:\n${reason}`)
    console.log(`  oMLX failed ${what} (${reason.slice(0, 200)}) — retrying in 10 s`)
    await new Promise((resolve) => setTimeout(resolve, 10_000))
  }
}

async function speak(text: string): Promise<Wav> {
  const response = await request(`to speak “${text.slice(0, 20)}…”`, () => fetch(`${args.omlx}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: args.model,
      input: text,
      voice: args.voice,
      language: args.language,
      ...(args.instruct ? { instructions: args.instruct } : {}),
      temperature: Number(args.temperature),
      // A ceiling on a runaway: two and a half times the expected length, so
      // one that would have talked for the model's full 8,192 frames — eleven
      // minutes — stops early and fails `plausible` instead.
      max_tokens: Math.ceil((text.length / EXPECTED_CHARS_PER_SECOND) * 2.5 * CODEC_HZ) + 50,
      response_format: 'wav',
    }),
  }))
  return parseWav(Buffer.from(await response.arrayBuffer()), 'oMLX speech')
}

/**
 * What the recogniser hears in a piece.
 *
 * No `prompt`, deliberately: oMLX passes it to Qwen3-ASR as context, which
 * biases recognition toward that text — and handing it the text being checked
 * would teach it to hear what should have been said instead of what was.
 */
async function transcribe(wav: Wav): Promise<string> {
  // A generation that was silence throughout tidies down to nothing, and
  // nothing is what was heard — an attempt that failed, not a run that stops.
  if (wav.samples.length === 0) return ''
  const response = await request('to transcribe a piece', () => {
    const form = new FormData()
    form.append('model', args['asr-model'])
    form.append('language', 'zh')
    form.append('file', new Blob([new Uint8Array(encodeWav(wav))], { type: 'audio/wav' }), 'piece.wav')
    return fetch(`${args.omlx}/v1/audio/transcriptions`, { method: 'POST', body: form })
  })
  return ((await response.json()) as { text: string }).text
}

/**
 * One piece, generated until it says its text or the attempts run out.
 *
 * Every attempt is tidied, levelled and transcribed, and the best one kept:
 * plausible first, then fewest sounds wrong, then closest to the expected
 * length. A piece already in the cache with a verdict beside it is returned as
 * it is.
 */
async function ensurePiece(text: string, cacheDir: string): Promise<{ file: string; verdict: Verdict; fresh: boolean }> {
  const digest = sha(
    CACHE_VERSION,
    args.model,
    args.voice,
    args.language,
    args.instruct ?? '',
    args.temperature,
    args['asr-model'],
    text,
  )
  const file = path.join(cacheDir, `${digest}.wav`)
  const meta = path.join(cacheDir, `${digest}.json`)
  if (existsSync(file) && existsSync(meta)) {
    // Scored again from the stored transcript, so a change to how text and
    // transcript are compared reaches every cached piece without one being
    // regenerated — the 的/地 fix cleared a piece that had been failed for it.
    const verdict = JSON.parse(readFileSync(meta, 'utf8')) as Verdict
    return { file, verdict: { ...verdict, edits: editDistance(text, verdict.heard) }, fresh: false }
  }

  // Lower is better, compared in order: plausible, sounds wrong, length.
  const worse = (a: number[], b: number[]) => {
    const i = a.findIndex((value, j) => value !== b[j])
    return i !== -1 && a[i] > b[i]
  }
  let best: { wav: Wav; verdict: Verdict; score: number[] } | null = null
  let attempts = 0
  while (attempts < ATTEMPTS) {
    attempts += 1
    const raw = await speak(text)
    const check = plausible(raw.samples.length / raw.rate, text.length)
    const wav = tidyPauses(levelled(raw), { maxPause: MAX_PAUSE_SECONDS, edge: EDGE_SECONDS })
    const heard = await transcribe(wav)
    const edits = editDistance(text, heard)
    const verdict: Verdict = { seconds: wav.samples.length / wav.rate, edits, heard, plausible: check.ok, attempts: 0 }
    const score = [check.ok ? 0 : 1, edits, Math.abs(Math.log(raw.samples.length / raw.rate / check.expected))]
    if (!best || worse(best.score, score)) best = { wav, verdict, score }
    if (passed(verdict)) break
  }
  if (!best) fail('unreachable: no attempt recorded')
  best.verdict.attempts = attempts
  writeAtomic(file, encodeWav(best.wav))
  writeAtomic(meta, JSON.stringify(best.verdict))
  return { file, verdict: best.verdict, fresh: true }
}

function passed(verdict: Verdict): boolean {
  return verdict.plausible && verdict.edits <= MAX_HEARD_EDITS
}

/**
 * Every model has to exist under exactly this name, and the voice has to be
 * one of the TTS model's preset speakers. oMLX forwards `voice` only to a model
 * with a speaker table and drops it silently otherwise, so asking a Base
 * checkpoint for `ryan` returns a different stranger for every request — the
 * failure this check is here to make loud.
 */
async function checkModels(): Promise<void> {
  const models = await fetch(`${args.omlx}/v1/models`).catch(() => null)
  if (!models?.ok) fail(`oMLX is not answering at ${args.omlx} — is it running?`)
  const ids = ((await models.json()) as { data: { id: string }[] }).data.map((model) => model.id)
  const needed: [string, string][] = [
    ['--model', args.model],
    ['--asr-model', args['asr-model']],
    ...(args['no-rewrite'] ? [] : [['--rewrite-model', args['rewrite-model']] as [string, string]]),
  ]
  for (const [flag, name] of needed) {
    if (!ids.includes(name)) {
      fail(`oMLX has no model named ${name}. It has:\n  ${ids.join('\n  ')}\nPass the right one with ${flag}.`)
    }
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
  const concurrency = Number(args.concurrency)
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) fail('--concurrency must be 1 to 8')
  const limit = args.limit === undefined ? undefined : Number(args.limit)
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) fail('--limit must be a positive whole number')

  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
  } catch {
    fail('ffmpeg is not installed — `brew install ffmpeg`')
  }
  await checkModels()

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
  const written = blocks(post.title ?? '', content)
  if (written.length === 0) fail(`post ${postId} has nothing to say`)

  const cacheDir = path.join(args.out, 'pieces')
  const rewriteDir = path.join(args.out, 'rewrites')
  const workDir = path.join(args.out, path.basename(key, '.mp3'))
  for (const dir of [cacheDir, rewriteDir, workDir]) mkdirSync(dir, { recursive: true })

  console.log(`“${post.title}”`)
  console.log(`Key: ${key}`)
  const { spoken, changes } = args['no-rewrite']
    ? { spoken: written, changes: [] as string[] }
    : await rewrite(written, rewriteDir)
  const rewritesFile = path.join(workDir, 'rewrites.txt')
  writeFileSync(rewritesFile, changes.join('\n\n') + (changes.length ? '\n' : ''))

  const all = pack(spoken.map((sentences) => sentences.map(speakable).filter(Boolean)))
  const pieces = limit === undefined ? all : all.slice(0, limit)
  const chars = pieces.reduce((total, piece) => total + piece.text.length, 0)
  console.log(
    `${pieces.length}${limit === undefined ? '' : ` of ${all.length}`} pieces, ${chars.toLocaleString()} characters; ` +
      `${changes.filter((change) => !change.startsWith('✗')).length} sentences rewritten, ` +
      `${changes.filter((change) => change.startsWith('✗')).length} said as written (${rewritesFile})`,
  )
  console.log(
    `Voice ${args.voice} on ${args.model}, temperature ${args.temperature}, tempo ${tempo}` +
      `${args.instruct ? `, instruct “${args.instruct}”` : ''}; checked by ${args['asr-model']}`,
  )

  const started = Date.now()
  let generatedChars = 0
  let remainingChars = chars
  let completed = 0
  const results = await pool(pieces, concurrency, async (piece) => {
    const result = await ensurePiece(piece.text, cacheDir)
    completed += 1
    remainingChars -= piece.text.length
    if (result.fresh) {
      generatedChars += piece.text.length
      if (!passed(result.verdict)) {
        console.log(
          `  ✗ ${result.verdict.edits} sounds wrong${result.verdict.plausible ? '' : ', implausible length'} ` +
            `after ${ATTEMPTS} tries: ${piece.text.slice(0, 40)}…`,
        )
      }
    }
    if (completed % 10 === 0 || completed === pieces.length) {
      const elapsed = (Date.now() - started) / 1000
      const eta = generatedChars ? `, ~${hhmmss((elapsed / generatedChars) * remainingChars)} to go` : ''
      console.log(`  ${completed}/${pieces.length} — ${hhmmss(elapsed)} elapsed${eta}`)
    }
    return result
  })

  const review: string[] = []
  let offset = 0
  for (const [index, { verdict }] of results.entries()) {
    if (!passed(verdict)) {
      const why = [verdict.plausible ? '' : 'implausible length', verdict.edits > MAX_HEARD_EDITS ? `${verdict.edits} sounds wrong` : '']
        .filter(Boolean)
        .join(', ')
      review.push(
        `${hhmmss(offset / tempo)}  piece ${index + 1}  ${why}\n  text:  ${pieces[index].text}\n  heard: ${verdict.heard}`,
      )
    }
    offset += verdict.seconds + pieces[index].gapAfter
  }

  const rate = parseWav(readFileSync(results[0].file), results[0].file).rate
  const silences = new Map<number, string>()
  for (const gap of [CHUNK_GAP_SECONDS, BLOCK_GAP_SECONDS]) {
    const silence = path.join(workDir, `silence-${rate}-${gap}.wav`)
    writeAtomic(silence, encodeWav({ rate, samples: new Int16Array(Math.round(rate * gap)) }))
    silences.set(gap, silence)
  }

  const list = path.join(workDir, 'concat.txt')
  const entries = results.flatMap(({ file }, i) =>
    i === results.length - 1 ? [file] : [file, silences.get(pieces[i].gapAfter) as string],
  )
  writeFileSync(list, entries.map((file) => `file '${path.resolve(file)}'`).join('\n') + '\n')

  // An audition is never named like the real file, so it cannot be uploaded by mistake.
  const mp3 =
    limit === undefined
      ? path.join(workDir, path.basename(key))
      : path.join(workDir, `audition-${args.voice}-t${args.temperature}-x${tempo}-${pieces.length}.mp3`)
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

  // An audition's review is named after it, so two auditions side by side
  // do not overwrite each other's.
  const reviewFile = limit === undefined ? path.join(workDir, 'review.txt') : mp3.replace(/\.mp3$/, '.review.txt')
  writeFileSync(reviewFile, review.join('\n\n') + (review.length ? '\n' : ''))

  const bytes = readFileSync(mp3).length
  const duration = Number(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3], {
      encoding: 'utf8',
    }).trim(),
  )
  const byEdits = new Map<number, number>()
  for (const { verdict } of results) byEdits.set(verdict.edits, (byEdits.get(verdict.edits) ?? 0) + 1)
  const retried = results.filter(({ verdict }) => verdict.attempts > 1).length
  const generating = (Date.now() - started) / 1000
  console.log(`\n✓ ${mp3}\n  ${hhmmss(duration)} of audio, ${(bytes / 1024 / 1024).toFixed(1)} MB`)
  if (generatedChars) {
    console.log(
      `  generated ${generatedChars.toLocaleString()} characters in ${hhmmss(generating)} — ` +
        `${(generatedChars / generating).toFixed(1)} a second at --concurrency ${concurrency}`,
    )
  }
  console.log(
    `  sounds wrong per piece: ${[...byEdits].sort(([a], [b]) => a - b).map(([edits, n]) => `${edits}×${n}`).join('  ')}` +
      ` — ${retried} pieces needed more than one try`,
  )
  console.log(
    review.length
      ? `  ${review.length} pieces still failed after ${ATTEMPTS} tries — read ${reviewFile}, then listen at its times`
      : '  every piece was heard back as its text',
  )

  if (limit !== undefined) {
    console.log('\nAn audition of the first pieces only — listen to it; nothing here is for upload.')
    return
  }

  if (bytes > WRANGLER_PUT_LIMIT_BYTES) {
    fail(`the MP3 is over wrangler's 300 MiB upload limit — rerun with a lower --bitrate (e.g. 32k)`)
  }

  const object = `${target.bucket}/${key}`
  console.log(
    [
      '',
      'Listen to it first, starting with review.txt. Then, to publish, run these two commands:',
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

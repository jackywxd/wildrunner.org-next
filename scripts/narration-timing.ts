/**
 * Give the narrations already in production a timing table, so the page can
 * follow the voice.
 *
 *   pnpm narration:timing --post 2     # one article
 *   pnpm narration:timing --all        # every published article that needs one
 *
 * WHY THIS EXISTS. A Worker generated those narrations and kept no timing.
 * `narrate-local` knows where its own pieces start because it joined them; for
 * audio made elsewhere the only way to know is to read it off the finished MP3.
 * This forced-aligns each narration's `<key>.txt` (the script as spoken, one
 * line per line of `articleScript`) against the MP3 with
 * `scripts/align-narration.py`, windowed because that refuses audio over 300 s
 * (`lib/narration-align.ts` says how), and writes `<key>.json` beside it
 * locally. It prints the `wrangler r2 object put` commands; running them is the
 * user's.
 *
 * EVERYTHING IT READS IS PUBLIC, and it writes nothing remote. Posts come from
 * the anonymous REST API, which returns published posts only (`ownedOnly`
 * in `src/access`); the narration objects from the public R2 domain. Neither
 * needs a Cloudflare account, so this runs without wrangler, without a login
 * and without Payload: only the final `put` needs the user's wrangler session.
 * (The plan said to read D1 and R2 through `wrangler ... --remote`; that would
 * have put a deployed database and bucket behind a script that has no reason to
 * touch them.) The posts are fetched as `depth=0, select title+content` — the
 * two fields `articleAudioKeyForPost` hashes — so the key computed here is the
 * key the page computes from the same stored words.
 *
 * WHAT IT SKIPS, each reported with its reason:
 *  - no MP3 under the key: the narration is of an older version of the words,
 *    and the page only follows a current one;
 *  - a `.json` already there: nothing to add (and re-aligning would replace a
 *    table, e.g. a `pieces` one, that is exact, with one that is not);
 *  - a script over `MAX_SCRIPT_CHARS`: only `narrate:local` makes those, and
 *    its `--timing-only` gives exact starts. Post 33 is a 7-hour file, which
 *    this must never try to align;
 *  - a post `narrationPlan` cannot describe: no paragraph to highlight.
 * One post's refusal does not stop the others; the exit status is non-zero if
 * any was refused.
 *
 * NOTHING IS TRUSTED UNTIL IT HAS BEEN COUNTED: the downloaded bytes against
 * `content-length`, the `.txt` lines against `articleScript`, the table against
 * `parseTiming` and against what `canFollow` will ask of it on the page.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import {
  MAX_SCRIPT_CHARS,
  articleAudioKeyForPost,
  articleScript,
} from "../src/lib/reader/article-audio";
import { narrationPlan } from "../src/lib/reader/article-text";
import { parseTiming } from "../src/lib/reader/narration-timing";
import { ForcedAligner, clipAligner, probeSeconds } from "./lib/forced-aligner";
import { alignLines } from "./lib/narration-align";

/** The site's own REST API; anonymous requests see published posts only. */
const SITE_ORIGIN = "https://wildrunner.org";
/** Production's `R2_PUBLIC_URL` (`wrangler.jsonc`, top-level vars). */
const R2_ORIGIN = "https://images.wildrunner.org";
const BUCKET = "wildrunner-storage";
/** Gitignored (`/narration-out/`); one directory per narration, reused between runs. */
const OUT = "narration-out/aligned";

type Post = { id: number; title: string; content: unknown };
type Outcome = { post: number; kind: "done" | "skipped" | "refused"; why?: string; key?: string; put?: string[] };

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} answered ${response.status}`);
  return response.json();
}

async function loadPosts(only: number | null): Promise<Post[]> {
  if (only !== null) {
    return [(await getJson(`${SITE_ORIGIN}/api/posts/${only}?depth=0`)) as Post];
  }
  // Brackets URL-encoded; `limit` above the corpus so that "all" is one page,
  // and a second page is an error rather than a silently shorter list.
  const page = (await getJson(
    `${SITE_ORIGIN}/api/posts?depth=0&limit=100&select%5Btitle%5D=true&select%5Bcontent%5D=true`,
  )) as { docs: Post[]; hasNextPage: boolean; totalDocs: number };
  if (page.hasNextPage) {
    throw new Error(`there are ${page.totalDocs} published posts and this reads one page of 100 — add paging before using --all`);
  }
  return page.docs;
}

/** Content length of an object, or null if it is not there. */
async function head(url: string): Promise<{ status: number; length: number | null; encoded: boolean }> {
  const response = await fetch(url, { method: "HEAD" });
  const length = response.headers.get("content-length");
  return {
    status: response.status,
    length: length === null ? null : Number(length),
    encoded: Boolean(response.headers.get("content-encoding")),
  };
}

/**
 * The object's bytes at `file`, reusing a copy of the right size.
 *
 * A mismatch with `content-length` is a truncated download, and a truncated MP3
 * would measure a shorter duration and yield a table for a file that is not
 * the one in the bucket. Text may be compressed in transit (`fetch` hands back
 * the decoded body, so its size is not the header's); that case is not size
 * checked, and the line count is the check on it instead.
 */
async function download(url: string, file: string, expected: number | null, encoded: boolean): Promise<void> {
  if (expected !== null && !encoded && existsSync(file) && statSync(file).size === expected) return;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} answered ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (expected !== null && !encoded && bytes.length !== expected) {
    throw new Error(`downloaded ${bytes.length} bytes from ${url} but content-length says ${expected}`);
  }
  writeFileSync(file, bytes);
}

async function timePost(post: Post, out: string, aligner: () => ForcedAligner): Promise<Outcome> {
  const skip = (why: string): Outcome => ({ post: post.id, kind: "skipped", why });
  const key = articleAudioKeyForPost(post);
  const script = articleScript(post.title ?? "", post.content);

  const audio = await head(`${R2_ORIGIN}/${key}`);
  if (audio.status === 404) return skip(`not narrated: no ${key} — the narration is of other words, and the page only follows a current one`);
  if (audio.status !== 200 || audio.length === null) throw new Error(`HEAD ${key} answered ${audio.status}`);

  const existing = await head(`${R2_ORIGIN}/${key}.json`);
  if (existing.status === 200) return skip(`already has a table: ${key}.json`);
  if (existing.status !== 404) throw new Error(`HEAD ${key}.json answered ${existing.status}`);

  if (script.length > MAX_SCRIPT_CHARS) {
    return skip(
      `narrated locally: ${script.length} characters is over ${MAX_SCRIPT_CHARS}, so only narrate:local can have made it — ` +
        `run \`pnpm narrate:local --post ${post.id} --timing-only\``,
    );
  }
  const plan = narrationPlan(post.title ?? "", post.content);
  if (!plan) return skip("nothing to follow: narrationPlan is null, so the page tags no paragraph");

  const cache = path.join(out, path.basename(key, ".mp3"));
  mkdirSync(cache, { recursive: true });
  const mp3 = path.join(cache, path.basename(key));
  const txt = `${mp3}.txt`;
  await download(`${R2_ORIGIN}/${key}`, mp3, audio.length, false);
  const spoken = await head(`${R2_ORIGIN}/${key}.txt`);
  if (spoken.status !== 200) throw new Error(`HEAD ${key}.txt answered ${spoken.status} — nothing to align against`);
  await download(`${R2_ORIGIN}/${key}.txt`, txt, spoken.length, spoken.encoded);

  // Line for line: the table says "line i starts at t", and i is a position in
  // `articleScript(...).split("\n")`.
  const lines = readFileSync(txt, "utf8").split("\n");
  const expectedLines = script.split("\n").length;
  if (lines.length !== expectedLines) {
    throw new Error(`${key}.txt has ${lines.length} lines but articleScript has ${expectedLines}`);
  }
  const followLines = (plan.titled ? 1 : 0) + plan.blocks.reduce((a, b) => a + b, 0);
  if (followLines !== lines.length) {
    throw new Error(`the page expects ${followLines} lines (narrationPlan) but the script has ${lines.length}`);
  }

  const duration = probeSeconds(mp3);
  console.log(`${key}: ${lines.length} lines, ${duration.toFixed(1)} s, ${audio.length} bytes`);

  const result = await alignLines({ lines, duration, align: clipAligner(aligner(), mp3, cache) });
  for (const [i, w] of result.windows.entries()) {
    console.log(
      `  window ${i + 1}: ${w.from.toFixed(1)}-${w.to.toFixed(1)} s, fed lines ${w.fedFrom + 1}-${w.fedTo + 1}, ` +
        `kept ${w.acceptedFrom + 1}-${w.acceptedTo + 1}` +
        (i < result.windows.length - 1
          ? `, overlap with next: ${w.overlapChecked} lines, max ${w.overlapMax.toFixed(2)} s`
          : ""),
    );
  }
  console.log(
    `  overlap: ${result.overlapChecked} lines placed twice, largest disagreement ${result.maxOverlapDisagreement.toFixed(2)} s`,
  );

  const table = {
    version: 1,
    audio: key,
    bytes: audio.length,
    duration: Math.round(duration * 100) / 100,
    lines: lines.length,
    precision: "block",
    source: "aligned",
    starts: result.starts,
  };
  const parsed = parseTiming(table);
  if (!parsed || parsed.audio !== key) throw new Error("the table it built does not pass parseTiming");

  const file = `${mp3}.json`;
  writeFileSync(file, JSON.stringify(table));
  return {
    post: post.id,
    kind: "done",
    key,
    put: [
      `npx wrangler r2 object put ${BUCKET}/${key}.json --remote --file "${file}" \\`,
      `  --content-type application/json`,
    ],
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      post: { type: "string" },
      all: { type: "boolean", default: false },
    },
  });
  if (Boolean(values.post) === values.all) {
    console.error("Usage: pnpm narration:timing --post N | --all");
    return 2;
  }
  const only = values.post === undefined ? null : Number(values.post);
  if (only !== null && !Number.isInteger(only)) {
    console.error(`--post wants a post id, got ${values.post}`);
    return 2;
  }

  const posts = await loadPosts(only);
  let child: ForcedAligner | null = null;
  const aligner = () => (child ??= new ForcedAligner());

  const outcomes: Outcome[] = [];
  try {
    for (const post of posts) {
      try {
        const outcome = await timePost(post, OUT, aligner);
        outcomes.push(outcome);
        if (outcome.kind === "skipped") console.log(`post ${post.id}: skipped — ${outcome.why}`);
      } catch (error) {
        // A dead aligner fails every later post the same way; that is reported
        // per post rather than hidden, and the run still ends.
        const why = (error as Error).message;
        outcomes.push({ post: post.id, kind: "refused", why });
        console.log(`post ${post.id}: REFUSED — ${why}`);
      }
    }
  } finally {
    (child as ForcedAligner | null)?.close();
  }

  const done = outcomes.filter((o) => o.kind === "done");
  const refused = outcomes.filter((o) => o.kind === "refused");
  console.log(
    `\n${done.length} tables written, ${outcomes.filter((o) => o.kind === "skipped").length} skipped, ${refused.length} refused.`,
  );
  if (done.length) {
    console.log(
      [
        "",
        "Listen to a few first. Then, to publish (the MP3s are already up; the page uses a table only while its size matches that MP3):",
        "",
        ...done.flatMap((o) => o.put as string[]),
        "",
        "Then, for each, expect 200:",
        ...done.map((o) => {
          return `curl -s -o /dev/null -w "%{http_code}\\n" "${SITE_ORIGIN}/api/article-audio/${o.post}/timing?key=${encodeURIComponent(o.key as string)}"`;
        }),
      ].join("\n"),
    );
  }
  return refused.length ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });

/**
 * Put one narration into LOCAL R2, so the listening journey has something to
 * play.
 *
 * WHY THIS EXISTS. The page decides an article is narrated by asking R2 for
 * the key its words hash to (`findNarration`). A seeded corpus has no audio,
 * and the real generator is a paid model call, so without this the player
 * never renders and the journey would be testing the device-voice reader
 * instead. The file is the small fixture in `e2e/fixtures/`; the key is worked
 * out by `articleAudioKeyForPost` from the article as the database holds it,
 * and by nothing else — a hand-built key is the bug that once left three paid
 * narrations unreachable (see `article-audio.ts`).
 *
 * IT RUNS EVERY TIME, in CI as well as after `db:reset:local`, and is
 * deliberately NOT one of `SEED_STEPS`. CI caches `.wrangler/state/v3/d1` and
 * nothing else, so on a cache hit the database is restored and R2 is empty;
 * putting this in the cached list would make the player vanish exactly when
 * the cache works. It only adds an object under a key derived from a row, so
 * running it twice writes the same bytes to the same key.
 *
 * `--local` ON EVERY wrangler CALL, and that is the whole safety argument:
 * `wrangler.jsonc` marks the R2 bucket `remote: true`, so a wrangler command
 * without the flag talks to the real bucket. Refusals below are the second
 * line, not the first. `execFileSync` with an argument array, not `execSync`
 * with a string — `corpus.mjs` records what `/bin/sh` does to a backtick.
 *
 * Reads the object back and compares the bytes: a put that reports success is
 * not the same as the page finding what it put.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  NARRATED_SLUG,
  NARRATION_BYTES,
  NARRATION_DURATION_SECONDS,
  NARRATION_FILE,
} from "../e2e/fixtures/narration";
import { articleAudioKeyForPost, articleScript } from "../src/lib/reader/article-audio";
import { parseTiming } from "../src/lib/reader/narration-timing";

if (process.env.CLOUDFLARE_ENV) {
  console.error(
    `Refusing to run: CLOUDFLARE_ENV=${process.env.CLOUDFLARE_ENV} selects a ` +
      `deployed environment. This writes to *local* emulated R2 only.`,
  );
  process.exit(1);
}
if (process.env.NODE_ENV === "production") {
  console.error(
    "Refusing to run: NODE_ENV=production makes the adapter reach real bindings.",
  );
  process.exit(1);
}

const DATABASE = "wildrunner-org-next";
const BUCKET = "wildrunner-storage";

function wrangler(args: string[]): string {
  return execFileSync("npx", ["wrangler", ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
  });
}

function main() {
  // The slug goes into SQL by string, so it is checked rather than escaped:
  // it is a constant in this repository and a path, nothing else.
  if (!/^[A-Za-z0-9/_-]+$/.test(NARRATED_SLUG)) {
    throw new Error(`NARRATED_SLUG is not a plain path: ${NARRATED_SLUG}`);
  }

  const raw = wrangler([
    "d1",
    "execute",
    DATABASE,
    "--local",
    "--json",
    "--command",
    `SELECT id, title, content FROM posts WHERE slug = '${NARRATED_SLUG}' AND _status = 'published'`,
  ]);
  const rows = JSON.parse(raw)?.[0]?.results as
    | { id: number; title: string; content: string | null }[]
    | undefined;
  if (!rows || rows.length !== 1 || !rows[0].content) {
    throw new Error(
      `expected exactly one published post with a body at ${NARRATED_SLUG}, ` +
        `got ${rows ? rows.length : "an unreadable result"} — reseed with pnpm db:reset:local`,
    );
  }
  const { id, title, content } = rows[0];
  const key = articleAudioKeyForPost({ id, title, content: JSON.parse(content) });

  // A FIXTURE, AND ONLY A FIXTURE. One start per line of the script, spaced
  // evenly over the 120 s clip, so the journey has a table to follow. Evenly
  // spaced starts are exactly what must never be produced for real audio:
  // nothing corrects them, so the error grows to the end of the file
  // (PLAN-narration-follow.md, risk 3). Real tables come from
  // `narrate-local.ts` (known piece boundaries) or forced alignment.
  const lines = articleScript(title, JSON.parse(content)).split("\n").length;
  const timing = parseTiming({
    version: 1,
    audio: key,
    bytes: NARRATION_BYTES,
    duration: NARRATION_DURATION_SECONDS,
    lines,
    precision: "block",
    source: "pieces",
    starts: Array.from(
      { length: lines },
      (_, i) => Math.round(((i * NARRATION_DURATION_SECONDS) / lines) * 100) / 100,
    ),
  });
  if (!timing) throw new Error("the fixture timing does not pass parseTiming — fix the seed, not the parser");
  const timingJson = JSON.stringify(timing);

  const bytes = readFileSync(NARRATION_FILE);
  if (bytes.length !== NARRATION_BYTES) {
    throw new Error(
      `${NARRATION_FILE} is ${bytes.length} bytes; e2e/fixtures/narration.ts says ` +
        `${NARRATION_BYTES}. Update one of them — and check it is not an LFS pointer.`,
    );
  }

  wrangler([
    "r2",
    "object",
    "put",
    `${BUCKET}/${key}`,
    "--local",
    "--file",
    NARRATION_FILE,
    "--content-type",
    "audio/mpeg",
  ]);

  const scratch = mkdtempSync(path.join(tmpdir(), "seed-e2e-narration-"));
  try {
    const back = path.join(scratch, "back.mp3");
    wrangler(["r2", "object", "get", `${BUCKET}/${key}`, "--local", "--file", back]);
    if (!readFileSync(back).equals(bytes)) {
      throw new Error(`read ${key} back from local R2 and it differs from the fixture`);
    }

    // The table beside it, under the name `findTiming` reads.
    const source = path.join(scratch, "timing.json");
    writeFileSync(source, timingJson);
    wrangler([
      "r2", "object", "put", `${BUCKET}/${key}.json`, "--local",
      "--file", source, "--content-type", "application/json",
    ]);
    const backJson = path.join(scratch, "back.json");
    wrangler(["r2", "object", "get", `${BUCKET}/${key}.json`, "--local", "--file", backJson]);
    if (readFileSync(backJson, "utf8") !== timingJson) {
      throw new Error(`read ${key}.json back from local R2 and it differs from what was written`);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  console.log(
    `[seed:e2e:narration] post ${id} (${NARRATED_SLUG}) -> ${key}, ` +
      `${bytes.length} bytes, read back identical; timing table of ${lines} lines beside it`,
  );
}

try {
  main();
} catch (error) {
  console.error(`[seed:e2e:narration] FAILED: ${(error as Error).message}`);
  process.exit(1);
}
// Explicit: a script that has finished must not depend on the event loop
// emptying (AGENTS.md, "A scripts/ file must end in process.exit()").
process.exit(0);

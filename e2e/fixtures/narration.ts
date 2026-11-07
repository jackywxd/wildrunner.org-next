/**
 * The narration the listening journey plays, and the article it is filed under.
 *
 * `local R2` HOLDS NO NARRATION AT ALL, and neither does a database seeded by
 * CI: the 15-post corpus predates the feature and the generator costs money.
 * `scripts/seed-e2e-narration.ts` puts `narration.mp3` into local R2 under the
 * key this article's words hash to, which is the only way the page renders the
 * player instead of the device-voice reader.
 *
 * WHICH ARTICLE. Several screens long, because the journey navigates away
 * from it and back, and NOT the longest in the corpus: V-READER picks that one
 * by body size (and excludes this slug anyway), and two specs that need the
 * same article to behave differently should not depend on a tie-break.
 * `posts/2024/my-ultra-races` is the second-longest published post by source
 * text (4,877 characters against 8,426 for `posts/2024/utmb`, read from
 * `.velite/posts.json`, which is what `migrate:velite` seeds from) and fourth
 * by stored body size on a seeded database, which is the measure V-READER
 * sorts by — 9,453 against 29,486 for `utmb`.
 *
 * THE FILE. 120 s of a 220 Hz tone, mono, 24 kbps CBR at 22.05 kHz, made with
 * ffmpeg (`-f lavfi -i sine=frequency=220:duration=120:sample_rate=22050
 * -ac 1 -c:a libmp3lame -b:a 24k -map_metadata -1`). The numbers below were
 * read back with ffprobe, not computed. A plain git blob: `.mp3` is not in
 * `.gitattributes`, so CI does not receive an LFS pointer.
 */
import path from "node:path";

export const NARRATED_SLUG = "posts/2024/my-ultra-races";

export const NARRATION_FILE = path.resolve("e2e", "fixtures", "narration.mp3");

/** ffprobe: `format=duration`. Chromium reports the same to the millisecond. */
export const NARRATION_DURATION_SECONDS = 120;

/** ffprobe: `format=size`; `seed-e2e-narration.ts` checks the file against it. */
export const NARRATION_BYTES = 360_402;

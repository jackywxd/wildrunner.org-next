/**
 * A media file, labelled as a person should read it.
 *
 * The site shows raw `filename` wherever a photo or video needs a label, and
 * on the real corpus that reads badly — the migration mangled these names
 * twice over. Measured against production, 2026-08-18:
 *
 *   filename: gallery--2023--utmb--UTMB-202023-20Vertical.m4v
 *   url:      …/gallery/2023/utmb/UTMB%202023%20Vertical.m4v
 *
 * `/` became `--`, and each `%` of the percent-encoding became `-`, so a
 * space survives as the literal text `-20`. Reversing that from `filename`
 * alone is genuinely ambiguous: in `QMT80-2026-4K` the `-20` is part of the
 * year, and decoding it would produce `QMT80 26 4K`.
 *
 * THE URL IS THE WAY OUT. `media.url` kept the original path with proper
 * percent-encoding, so its last segment decodes back to exactly what the
 * file was called — `UTMB 2023 Vertical`, `馬營2019-final`. That is why this
 * takes the whole media object rather than just a filename, and only falls
 * back to `filename` when there is no url to read.
 *
 * `media.title` OUTRANKS ALL OF IT, and is the only thing that can: every
 * rule below is a way of guessing well from a filename, and a person saying
 * what the file is called is not a guess. It is nullable and nearly always
 * empty, so the derivation underneath is what almost every row still gets.
 *
 * DELIBERATELY NOT `media.alt`, which looks like the natural source and is
 * worse on every sample. Measured on the corpus, 2026-09-01: the migrated
 * videos hold the album name followed by the original filename with its
 * extension — `2023 - UTMB UTMB 2023 Vertical.m4v` against a derived
 * `UTMB 2023 Vertical` — and a new upload gets `defaultAltFor(filename)`
 * (direct-upload.ts), which is the stem this file already derives, so
 * switching would make old rows worse and new rows no better. Production
 * serves `IMG_6109` for the race-wall photos for the same reason. `alt` also
 * describes image *content* for screen readers and the member dialog labels
 * it 替代文字; sharing one field means an edit made for accessibility
 * silently renames the thing on screen. That is what `title` is for.
 */

type NameSource = {
  /** `media.title` — what a person called it. Beats every derivation below. */
  title?: string | null;
  /** `media.url`, or the mapped `src` — the good name, percent-encoded. */
  src?: string | null;
  /** `media.filename` — the mangled fallback. */
  filename?: string | null;
};

export function mediaDisplayName(media: NameSource | null | undefined): string {
  if (!media) return "";

  // Trimmed before it is believed, for the same reason the video share id is
  // (site-video.ts): a field somebody typed a space into is not a name, and
  // an all-whitespace title would render as a blank label with no way to tell
  // it apart from a bug.
  const named = media.title?.trim();
  if (named) return named;

  const raw = lastPathSegment(media.src) || lastNameSegment(media.filename);
  if (!raw) return "";

  const stem = raw.replace(/\.[^.]+$/, "");
  const cleaned = stem
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // A name that is nothing but separators would render as an empty label in
  // a fixed-height row — a blank strip with a share button and no clue what
  // it belongs to. Any name beats none.
  return cleaned || stem || raw;
}

/** The decoded final segment of a URL or path, or "" when there is none. */
function lastPathSegment(src: string | null | undefined): string {
  if (!src) return "";
  // Query and hash first: a signed or cache-busted URL would otherwise put
  // its parameters in the label.
  const path = src.split(/[?#]/)[0] ?? "";
  const segment = path.split("/").filter(Boolean).pop() ?? "";
  if (!segment) return "";
  try {
    return decodeURIComponent(segment);
  } catch {
    // A stray `%` that is not a valid escape makes decodeURIComponent throw;
    // the still-encoded segment is a worse name but not a crash.
    return segment;
  }
}

/**
 * The filename's own last segment. The migration encoded the object's R2
 * path into the name as `gallery--2026--QMT--<name>`, so everything before
 * the final `--` says where the file was filed, not what it is called.
 */
function lastNameSegment(filename: string | null | undefined): string {
  if (!filename) return "";
  return filename.split("--").pop() || filename;
}

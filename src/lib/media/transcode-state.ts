/**
 * The transcode queue, as pure functions over a `media` row.
 *
 * There is no Cloudflare Queue behind this feature. `media.transcodeStatus`
 * and `media.transcodeAttempts` *are* the queue: `queued` is the backlog,
 * `running` is a lease, `attempts` is the retry count, `failed` is the dead
 * letter. Everything that decides a transition lives here rather than in the
 * endpoint or the container, so it can be tested without either — which
 * matters, because the container is the one part that cannot run in CI.
 *
 * Why a lease rather than trusting the worker to finish: Cloudflare's own
 * documentation says it "does not guarantee that any container instance will
 * run for any set period of time" — a host restart or a rollout stops it
 * with `SIGTERM`, then `SIGKILL` 15 minutes later. So a job *will* sometimes
 * die halfway with nobody to report it, and the only way anyone finds out is
 * that its lease went stale.
 */

export type TranscodeStatus =
  | "queued"
  | "running"
  | "done"
  | "failed"
  | "skipped";

/**
 * Three, not "keep trying". A video that fails three separate container
 * runs is not going to succeed on the fourth — it is malformed, or it is
 * something ffmpeg cannot read — and a row that retries forever burns
 * billed container time on every sweep while hiding the real problem.
 */
export const MAX_TRANSCODE_ATTEMPTS = 3;

/**
 * How long a `running` row may go untouched before the sweep reclaims it.
 *
 * Comfortably longer than any real job: the largest file in the corpus is
 * 1.17 GB / 481 s, which measured at ~2.6 minutes of encoding plus ~1.6
 * minutes of transfer at the container's 100 Mbps cap. Fifteen minutes
 * leaves room for a slower vCPU without ever reclaiming a job that is still
 * making progress — reclaiming a live job would run it twice concurrently.
 */
export const LEASE_TIMEOUT_MS = 15 * 60 * 1000;

type MediaRow = {
  mimeType?: string | null;
  transcodeAttempts?: number | null;
  transcodeStatus?: string | null;
  updatedAt?: string | null;
};

/** Only videos are transcoded; everything else is `skipped`, not `queued`. */
export function needsTranscode(media: MediaRow): boolean {
  return Boolean(media.mimeType?.startsWith("video/"));
}

/**
 * What a fresh request to transcode should do.
 *
 * `done` is deliberately terminal. Re-running it would re-encode an already
 * transcoded file — a generational quality loss, and billed container time
 * spent making the video worse.
 */
export function nextStatusForRequest(media: MediaRow): TranscodeStatus {
  if (!needsTranscode(media)) return "skipped";
  if (media.transcodeStatus === "done") return "done";
  return "queued";
}

/**
 * Whether a `running` row has lost its lease.
 *
 * `now` is a parameter, never `Date.now()` inside, so a test can place a row
 * either side of the boundary without sleeping — the same rule
 * `src/lib/races/calendar.ts` follows for dates.
 */
export function leaseExpired(media: MediaRow, now: Date): boolean {
  if (media.transcodeStatus !== "running") return false;
  if (!media.updatedAt) return false;

  const touched = Date.parse(media.updatedAt);
  if (Number.isNaN(touched)) return false;

  return now.getTime() - touched >= LEASE_TIMEOUT_MS;
}

/**
 * What the sweep should do with a row whose lease has expired: hand it back
 * to the queue, or give up on it.
 */
export function reclaim(media: MediaRow): {
  status: TranscodeStatus;
  attempts: number;
} {
  const attempts = (media.transcodeAttempts ?? 0) + 1;
  return {
    attempts,
    status: attempts >= MAX_TRANSCODE_ATTEMPTS ? "failed" : "queued",
  };
}

/**
 * The R2 key the transcoded file is written to.
 *
 * Derived from the media id rather than from the source name, for two
 * reasons. It is idempotent — a retry overwrites its own previous partial
 * output instead of littering the bucket with one object per attempt — and
 * it sidesteps the corpus's mangled filenames entirely (the migration turned
 * `/` into `--` and percent-encoded the rest, so `UTMB 2023 Vertical.m4v` is
 * stored as `UTMB-202023-20Vertical.m4v`; see src/lib/media-name.ts).
 */
export function transcodedKey(mediaId: number | string): string {
  return `transcoded/${mediaId}-1080p.mp4`;
}

/**
 * The R2 key the poster frame is written to.
 *
 * This side's copy of `posterKeyFor()` in workers/transcoder/src/index.ts —
 * the same hand-kept pair `transcodedKey` above describes, and for the same
 * reason: a separate Worker cannot import from the app. The callback checks
 * the reported key against this, so if the two drift the poster is refused
 * rather than silently written to a key nothing reads.
 */
export function posterKey(mediaId: number | string): string {
  return `posters/${mediaId}.jpg`;
}

/**
 * The exact job the transcoder Worker expects, or `null` if this row cannot
 * produce one.
 *
 * This exists as a function rather than an object literal at the call site
 * because the literal got it wrong. `startTranscode` used to post only
 * `{ mediaId }`, while the Worker requires `sourceUrl` and `destKey` and
 * answers 400 without them — so every dispatch failed silently, the row
 * stayed `queued`, and the sweep re-dispatched into the same 400 until the
 * attempt ceiling turned it `failed`. Nothing local could see it: the
 * `TRANSCODER` binding is absent in dev and CI, so the request was never
 * made at all. A cross-Worker contract that only a deployed run exercises
 * needs its own side of it pinned down by something that runs here.
 *
 * `sourceUrl` must be absolute and https. The container fetches it itself,
 * with no request context to resolve against, and `publicMediaUrl` returns
 * a relative `/<filename>` when `R2_PUBLIC_URL` is unset.
 *
 * There is deliberately NO `destKey` here. It used to be sent, and the
 * transcoder used what it was given — which, on a Worker that Cloudflare
 * had published at a public hostname with no authentication, let anyone
 * name the object the container would write over. The Worker derives the
 * key from the media id now, and `transcodedKey` below is this side's copy
 * of that same rule: what the callback is required to report back.
 */
export type TranscodeJob = {
  mediaId: number | string;
  sourceUrl: string;
};

export function transcodeJob(media: {
  id: number | string;
  url?: string | null;
}): TranscodeJob | null {
  if (!media.url || !/^https:\/\//.test(media.url)) return null;

  return {
    mediaId: media.id,
    sourceUrl: media.url,
  };
}

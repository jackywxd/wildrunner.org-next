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

/**
 * How many containers the transcoder Worker may run at once.
 *
 * THIS SIDE'S COPY of `max_instances` in workers/transcoder/wrangler.jsonc,
 * kept in step by hand for the same reason `posterKey` mirrors the Worker's
 * `posterKeyFor`: nothing at build time connects the two files, and the site
 * has no way to ask Cloudflare what the limit is. Change one, change the
 * other — the Worker's config carries a note pointing back here.
 *
 * Being wrong in the low direction only slows the queue down; being wrong in
 * the high direction reproduces the bug this constant exists to fix, so when
 * in doubt this stays under the Worker's number.
 */
export const MAX_CONCURRENT_TRANSCODES = 3;

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
 * What one sweep should do, decided before it does any of it.
 *
 * THE BUG THIS EXISTS FOR, measured on production 2026-09-02 with two queries
 * fifteen seconds apart. The sweep dispatched all ten queued videos at once —
 * `limit: 100`, a `startTranscode` per row, no notion of capacity anywhere.
 * At 17:14:47-57 all ten rows read `running`; by 17:15:08 nine of them were
 * back to `queued`. Nine containers had been asked for, refused with "Maximum
 * number of running container instances exceeded", and bounced. One ran.
 *
 * Every part of that was working as written. The Worker is right to treat the
 * refusal as transient and hand the row back rather than failing a member's
 * video for a busy account; the sweep is right to re-dispatch a `queued` row.
 * Together they make a retry storm: each sweep spends ten dispatches to start
 * one job, and the nine losers go to the back of the queue having achieved
 * nothing but a round trip.
 *
 * So the sweep now asks for as many jobs as there are free containers, and no
 * more. The rest stay `queued`, which is what they already were — the queue is
 * `media.transcodeStatus`, so leaving a row alone IS leaving it in the queue.
 *
 * `inFlight` is counted from unexpired `running` leases, which is the only
 * signal this side has. It over-counts for a few seconds after a dispatch that
 * is about to bounce — a row reads `running` before the container refuses it —
 * and that error is in the safe direction: it dispatches fewer, never more.
 *
 * Pure, and taking `now` and `capacity` as parameters, so the whole rule can
 * be exercised without a container or a clock — the reason this file exists.
 */
export type SweepPlan<T> = {
  /** Live leases, counted against capacity. */
  inFlight: number;
  /** Expired leases, with the state each should move to. */
  reclaim: { attempts: number; row: T; status: TranscodeStatus }[];
  /** Rows to hand the transcoder now. Never longer than the free capacity. */
  dispatch: T[];
  /** Rows left queued because no container is free for them. Not an error. */
  waiting: number;
};

export function planSweep<T extends MediaRow>(
  rows: T[],
  now: Date,
  capacity: number = MAX_CONCURRENT_TRANSCODES,
): SweepPlan<T> {
  const reclaim_: SweepPlan<T>["reclaim"] = [];
  const queued: T[] = [];
  let inFlight = 0;

  for (const row of rows) {
    if (row.transcodeStatus === "running") {
      if (!leaseExpired(row, now)) {
        inFlight += 1;
        continue;
      }
      const next = reclaim(row);
      reclaim_.push({ attempts: next.attempts, row, status: next.status });
      // Back in the queue and eligible again in this same sweep, at the front:
      // callers hand rows over oldest-first, and a row whose lease expired has
      // by definition waited longer than anything still running. A row the
      // reclaim gave up on is `failed` and is not queued for anything.
      if (next.status === "queued") queued.push(row);
      continue;
    }
    queued.push(row);
  }

  const budget = Math.max(0, capacity - inFlight);
  return {
    dispatch: queued.slice(0, budget),
    inFlight,
    reclaim: reclaim_,
    waiting: Math.max(0, queued.length - budget),
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

export type PosterFrameJob = TranscodeJob & { seconds: number };

/**
 * The job for "use the frame at this moment as the cover".
 *
 * Same shape and same `null` rule as `transcodeJob` — a row with no absolute
 * URL is a misconfigured environment, not something to send the container
 * looking for — plus the one field a member supplies.
 *
 * `seconds` is clamped and rounded HERE as well as in the Worker, and the
 * duplication is deliberate. The Worker re-validates because it answers on a
 * public hostname and cannot trust its caller; this one exists so a nonsense
 * value never leaves the site in the first place, and so the rule is unit
 * testable without a container. Negative becomes 0 — scrubbing to the very
 * start is a real thing a member does, and refusing it would be pedantry —
 * while a non-finite value is refused outright, because it means the player
 * never reported a time and guessing which frame they wanted would be worse
 * than doing nothing.
 */
export function posterFrameJob(
  media: { id: number | string; url?: string | null },
  seconds: number,
): PosterFrameJob | null {
  const base = transcodeJob(media);
  if (!base) return null;
  if (!Number.isFinite(seconds)) return null;

  const clamped = Math.min(Math.max(seconds, 0), MAX_POSTER_SECONDS);
  return { ...base, seconds: Math.round(clamped * 1000) / 1000 };
}

/** Well past any club video, and the same ceiling the Worker enforces. */
export const MAX_POSTER_SECONDS = 86_400;

/**
 * A poster URL the browser and the edge will actually re-fetch.
 *
 * The object key never changes — `posters/<id>.jpg`, so re-picking a frame
 * overwrites rather than leaving one object per attempt — which means the URL
 * would not change either, and both Cloudflare's cache and the browser would
 * go on serving the previous frame. For a feature whose entire point is
 * choosing the picture, "it changed but you cannot see it" is indistinguish-
 * able from broken.
 *
 * A version parameter is enough: `src/lib/image-loader.ts` carries
 * `url.search` through into the `/cdn-cgi/image/` URL it builds, so the
 * resized variant is keyed by it too — checked in that file, not assumed.
 */
export function versionedPosterUrl(url: string, at: number): string {
  const version = Math.floor(at / 1000);
  return `${url}${url.includes("?") ? "&" : "?"}v=${version}`;
}

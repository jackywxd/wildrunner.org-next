/**
 * The transcode queue's decisions.
 *
 * These are the rules that keep a job from being lost or run twice, and
 * they are worth unit tests precisely because the thing they protect
 * against cannot be reproduced on demand: Cloudflare says it "does not
 * guarantee that any container instance will run for any set period of
 * time", so the half-finished job this logic exists to recover is a thing
 * that happens occasionally, in production, with nobody watching.
 *
 * `@playwright/test` rather than `../helpers/test`: nothing here touches
 * `page`, and that helper's console-guard fixture depends on it, so
 * importing it would launch a browser for nothing.
 */
import { expect, test } from "@playwright/test";

import {
  MAX_CONCURRENT_TRANSCODES,
  planSweep,
  LEASE_TIMEOUT_MS,
  MAX_POSTER_SECONDS,
  MAX_TRANSCODE_ATTEMPTS,
  leaseExpired,
  needsTranscode,
  nextStatusForRequest,
  posterFrameJob,
  posterKey,
  reclaim,
  transcodeJob,
  transcodedKey,
  versionedPosterUrl,
} from "@/lib/media/transcode-state";

const NOW = new Date("2026-08-26T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

test.describe("U-TRANSCODE the transcode queue's rules", () => {
  test("U-TRANSCODE-1: only videos are queued; everything else is skipped", () => {
    // Protects against burning billed container time on 525 images — the
    // corpus is overwhelmingly photos, and every upload hits this endpoint.
    expect(nextStatusForRequest({ mimeType: "video/mp4" })).toBe("queued");
    expect(nextStatusForRequest({ mimeType: "video/quicktime" })).toBe(
      "queued",
    );
    expect(nextStatusForRequest({ mimeType: "image/webp" })).toBe("skipped");
    expect(nextStatusForRequest({})).toBe("skipped");
    expect(needsTranscode({ mimeType: "image/jpeg" })).toBe(false);
  });

  test("U-TRANSCODE-2: an already-transcoded video is never re-queued", () => {
    // Protects against re-encoding an encode: generational quality loss,
    // paid for in container time, making the video worse each round.
    expect(
      nextStatusForRequest({ mimeType: "video/mp4", transcodeStatus: "done" }),
    ).toBe("done");
    // But a previous failure must still be retryable by hand.
    expect(
      nextStatusForRequest({
        mimeType: "video/mp4",
        transcodeStatus: "failed",
      }),
    ).toBe("queued");
  });

  test("U-TRANSCODE-3: a lease expires only after the timeout, and only while running", () => {
    // The dangerous direction is reclaiming too early: that runs a second
    // container against a job the first one is still working on.
    const running = { mimeType: "video/mp4", transcodeStatus: "running" };

    expect(
      leaseExpired({ ...running, updatedAt: ago(LEASE_TIMEOUT_MS - 1) }, NOW),
    ).toBe(false);
    expect(
      leaseExpired({ ...running, updatedAt: ago(LEASE_TIMEOUT_MS) }, NOW),
    ).toBe(true);
    expect(
      leaseExpired({ ...running, updatedAt: ago(LEASE_TIMEOUT_MS * 4) }, NOW),
    ).toBe(true);

    // A row that is not running holds no lease, however old it is.
    for (const status of ["queued", "done", "failed", "skipped"]) {
      expect(
        leaseExpired(
          {
            mimeType: "video/mp4",
            transcodeStatus: status,
            updatedAt: ago(LEASE_TIMEOUT_MS * 4),
          },
          NOW,
        ),
      ).toBe(false);
    }
  });

  test("U-TRANSCODE-4: a row with no usable timestamp is never reclaimed", () => {
    // Reclaiming on a missing or unparseable `updatedAt` would treat epoch
    // 0 as "very stale" and restart a job that may have started seconds ago.
    const running = { mimeType: "video/mp4", transcodeStatus: "running" };
    expect(leaseExpired(running, NOW)).toBe(false);
    expect(leaseExpired({ ...running, updatedAt: "not a date" }, NOW)).toBe(
      false,
    );
  });

  test("U-TRANSCODE-5: retries are counted and eventually give up", () => {
    // Without the ceiling a malformed file is retried forever, paying for a
    // container every sweep while hiding the real problem.
    expect(reclaim({ transcodeAttempts: 0 })).toEqual({
      attempts: 1,
      status: "queued",
    });
    expect(reclaim({ transcodeAttempts: 1 })).toEqual({
      attempts: 2,
      status: "queued",
    });
    expect(reclaim({ transcodeAttempts: MAX_TRANSCODE_ATTEMPTS - 1 })).toEqual({
      attempts: MAX_TRANSCODE_ATTEMPTS,
      status: "failed",
    });
    // A null count is a first attempt, not a crash.
    expect(reclaim({})).toEqual({ attempts: 1, status: "queued" });
  });

  test("U-TRANSCODE-7: a dispatched job carries every field the Worker requires", () => {
    // This is the assertion the feature shipped without, and the defect it
    // would have caught was total: the dispatcher posted `{ mediaId }` while
    // workers/transcoder/src/index.ts answers 400 unless `sourceUrl` and
    // `destKey` are both present. Every video would have failed after three
    // sweeps. It was invisible everywhere it could have been noticed — the
    // `TRANSCODER` binding does not exist in dev or in CI, so the request was
    // never sent and `startTranscode` returned false long before the Worker
    // could reject it.
    const job = transcodeJob({
      id: 672,
      url: "https://cdn.example.com/a%20b.m4v",
    });

    expect(job).toEqual({
      mediaId: 672,
      sourceUrl: "https://cdn.example.com/a%20b.m4v",
    });
    // Named explicitly rather than left to `toEqual`: these strings are the
    // other Worker's validation, and a rename on either side has to break
    // something here rather than in production.
    expect(Object.keys(job ?? {}).sort()).toEqual(["mediaId", "sourceUrl"]);
    // And `destKey` must NOT be here. The transcoder derives it from the id;
    // sending one is what let an unauthenticated caller pick the object the
    // container would overwrite.
    expect(job).not.toHaveProperty("destKey");
  });

  test("U-TRANSCODE-8: a row with no absolute URL produces no job", () => {
    // The container fetches `sourceUrl` itself, with no request context to
    // resolve against. `publicMediaUrl` returns a relative `/<filename>`
    // whenever `R2_PUBLIC_URL` is unset, and dispatching that would spend a
    // container run to have curl fail on an unresolvable path.
    expect(transcodeJob({ id: 672, url: "/UTMB-202023.m4v" })).toBeNull();
    expect(transcodeJob({ id: 672, url: "" })).toBeNull();
    expect(transcodeJob({ id: 672 })).toBeNull();
    // Plain http is refused too, and the transcoder refuses it again on its
    // own side: the container fetches this URL itself, so it is the one
    // request in the system aimed by data rather than by code.
    expect(
      transcodeJob({ id: 672, url: "http://cdn.example.com/a.m4v" }),
    ).toBeNull();
    expect(
      transcodeJob({ id: 672, url: "https://cdn.example.com/a.m4v" }),
    ).not.toBeNull();
  });

  test("U-TRANSCODE-6: the output key is stable and derived from the id", () => {
    // Stability is what makes a retry idempotent: attempt two overwrites
    // attempt one's partial object instead of leaving it behind. Deriving
    // from the id rather than the filename also sidesteps the corpus's
    // mangled names (see media-name.ts).
    expect(transcodedKey(672)).toBe("transcoded/672-1080p.mp4");
    expect(transcodedKey(672)).toBe(transcodedKey("672"));
    expect(transcodedKey(1)).not.toBe(transcodedKey(2));
  });

  test("U-TRANSCODE-9: the poster key is derived the same way, under its own prefix", () => {
    // This side's copy of `posterKeyFor()` in workers/transcoder/src/index.ts.
    // The callback refuses any reported key that does not equal this one, so
    // the two drifting apart means posters stop being accepted rather than
    // landing somewhere unread — which is why the exact string is pinned here
    // rather than just its shape.
    expect(posterKey(672)).toBe("posters/672.jpg");
    expect(posterKey(672)).toBe(posterKey("672"));
    expect(posterKey(1)).not.toBe(posterKey(2));

    // A separate prefix from the transcode, not a sibling extension: the
    // unused-media sweep and any bucket rule can then tell one kind of
    // derived object from the other without parsing a filename.
    expect(posterKey(672).startsWith("posters/")).toBe(true);
    expect(transcodedKey(672).startsWith("transcoded/")).toBe(true);
  });

  test("U-TRANSCODE-10: a picked frame is clamped, and a non-number is refused", () => {
    const media = { id: 672, url: "https://cdn.example.com/a.mp4" };

    // The ordinary case: whatever the player reported, carried through.
    expect(posterFrameJob(media, 12.5)?.seconds).toBe(12.5);

    // Scrubbed to the very start. A real thing a member does, so 0 is a
    // value and not an error — and a negative currentTime (some players
    // report a tiny one while seeking) means the same intent.
    expect(posterFrameJob(media, 0)?.seconds).toBe(0);
    expect(posterFrameJob(media, -3)?.seconds).toBe(0);

    // Bounded, because this ends up in ffmpeg's argv. The Worker enforces
    // the same ceiling; this is the copy that keeps a nonsense value from
    // leaving the site at all.
    expect(posterFrameJob(media, 1e9)?.seconds).toBe(MAX_POSTER_SECONDS);

    // Rounded to milliseconds: `currentTime` is a float with far more
    // precision than a frame, and the extra digits only make the argv
    // longer and the log harder to read.
    expect(posterFrameJob(media, 3.14159265)?.seconds).toBe(3.142);

    // NaN is the player never having reported a time. Refused outright
    // rather than defaulting to 0 — guessing which frame the member wanted
    // is worse than telling them it did not work.
    expect(posterFrameJob(media, Number.NaN)).toBeNull();
    expect(posterFrameJob(media, Number.POSITIVE_INFINITY)).toBeNull();

    // Same source rule as a transcode: no absolute URL, no job.
    expect(posterFrameJob({ id: 672, url: "/relative.mp4" }, 5)).toBeNull();
    expect(posterFrameJob({ id: 672, url: null }, 5)).toBeNull();
  });

  test("U-TRANSCODE-11: a re-picked poster gets a URL that is actually re-fetched", () => {
    // The object key never changes, so without this the browser and the
    // Cloudflare edge both go on serving the previous frame — for a feature
    // whose whole point is choosing the picture, indistinguishable from
    // broken.
    const base = "https://images.wildrunner.org/posters/672.jpg";
    const first = versionedPosterUrl(base, 1_700_000_000_000);
    const later = versionedPosterUrl(base, 1_700_000_060_000);

    expect(first).toBe(`${base}?v=1700000000`);
    expect(first).not.toBe(later);

    // A base that already carries a query keeps it. Nothing produces one
    // today, but the alternative is a URL with two `?` in it, which fails
    // silently as a 404 rather than loudly.
    expect(versionedPosterUrl(`${base}?x=1`, 1_700_000_000_000)).toBe(
      `${base}?x=1&v=1700000000`,
    );
  });
});

test.describe("U-SWEEPPLAN the sweep asks for as many jobs as there are containers", () => {
  const NOW2 = new Date("2026-09-02T17:15:00.000Z");
  const before = (ms: number) => new Date(NOW2.getTime() - ms).toISOString();

  const row = (id: number, status: string, updatedAt = before(0)) => ({
    id,
    mimeType: "video/mp4",
    transcodeAttempts: 0,
    transcodeStatus: status,
    updatedAt,
  });

  test("U-SWEEPPLAN-1: ten queued videos against three containers dispatch three", () => {
    // The production incident this function exists for, as a fixture.
    // Measured 2026-09-02: all ten went out at once, nine came back refused
    // within twenty seconds, one ran. Every sweep repeated it.
    const queued = Array.from({ length: 10 }, (_, i) => row(i + 1, "queued"));
    const plan = planSweep(queued, NOW2);

    expect(plan.dispatch).toHaveLength(MAX_CONCURRENT_TRANSCODES);
    expect(plan.waiting).toBe(10 - MAX_CONCURRENT_TRANSCODES);
    // The seven left alone are still `queued` — the queue IS the column, so
    // not touching a row is what leaving it queued means. Nothing is lost and
    // nothing needs writing for them.
    expect(plan.reclaim).toEqual([]);
  });

  test("U-SWEEPPLAN-2: a live lease occupies a container, so fewer go out", () => {
    // The half that makes this a queue rather than a smaller storm: capacity
    // is what is FREE, not what exists. Getting this wrong by counting only
    // the queue would dispatch three on top of two already encoding.
    // MORE QUEUED THAN FREE CAPACITY, deliberately: with two running and
    // three slots exactly one may go out, so a version that counted only the
    // queue would dispatch three here. An earlier draft of this case had a
    // single queued row and passed either way — it was seen not to fail, and
    // that is the only reason this fixture is shaped like this.
    const plan = planSweep(
      [
        row(1, "running", before(60_000)),
        row(2, "running", before(60_000)),
        row(3, "queued"),
        row(4, "queued"),
        row(5, "queued"),
      ],
      NOW2,
    );

    expect(plan.inFlight).toBe(2);
    expect(plan.dispatch.map((d) => d.id)).toEqual([3]);
    expect(plan.waiting).toBe(2);
  });

  test("U-SWEEPPLAN-3: a full house dispatches nothing at all", () => {
    const plan = planSweep(
      [
        row(1, "running", before(60_000)),
        row(2, "running", before(60_000)),
        row(3, "running", before(60_000)),
        row(4, "queued"),
        row(5, "queued"),
      ],
      NOW2,
    );

    expect(plan.dispatch).toEqual([]);
    expect(plan.waiting).toBe(2);
  });

  test("U-SWEEPPLAN-4: an expired lease frees its container and goes back to the front", () => {
    // It stops counting against capacity the moment it is reclaimed — the
    // container it was holding is gone, which is why the lease expired — and
    // it is dispatched ahead of rows that have waited less.
    const stale = row(1, "running", before(16 * 60 * 1000));
    const plan = planSweep([stale, row(2, "queued"), row(3, "queued")], NOW2);

    expect(plan.inFlight).toBe(0);
    expect(plan.reclaim.map((r) => [r.row.id, r.status])).toEqual([
      [1, "queued"],
    ]);
    expect(plan.dispatch.map((d) => d.id)).toEqual([1, 2, 3]);
  });

  test("U-SWEEPPLAN-5: a row the reclaim gives up on is failed, never dispatched", () => {
    // Third strike. It must not consume one of the three slots on its way to
    // the dead-letter state — that would spend a container to achieve nothing.
    const doomed = {
      ...row(1, "running", before(16 * 60 * 1000)),
      transcodeAttempts: 2,
    };
    const plan = planSweep([doomed, row(2, "queued")], NOW2);

    expect(plan.reclaim.map((r) => r.status)).toEqual(["failed"]);
    expect(plan.dispatch.map((d) => d.id)).toEqual([2]);
  });

  test("U-SWEEPPLAN-6: an empty queue asks for nothing", () => {
    expect(planSweep([], NOW2)).toEqual({
      dispatch: [],
      inFlight: 0,
      reclaim: [],
      waiting: 0,
    });
  });
});

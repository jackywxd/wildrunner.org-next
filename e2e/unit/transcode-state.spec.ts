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
  LEASE_TIMEOUT_MS,
  MAX_TRANSCODE_ATTEMPTS,
  leaseExpired,
  needsTranscode,
  nextStatusForRequest,
  reclaim,
  transcodeJob,
  transcodedKey,
} from "@/lib/media/transcode-state";

const NOW = new Date("2026-08-26T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

test.describe("U-TRANSCODE the transcode queue's rules", () => {
  test("U-TRANSCODE-1: only videos are queued; everything else is skipped", () => {
    // Protects against burning billed container time on 525 images — the
    // corpus is overwhelmingly photos, and every upload hits this endpoint.
    expect(nextStatusForRequest({ mimeType: "video/mp4" })).toBe("queued");
    expect(nextStatusForRequest({ mimeType: "video/quicktime" })).toBe("queued");
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
      nextStatusForRequest({ mimeType: "video/mp4", transcodeStatus: "failed" }),
    ).toBe("queued");
  });

  test("U-TRANSCODE-3: a lease expires only after the timeout, and only while running", () => {
    // The dangerous direction is reclaiming too early: that runs a second
    // container against a job the first one is still working on.
    const running = { mimeType: "video/mp4", transcodeStatus: "running" };

    expect(leaseExpired({ ...running, updatedAt: ago(LEASE_TIMEOUT_MS - 1) }, NOW)).toBe(false);
    expect(leaseExpired({ ...running, updatedAt: ago(LEASE_TIMEOUT_MS) }, NOW)).toBe(true);
    expect(leaseExpired({ ...running, updatedAt: ago(LEASE_TIMEOUT_MS * 4) }, NOW)).toBe(true);

    // A row that is not running holds no lease, however old it is.
    for (const status of ["queued", "done", "failed", "skipped"]) {
      expect(
        leaseExpired({ mimeType: "video/mp4", transcodeStatus: status, updatedAt: ago(LEASE_TIMEOUT_MS * 4) }, NOW),
      ).toBe(false);
    }
  });

  test("U-TRANSCODE-4: a row with no usable timestamp is never reclaimed", () => {
    // Reclaiming on a missing or unparseable `updatedAt` would treat epoch
    // 0 as "very stale" and restart a job that may have started seconds ago.
    const running = { mimeType: "video/mp4", transcodeStatus: "running" };
    expect(leaseExpired(running, NOW)).toBe(false);
    expect(leaseExpired({ ...running, updatedAt: "not a date" }, NOW)).toBe(false);
  });

  test("U-TRANSCODE-5: retries are counted and eventually give up", () => {
    // Without the ceiling a malformed file is retried forever, paying for a
    // container every sweep while hiding the real problem.
    expect(reclaim({ transcodeAttempts: 0 })).toEqual({ attempts: 1, status: "queued" });
    expect(reclaim({ transcodeAttempts: 1 })).toEqual({ attempts: 2, status: "queued" });
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
    const job = transcodeJob({ id: 672, url: "https://cdn.example.com/a%20b.m4v" });

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
    expect(transcodeJob({ id: 672, url: "http://cdn.example.com/a.m4v" })).toBeNull();
    expect(transcodeJob({ id: 672, url: "https://cdn.example.com/a.m4v" })).not.toBeNull();
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
});

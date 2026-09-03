import { expect, test } from "@playwright/test";

import {
  isFinished,
  mergeFiles,
  summarise,
  type QueueItem,
} from "@/lib/members/upload-queue";

/**
 * U-UPLOADQ — the two things the old uploader got wrong that nothing could
 * see.
 *
 * A SECOND PICK USED TO ERASE THE FIRST. The control did
 * `setItems(Array.from(files).map(...))`, so a member selecting from two
 * folders lost the first folder with nothing on screen to say so. It is silent
 * by construction: the queue simply looks like the second batch, which is a
 * perfectly plausible queue.
 *
 * AND THERE WAS NO END. Uploading finished on a list of rows reading 完成 with
 * no total, so "did that work?" was answered by counting, and "already
 * uploaded" and "refused" looked alike at a glance.
 *
 * `File` is a Node global, so both of these are testable with no browser.
 */
const file = (name: string, size = 1000, lastModified = 111) =>
  new File([new Uint8Array(size)], name, { type: "image/jpeg", lastModified });

const queued = (f: File): QueueItem => ({
  file: f,
  status: "queued",
  percent: 0,
  message: "",
});

test.describe("U-UPLOADQ the upload queue", () => {
  test("U-UPLOADQ-1: a second pick is added, not substituted", () => {
    const first = mergeFiles([], [file("a.jpg"), file("b.jpg")]);
    const second = mergeFiles(first, [file("c.jpg")]);
    expect(second.map((i) => i.file.name)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
  });

  test("U-UPLOADQ-2: the same file picked twice is queued once", () => {
    // The shape this guards: somebody drops a folder, is not sure it landed,
    // and drops it again. Two copies of every photo would then upload, and the
    // per-file duplicate check would refuse the second half one at a time —
    // a confusing report for an act that was never a mistake.
    const once = mergeFiles([], [file("a.jpg")]);
    const twice = mergeFiles(once, [file("a.jpg"), file("b.jpg")]);
    expect(twice.map((i) => i.file.name)).toEqual(["a.jpg", "b.jpg"]);
  });

  test("U-UPLOADQ-3: same name, different file, still queues", () => {
    // Two cameras both produce `IMG_0001.jpg`. Identity is name *and* size
    // *and* modification time, so these are two photos and not one.
    const list = mergeFiles(
      [],
      [file("IMG_0001.jpg", 1000, 111), file("IMG_0001.jpg", 2000, 222)],
    );
    expect(list).toHaveLength(2);
  });

  test("U-UPLOADQ-4: a pick that adds nothing returns the same array", () => {
    // Identity, not just equality: React re-renders the tile grid on a new
    // array, and re-rendering forty tiles because somebody re-dropped the same
    // folder would flicker every thumbnail.
    const list = mergeFiles([], [file("a.jpg")]);
    expect(mergeFiles(list, [file("a.jpg")])).toBe(list);
  });

  test("U-UPLOADQ-5: the three outcomes are counted apart", () => {
    const items: QueueItem[] = [
      { ...queued(file("a.jpg")), status: "done" },
      { ...queued(file("b.jpg")), status: "done" },
      { ...queued(file("c.jpg")), status: "duplicate" },
      { ...queued(file("d.jpg")), status: "error", message: "超過 1 GB" },
    ];
    const s = summarise(items);
    expect({ done: s.done, duplicate: s.duplicate, error: s.error }).toEqual({
      done: 2,
      duplicate: 1,
      error: 1,
    });
    // Stored, skipped and refused are three different things to be told, and
    // the old control said 完成 to the first and nothing about the other two.
    expect(s.done + s.duplicate + s.error).toBe(s.total);
  });

  test("U-UPLOADQ-6: anything in flight counts as active and as pending", () => {
    // The totals have to add up to `total` in every state, or the progress
    // line reads "已完成 5 / 12" beside a grid of eleven tiles.
    for (const status of ["checking", "uploading", "saving"] as const) {
      const s = summarise([{ ...queued(file("a.jpg")), status }]);
      expect(s.active, status).toBe(true);
      expect(s.pending, status).toBe(1);
      expect(s.done + s.duplicate + s.error + s.pending).toBe(s.total);
    }
  });

  test("U-UPLOADQ-7: finished means it ran, not merely that it is idle", () => {
    // An untouched queue is also inactive. Showing the result panel over one
    // would be a report about nothing — and it would appear the instant a
    // member dropped their first file.
    expect(isFinished(summarise([]))).toBe(false);
    expect(isFinished(summarise([queued(file("a.jpg"))]))).toBe(false);
    expect(
      isFinished(summarise([{ ...queued(file("a.jpg")), status: "done" }])),
    ).toBe(true);
    // A cancelled run leaves files back in `queued`; that is not finished, and
    // the 繼續上傳 button rather than the result panel is what belongs there.
    expect(
      isFinished(
        summarise([
          { ...queued(file("a.jpg")), status: "done" },
          queued(file("b.jpg")),
        ]),
      ),
    ).toBe(false);
  });

  test("U-UPLOADQ-8: bytes are the whole list, for the header line", () => {
    expect(summarise(mergeFiles([], [file("a.jpg", 1000), file("b.jpg", 2500)])).bytes).toBe(
      3500,
    );
  });
});

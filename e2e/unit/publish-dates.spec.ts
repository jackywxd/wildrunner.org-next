import { expect, test } from "@playwright/test";

import type { CollectionBeforeChangeHook } from "payload";

import {
  publishStamp,
  stampPublishDates,
} from "@/collections/hooks/publish-dates";

/**
 * U-PUBDATE — which of an article's two dates a save is allowed to move.
 *
 * `publishedAt` was written by the member editor on every publish, so fixing
 * a typo in a year-old article re-dated it to today and floated it back to
 * the top of `/posts`. The fix moved both dates to a server hook, and the
 * thing worth asserting is the branch inside it: whether this publish is the
 * article's first.
 *
 * PURE, AND THAT IS WHY IT IS HERE. The branch reads two values and returns
 * two — no database, no request, no clock beyond the `now` it is handed. A
 * journey test for it would have to publish, wait, edit and re-publish
 * through a browser to observe one `if`.
 *
 * WHAT IT CANNOT SEE: that Payload passes `originalDoc` from
 * `getLatestCollectionVersion` rather than from the published version. That
 * is a fact about the framework, checked by reading its source
 * (`payload/dist/collections/operations/utilities/update.js`), and it is the
 * reason the branch keys on `publishedAt` instead of `_status` — see
 * U-PUBDATE-6.
 */

const NOW = "2026-09-14T12:00:00.000Z";
const FIRST = "2025-03-01T08:30:00.000Z";

test.describe("U-PUBDATE publish dates", () => {
  test("U-PUBDATE-1: a draft save moves neither date", () => {
    // Every autosave lands here. An article the public can already read must
    // not claim it was revised because its author is part-way through an edit
    // nobody has published — which is exactly what Payload's own `updatedAt`
    // would say, and why it is not the field being shown.
    expect(
      publishStamp({
        now: NOW,
        publishedAt: undefined,
        status: "draft",
        storedPublishedAt: FIRST,
      }),
    ).toEqual({});
  });

  test("U-PUBDATE-2: the first publish sets publishedAt and nothing else", () => {
    const stamp = publishStamp({
      now: NOW,
      publishedAt: undefined,
      status: "published",
      storedPublishedAt: undefined,
    });
    expect(stamp).toEqual({ publishedAt: NOW });
    // Asserted separately from the shape above because it is the claim the
    // page renders on: an article that has never been revised has no
    // revision line, and an empty-string `revisedAt` would draw one.
    expect(stamp.revisedAt).toBeUndefined();
  });

  test("U-PUBDATE-3: a first publish that carries its own date keeps it", () => {
    // An MDX import fills `publishedAt` from the frontmatter — the day the
    // piece was written, which is the whole reason the member is importing it
    // rather than typing it out. Overwriting that with today would lose the
    // one fact the file brought with it.
    expect(
      publishStamp({
        now: NOW,
        publishedAt: FIRST,
        status: "published",
        storedPublishedAt: undefined,
      }),
    ).toEqual({});
  });

  test("U-PUBDATE-4: re-publishing sets revisedAt and does not name publishedAt", () => {
    const stamp = publishStamp({
      now: NOW,
      publishedAt: undefined,
      status: "published",
      storedPublishedAt: FIRST,
    });
    expect(stamp).toEqual({ revisedAt: NOW });
    // `not.toHaveProperty`, not `toBe(FIRST)`, and the difference is the
    // regression this file exists for. The hook returns a *patch*: Payload
    // merges it over the stored document, so an absent key is what preserves
    // the first-publish date. A key holding the same string would also pass a
    // value check while being a rewrite — and a rewrite is what re-dated
    // articles in the first place.
    expect(stamp).not.toHaveProperty("publishedAt");
  });

  test("U-PUBDATE-5: an empty stored date is not a record of publishing", () => {
    // What an admin clearing the sidebar field leaves behind. Treating it as
    // "already published" would stamp a revision date onto an article with no
    // publication date at all, which reads as revised-before-it-existed.
    expect(
      publishStamp({
        now: NOW,
        publishedAt: undefined,
        status: "published",
        storedPublishedAt: "   ",
      }),
    ).toEqual({ publishedAt: NOW });
  });

  /**
   * The hook's own wiring: which of Payload's arguments each value is read
   * from. The two tests below would both pass against a hook that read the
   * right fields and computed the wrong answer — U-PUBDATE-1..5 cover that —
   * and they fail against one that computes the right answer from the wrong
   * fields.
   */
  const run = (
    data: Record<string, unknown>,
    originalDoc?: Record<string, unknown>,
  ) =>
    (stampPublishDates as CollectionBeforeChangeHook)({
      collection: undefined,
      context: {},
      data,
      operation: "update",
      originalDoc,
      req: {},
    } as never) as Record<string, unknown>;

  test("U-PUBDATE-6: a live article being edited as a draft still counts as published", () => {
    // THE CASE `_status` GETS WRONG. `originalDoc` is the *latest* version,
    // and for a published article with an edit in progress that version is
    // the draft — so `originalDoc._status` says 'draft' about an article the
    // public is reading right now. `publishedAt` is carried forward by the
    // draft copy, so it answers correctly where `_status` does not.
    const result = run(
      { _status: "published", title: "Fixed a typo" },
      { _status: "draft", publishedAt: FIRST, title: "Fixed a typo" },
    );
    expect(typeof result.revisedAt).toBe("string");
    expect(result).not.toHaveProperty("publishedAt");
  });

  test("U-PUBDATE-7: an autosave is returned untouched", () => {
    const data = { _status: "draft", title: "Half a sentence" };
    expect(run(data, { _status: "published", publishedAt: FIRST })).toEqual(data);
  });
});

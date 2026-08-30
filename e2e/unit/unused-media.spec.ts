import { expect, test } from "@playwright/test";

import { collectUploadIds } from "@/lib/media/references";
import { GRACE_MS, MIN_AGE_MS, decide, isInUse } from "@/lib/media/unused";

/**
 * U-UNUSED — the two pure halves of the weekly unused-media sweep.
 *
 * This is the only feature in the repo that deletes a member's files without
 * anybody pressing a button, so what is asserted here is not "the happy path
 * works" but "the ways this destroys something are closed".
 *
 * The first is `collectUploadIds`. An image pasted into an article is not a
 * foreign key — it is a node inside the `posts.content` JSON — so a resolver
 * that only reads relationship columns reports every in-article photo as
 * unused, and the foreign keys are all `ON DELETE set null`, meaning acting
 * on that answer blanks a post's cover with no error anywhere. The nesting
 * cases matter for the same reason: this repo enables tables and
 * `BlocksFeature`, so uploads legitimately sit several levels down.
 *
 * The second is `decide`. Every case here is a boundary, which is why `now`
 * is a parameter of the function rather than a call to `new Date()` inside
 * it — the same convention, for the same reason, as
 * `src/lib/races/calendar.ts`.
 *
 * No database, no browser, no fixtures: both functions are pure, and a test
 * that needed a Worker to prove a date comparison would be asserting
 * something else.
 */

/** The shape both MemberUploadNode and Payload's UploadServerNode serialize. */
const upload = (value: unknown) => ({ type: "upload", relationTo: "media", value });

const paragraph = (...children: unknown[]) => ({ type: "paragraph", children });

/**
 * `decide` reads four fields; everything else on a media doc is irrelevant.
 *
 * `usage: "attachment"` is the default here rather than an override, and that
 * is the whole subject of the cases below: an attachment is now the *only*
 * thing the sweep can collect, so a fixture without it describes a file the
 * sweep will never touch and every age and grace-period boundary below would
 * assert nothing.
 */
const mediaDoc = (over: Partial<Parameters<typeof decide>[0]["doc"]> = {}) =>
  ({
    id: 1,
    createdAt: "2020-01-01T00:00:00.000Z",
    usage: "attachment",
    unusedSince: null,
    ...over,
  }) as Parameters<typeof decide>[0]["doc"];

const NOW = new Date("2026-08-27T00:00:00.000Z");

test.describe("U-UNUSED reference collection", () => {
  test("U-UNUSED-1: finds an upload that exists only inside article JSON", () => {
    // The case the whole feature turns on. Nothing in the database points at
    // media 42 — it is a node in `posts.content` — and a sweep that misses it
    // deletes a photo that is on screen in a published article.
    const content = {
      root: { type: "root", children: [paragraph({ type: "text" }), upload(42)] },
    };

    expect([...collectUploadIds(content)]).toEqual([42]);
  });

  test("U-UNUSED-2: finds uploads nested inside blocks, tables and lists", () => {
    // A hand-maintained list of container types goes stale the first time
    // somebody enables a Lexical feature. This asserts the walk is generic
    // rather than a list — the three containers are the ones this repo has
    // turned on (EXPERIMENTAL_TableFeature, BlocksFeature, default lists).
    const content = {
      root: {
        type: "root",
        children: [
          { type: "block", fields: { content: { children: [upload(1)] } } },
          { type: "table", children: [{ type: "tablerow", children: [upload(2)] }] },
          { type: "list", children: [{ type: "listitem", children: [upload(3)] }] },
        ],
      },
    };

    expect([...collectUploadIds(content)].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  test("U-UNUSED-3: reads a populated upload value, not just a bare id", () => {
    // Payload's upload feature replaces `value` with the whole media
    // document at depth >= 1. The sweep reads at depth 0 so it should never
    // see this — but a resolver that silently found nothing in a populated
    // tree would report every image in every article as unused, which is
    // precisely the failure this feature must not have.
    expect([...collectUploadIds(upload({ id: 7, filename: "a.webp" }))]).toEqual([7]);
    expect([...collectUploadIds(upload("9"))]).toEqual([9]);
  });

  test("U-UNUSED-4: ignores nodes that are not media uploads", () => {
    // `relationTo` is checked, not just the node type: an upload pointing at
    // some other collection says nothing about a media file. And a malformed
    // value must not become a Set member — `new Set([NaN])` accepts it
    // silently and every later lookup misses, so the damage would surface as
    // a deleted file rather than an error.
    const ids = collectUploadIds([
      { type: "upload", relationTo: "documents", value: 5 },
      { type: "link", fields: { doc: { value: 6 } } },
      upload("not-a-number"),
      upload(null),
      upload(-3),
      upload(0),
    ]);

    expect([...ids]).toEqual([]);
  });
});

test.describe("U-UNUSED sweep policy", () => {
  test("U-UNUSED-5: only an article attachment can ever be collected", () => {
    // The public photo wall is a *query* over `media.usage`, not a set of rows
    // pointing at the file — the same shape src/lib/race-gallery.ts chose for
    // race albums. So judged by references alone every photo on /gallery is
    // unreferenced, and this is the line that stops the sweep emptying it.
    expect(isInUse({ id: 1, usage: "attachment" }, new Set())).toBe(false);
    expect(isInUse({ id: 1, usage: "gallery" }, new Set())).toBe(true);
    expect(isInUse({ id: 1, usage: "attachment" }, new Set([1]))).toBe(true);
  });

  test("U-UNUSED-5b: a private upload is kept, and an unclassified one too", () => {
    // `private` is a member's own file that they chose not to publish. Hiding
    // it from the wall must not put it on a deletion schedule — the toggle in
    // the media library is about who can see the file, never about whether it
    // survives.
    expect(isInUse({ id: 1, usage: "private" }, new Set())).toBe(true);

    // NULL means "not classified yet": the column is nullable and the backfill
    // is a separate, human-run step. Written as two explicit cases because the
    // natural way to spell this policy — `usage !== 'gallery'`, or a boolean
    // read as `!== false` — collects exactly these rows, and every age
    // boundary below would still pass while it did.
    expect(isInUse({ id: 1, usage: null }, new Set())).toBe(true);
    expect(isInUse({ id: 1, usage: undefined }, new Set())).toBe(true);
  });

  test("U-UNUSED-6: an unreferenced file under a year old is left alone", () => {
    const justUnderAYear = new Date(NOW.getTime() - MIN_AGE_MS + 1000).toISOString();

    expect(decide({ doc: mediaDoc({ createdAt: justUnderAYear }), now: NOW, referenced: new Set() }))
      .toEqual({ action: "keep", clearMark: false });
  });

  test("U-UNUSED-7: unreferenced and over a year old is marked, never deleted", () => {
    // The first run that sees a file must not delete it, whatever else is
    // true. That is the two-stage guarantee the owner's email depends on.
    const overAYear = new Date(NOW.getTime() - MIN_AGE_MS - 1000).toISOString();

    expect(decide({ doc: mediaDoc({ createdAt: overAYear }), now: NOW, referenced: new Set() }))
      .toEqual({ action: "mark" });
  });

  test("U-UNUSED-8: a marked file waits out the grace period, then deletes", () => {
    const overAYear = new Date(NOW.getTime() - MIN_AGE_MS - 1000).toISOString();
    const markedAt = new Date(NOW.getTime() - GRACE_MS + 1000);
    const longMarked = new Date(NOW.getTime() - GRACE_MS - 1000);

    expect(
      decide({
        doc: mediaDoc({ createdAt: overAYear, unusedSince: markedAt.toISOString() }),
        now: NOW,
        referenced: new Set(),
      }),
    ).toEqual({ action: "wait", deleteAfter: new Date(markedAt.getTime() + GRACE_MS) });

    expect(
      decide({
        doc: mediaDoc({ createdAt: overAYear, unusedSince: longMarked.toISOString() }),
        now: NOW,
        referenced: new Set(),
      }),
    ).toEqual({ action: "delete", markedAt: longMarked });
  });

  test("U-UNUSED-9: a marked file that gets used again loses its mark", () => {
    // The member-facing promise in the email: put it back in an article and
    // nothing else is needed. `clearMark` has to be true here or the file is
    // still deleted on schedule while being visibly in use.
    const overAYear = new Date(NOW.getTime() - MIN_AGE_MS - 1000).toISOString();
    const longMarked = new Date(NOW.getTime() - GRACE_MS - 1000).toISOString();

    expect(
      decide({
        doc: mediaDoc({ createdAt: overAYear, unusedSince: longMarked }),
        now: NOW,
        referenced: new Set([1]),
      }),
    ).toEqual({ action: "keep", clearMark: true });
  });

  test("U-UNUSED-10: a file whose age cannot be established is kept", () => {
    // Unprovable is not the same as false. Keeping an undatable row costs
    // storage; deleting it on a guess costs the file.
    for (const createdAt of [null, undefined, "", "not a date"]) {
      expect(
        decide({
          doc: mediaDoc({ createdAt: createdAt as unknown as string }),
          now: NOW,
          referenced: new Set(),
        }),
      ).toEqual({ action: "keep", clearMark: false });
    }
  });

  test("U-UNUSED-11: an unparseable mark is rewritten rather than trusted", () => {
    // A corrupt `unusedSince` compared as a date is false against
    // everything, which would leave the row neither waiting nor deletable —
    // marked forever, and never mailed about again. Sending it back through
    // `mark` restores a value that parses.
    const overAYear = new Date(NOW.getTime() - MIN_AGE_MS - 1000).toISOString();

    expect(
      decide({
        doc: mediaDoc({ createdAt: overAYear, unusedSince: "corrupt" }),
        now: NOW,
        referenced: new Set(),
      }),
    ).toEqual({ action: "mark" });
  });
});

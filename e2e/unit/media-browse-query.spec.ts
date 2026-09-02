import { expect, test } from "@playwright/test";

import { mediaBrowseParams } from "@/lib/members/use-media-browse";

/**
 * U-BROWSEQ — the `where` clauses a media list is narrowed by.
 *
 * The failure this pins is the quiet kind. A missing or wrong clause does not
 * error and does not empty the screen: `/api/media` answers with a perfectly
 * ordinary page of media, just not the one that was asked for. Two ways that
 * matters now that the same query serves two screens:
 *
 *  - the picker offered from the post editor is scoped by `ownerId`, and that
 *    clause is the *only* thing standing between an admin choosing a cover
 *    and being shown every member's library. An admin's `mediaPublicRead`
 *    returns `true`; drop the clause and the grid still looks right.
 *  - `kind` decides `image/` versus `video/`. Swap them and the video picker
 *    fills with photographs, none of which can be inserted as a video.
 *
 * Unit level because this is a pure function of six values, and driving a
 * browser to read a query string back off the network would take a minute to
 * assert what these read in milliseconds.
 */

const base = {
  kind: "all",
  limit: 24,
  ownerId: null,
  page: 1,
  sort: "-createdAt",
  usage: "all",
} as const;

/** The query as a plain object, so an assertion names a clause rather than a
 *  position in a string. */
const parse = (query: string) =>
  Object.fromEntries(new URLSearchParams(query).entries());

test.describe("U-BROWSEQ the media list's query", () => {
  test("U-BROWSEQ-1: an unnarrowed query carries paging and nothing else", () => {
    expect(parse(mediaBrowseParams({ ...base }))).toEqual({
      depth: "0",
      limit: "24",
      page: "1",
      sort: "-createdAt",
    });
  });

  test("U-BROWSEQ-2: kind maps to the mime prefix, and to the right one", () => {
    // `like` on a prefix rather than exact types: the corpus holds image/heic
    // and video/quicktime, and the prefix is the only thing they agree on.
    expect(parse(mediaBrowseParams({ ...base, kind: "photo" }))).toMatchObject({
      "where[mimeType][like]": "image/",
    });
    expect(parse(mediaBrowseParams({ ...base, kind: "video" }))).toMatchObject({
      "where[mimeType][like]": "video/",
    });
    // "all" must add no clause at all — a `like` of "" would match nothing.
    expect(parse(mediaBrowseParams({ ...base, kind: "all" }))).not.toHaveProperty(
      "where[mimeType][like]",
    );
  });

  test("U-BROWSEQ-3: ownerId scopes the query, and null leaves it unscoped", () => {
    expect(parse(mediaBrowseParams({ ...base, ownerId: 7 }))).toMatchObject({
      "where[owner][equals]": "7",
    });
    expect(parse(mediaBrowseParams({ ...base, ownerId: null }))).not.toHaveProperty(
      "where[owner][equals]",
    );
  });

  test("U-BROWSEQ-4: id 0 is still a scope", () => {
    // Falsy, and the reason this test exists: `if (state.ownerId)` would drop
    // it and hand back every member's library. Payload's own ids start at 1,
    // so this can only arrive from a bug — but the clause it silently removes
    // is the one that keeps an admin's picker to their own files, and a guard
    // that fails open is worth pinning whichever way the id arrived.
    expect(parse(mediaBrowseParams({ ...base, ownerId: 0 }))).toMatchObject({
      "where[owner][equals]": "0",
    });
  });

  test("U-BROWSEQ-5: usage narrows, and every clause coexists", () => {
    expect(
      parse(
        mediaBrowseParams({
          kind: "video",
          limit: 96,
          ownerId: 3,
          page: 4,
          sort: "filename",
          usage: "private",
        }),
      ),
    ).toEqual({
      depth: "0",
      limit: "96",
      page: "4",
      sort: "filename",
      "where[mimeType][like]": "video/",
      "where[owner][equals]": "3",
      "where[usage][equals]": "private",
    });
  });
});

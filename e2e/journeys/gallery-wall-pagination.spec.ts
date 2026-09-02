import { apiTest as test, expect } from "../helpers/api-test";

import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";
import { deleteCreatedRows } from "../helpers/teardown";

/**
 * W-WALL — /api/gallery/wall serves exactly the union /gallery's own first
 * page serves, never more and never stale.
 *
 * The route exists because the wall is not `media.usage = 'gallery'` alone —
 * it is that unioned with every item curated into a published album
 * regardless of that item's own `usage` (unionBySrc's own comment in
 * gallery-index.ts explains why: a curator can put an `attachment` file into
 * an album and it must still show up there). A pagination endpoint that
 * queried `media` directly instead of reusing `buildGalleryIndex` would get
 * page one right and then silently drop such items from every page after —
 * content missing with no error and no test that would notice unless the
 * local corpus happened to contain that exact shape of row, which it might
 * not. W-WALL-T2 is that regression test, pinned with a fixture rather than
 * left to chance.
 *
 * Imports `test` from `@playwright/test`, not ../helpers/test: this asserts
 * about a JSON API response and never opens a page, so the console-error
 * guard fixture would launch a browser for nothing — the same reasoning
 * media-private-access.spec.ts already uses for the same route shape.
 */
test.describe("W-WALL the wall endpoint serves the same union /gallery does, and only that", () => {
  const created: { collection: string; id: number }[] = [];

  test.afterEach(async ({ request }) => {
    const pending = created.splice(0, created.length).reverse();
    await deleteCreatedRows(request, pending);
  });

  test("W-WALL-T1: a file that is neither gallery usage nor curated into any album never appears", async ({
    request,
  }) => {
    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const stamp = Date.now();
    const filename = `w-wall-disclosure-${stamp}.svg`;
    const uploaded = await request.post("/api/media", {
      multipart: {
        file: {
          name: filename,
          mimeType: "image/svg+xml",
          buffer: Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"></svg>',
          ),
        },
        _payload: JSON.stringify({
          alt: `W-WALL disclosure probe ${stamp}`,
          usage: "attachment",
        }),
      },
    });
    expect(uploaded.ok(), `media create failed: ${uploaded.status()}`).toBeTruthy();
    const mediaId = (await uploaded.json()).doc.id as number;
    created.push({ collection: "media", id: mediaId });
    recordCreated({ collection: "media", id: mediaId, note: "W-WALL disclosure probe" });

    // Just-created, so it is the newest row in the corpus: if the route were
    // to leak it at all, `newestFirst` would place it first, on this exact
    // page, with no need to page further to catch it.
    const first = await request.get("/api/gallery/wall");
    expect(first.ok(), `wall request failed: ${first.status()}`).toBeTruthy();
    const body = (await first.json()) as { items: { src: string }[] };
    expect(
      body.items.some((item) => item.src.includes(filename)),
      "a file that is neither gallery usage nor curated into any album must not be on the wall",
    ).toBe(false);
  });

  test("W-WALL-T2: an attachment curated into an album is on the wall, not just the album", async ({
    request,
  }) => {
    // The regression this PR exists to prevent: a pagination endpoint that
    // queried media.usage='gallery' directly instead of reusing
    // buildGalleryIndex's union would pass this fixture on the library side
    // and never see it at all, because its usage is deliberately not
    // 'gallery'.
    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const stamp = Date.now();
    const filename = `w-wall-curated-${stamp}.svg`;
    const uploaded = await request.post("/api/media", {
      multipart: {
        file: {
          name: filename,
          mimeType: "image/svg+xml",
          buffer: Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"></svg>',
          ),
        },
        _payload: JSON.stringify({
          alt: `W-WALL union probe ${stamp}`,
          usage: "attachment",
        }),
      },
    });
    expect(uploaded.ok(), `media create failed: ${uploaded.status()}`).toBeTruthy();
    const mediaId = (await uploaded.json()).doc.id as number;
    created.push({ collection: "media", id: mediaId });
    recordCreated({ collection: "media", id: mediaId, note: "W-WALL union probe media" });

    const gallery = await request.post("/api/galleries", {
      data: {
        name: `W-WALL ${stamp}`,
        slug: `w-wall-union-${stamp}`,
        _status: "published",
        items: [{ media: mediaId }],
      },
    });
    expect(gallery.ok(), `gallery create failed: ${gallery.status()}`).toBeTruthy();
    const galleryId = (await gallery.json()).doc.id as number;
    created.push({ collection: "galleries", id: galleryId });
    recordCreated({ collection: "galleries", id: galleryId, note: "W-WALL union probe album" });

    // Newest row again, so page one is enough to prove it is reachable at
    // all — the point here is presence, not depth.
    const first = await request.get("/api/gallery/wall");
    expect(first.ok(), `wall request failed: ${first.status()}`).toBeTruthy();
    const body = (await first.json()) as { items: { src: string }[] };
    expect(
      body.items.some((item) => item.src.includes(filename)),
      "an attachment curated into a published album must still be on the wall",
    ).toBe(true);
  });

  test("W-WALL-T3: a withdrawn photo stops appearing on the very next request", async ({
    request,
  }) => {
    // The mirror of V-UNPUBLISH-T1 for this route. That spec waits out
    // /gallery's hour-long ISR window via a cache-invalidation hook; this
    // route is force-dynamic (see route.ts's header for why), so there is no
    // window to wait out — the very next request is the assertion.
    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const stamp = Date.now();
    const filename = `w-wall-withdraw-${stamp}.svg`;
    const uploaded = await request.post("/api/media", {
      multipart: {
        file: {
          name: filename,
          mimeType: "image/svg+xml",
          buffer: Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"></svg>',
          ),
        },
        _payload: JSON.stringify({
          alt: `W-WALL withdraw probe ${stamp}`,
          usage: "gallery",
        }),
      },
    });
    expect(uploaded.ok(), `media create failed: ${uploaded.status()}`).toBeTruthy();
    const mediaId = (await uploaded.json()).doc.id as number;
    created.push({ collection: "media", id: mediaId });
    recordCreated({ collection: "media", id: mediaId, note: "W-WALL withdraw probe" });

    const before = await request.get("/api/gallery/wall");
    expect(before.ok(), `wall request failed: ${before.status()}`).toBeTruthy();
    const beforeBody = (await before.json()) as { items: { src: string }[] };
    expect(
      beforeBody.items.some((item) => item.src.includes(filename)),
      "a freshly published gallery photo should be on the wall",
    ).toBe(true);

    const withdrawn = await request.patch(`/api/media/${mediaId}`, {
      data: { usage: "private" },
    });
    expect(withdrawn.ok(), `usage update failed: ${withdrawn.status()}`).toBeTruthy();

    const after = await request.get("/api/gallery/wall");
    expect(after.ok(), `wall request failed: ${after.status()}`).toBeTruthy();
    const afterBody = (await after.json()) as { items: { src: string }[] };
    expect(
      afterBody.items.some((item) => item.src.includes(filename)),
      "a withdrawn photo must not survive on a force-dynamic route",
    ).toBe(false);
  });

  test("W-WALL-T4: ?race narrows the whole wall, not just the page that is returned", async ({
    request,
  }) => {
    test.setTimeout(budget(45_000));

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    // A race of this test's own making, so the assertion below can be an
    // equality rather than a "contains" — the seeded corpus tags nothing.
    const resolved = await request.post("/api/members/race-editions/resolve", {
      data: { eventId: "other-wasatch", year: 2013 },
    });
    expect(resolved.ok(), await resolved.text()).toBeTruthy();
    const editionId = ((await resolved.json()) as { id: number }).id;

    const stamp = Date.now();
    const mine: string[] = [];
    for (const tagged of [true, false]) {
      const name = `w-wall-race-${tagged ? "in" : "out"}-${stamp}.svg`;
      const uploaded = await request.post("/api/media", {
        multipart: {
          file: {
            name,
            mimeType: "image/svg+xml",
            buffer: Buffer.from(
              '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"></svg>',
            ),
          },
          _payload: JSON.stringify({
            alt: `W-WALL race probe ${stamp}`,
            usage: "gallery",
            ...(tagged ? { raceEdition: editionId } : {}),
          }),
        },
      });
      expect(uploaded.ok(), `fixture upload failed: ${uploaded.status()}`).toBeTruthy();
      const doc = (await uploaded.json()).doc as { id: number; url: string };
      created.push({ collection: "media", id: doc.id });
      recordCreated({ collection: "media", id: doc.id, note: "W-WALL race probe" });
      // The filename, not `doc.url`: the create response returns an absolute
      // URL and `mapMediaToPhoto` maps a relative `src`, so comparing the two
      // whole strings fails on the origin rather than on the filter.
      if (tagged) mine.push(name);
    }

    const response = await request.get(`/api/gallery/wall?race=${editionId}`);
    expect(response.ok(), await response.text()).toBeTruthy();
    // Named `body`, not `page`: scripts/assert-test-strategy.mjs decides
    // whether a spec drives a browser by looking for `page.`, and a local
    // variable called `page` makes an API-only spec look like a journey that
    // skipped the console guard.
    const body = (await response.json()) as {
      items: { src: string }[];
      nextCursor: unknown;
    };

    // fixture-scoped: this race exists only because this test made it, so the
    // whole filtered wall is exactly the one file it tagged. That is the point
    // — a filter applied to the page instead of to the wall would return the
    // untagged sibling too, and a "contains" assertion could not tell.
    expect(
      body.items.map((item) => item.src.split("/").pop()),
    ).toEqual(mine);
    expect(body.nextCursor, "one item is not a paged wall").toBeNull();

    // An id nothing carries narrows to nothing rather than to everything —
    // the failure mode where the parameter is read and then ignored.
    const empty = await request.get("/api/gallery/wall?race=999999");
    expect(empty.ok()).toBeTruthy();
    expect(((await empty.json()) as { items: unknown[] }).items).toEqual([]);

    // ...and a value that is not an id at all is "every race", not an error:
    // a query string is not a contract a visitor signed.
    const garbage = await request.get("/api/gallery/wall?race=not-a-number");
    expect(garbage.ok()).toBeTruthy();
    expect(
      ((await garbage.json()) as { items: unknown[] }).items.length,
    ).toBeGreaterThan(1);
  });
});

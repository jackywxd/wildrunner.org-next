import { apiTest as test, expect } from "../helpers/api-test";
import { anonContext } from "../helpers/members";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";
import { getWithRetry } from "../helpers/request";
import { deleteCreatedRows } from "../helpers/teardown";

/**
 * M-EDITION — turning "this race, this year" into the `race-editions` id
 * `media.raceEdition` stores.
 *
 * The media library asks the catalogue now (`RaceClaimFields`) rather than
 * listing dated editions, because that list was 14 rows and held nothing
 * older than this year — a member could not tag a photo of the 2019 UTMB at
 * all. `/api/members/race-editions/resolve` is what closes the gap between
 * the question the member is asked and the foreign key the column needs.
 *
 * Contract level, not journey: what is at risk here is the endpoint's
 * behaviour under repetition, under input the picker would never produce, and
 * on the read side that consumed the result. None of it needs a browser — a
 * 404 where a 200 belongs is visible to a GET. The browser half, that a member
 * can actually pick a race the old select could not name, is `P-PHOTO`, which
 * drives the real dropzone.
 *
 * DELIBERATELY DOES NOT CLEAN UP THE EDITION IT CREATES. A `race-editions`
 * row is shared data, not this test's to withdraw: `race-records` and other
 * members' media may point at the same (event, year) by the time teardown
 * ran. It is also unnecessary — the endpoint is find-or-create, so the second
 * run finds what the first made, which is exactly what T1 asserts. The media
 * rows a test creates are still deleted by id, as always.
 */
test.describe("M-EDITION resolving a race claim to an edition", () => {
  /** In the catalogue, and old enough that no seeded edition can collide. */
  const EVENT_KEY = "other-hardrock";
  const YEAR = 2014;

  /** Uploaded by T3, deleted whatever T3 does. */
  const created: { collection: string; id: number }[] = [];

  test.afterEach(async ({ request }) => {
    const pending = created.splice(0, created.length);
    await deleteCreatedRows(request, pending);
  });

  test("M-EDITION-T1: the same claim always resolves to the same row", async ({
    request,
  }) => {
    test.setTimeout(budget(30_000));

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const first = await request.post("/api/members/race-editions/resolve", {
      data: { eventId: EVENT_KEY, year: YEAR },
    });
    expect(first.ok(), await first.text()).toBeTruthy();
    const firstId = ((await first.json()) as { id: number }).id;

    // The second call is the whole point. `resolveRaceRecordRefs` creates on
    // a miss and re-queries when the insert loses to `UNIQUE(event, year)`,
    // so a second identical claim must land on the row the first one made —
    // otherwise two members tagging the same race get two albums for it.
    const second = await request.post("/api/members/race-editions/resolve", {
      data: { eventId: EVENT_KEY, year: YEAR },
    });
    expect(second.ok(), await second.text()).toBeTruthy();
    expect(((await second.json()) as { id: number }).id).toBe(firstId);

    // What it resolved to is the race that was asked for, and it carries no
    // invented date — `startDate` empty is what makes a historical edition
    // representable at all (RaceEditions.ts), and a member's claim is never
    // allowed to say anything about the public calendar beyond event and year.
    const edition = await request.get(`/api/race-editions/${firstId}?depth=1`);
    expect(edition.ok()).toBeTruthy();
    const doc = (await edition.json()) as {
      year: number;
      startDate?: string | null;
      event: { key: string };
    };
    expect(doc.event.key).toBe(EVENT_KEY);
    expect(doc.year).toBe(YEAR);
    expect(doc.startDate ?? null).toBeNull();
  });

  test("M-EDITION-T2: an unclaimable year is refused, and writes nothing", async ({
    baseURL,
    request,
  }) => {
    test.setTimeout(budget(30_000));

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const refused = await request.post("/api/members/race-editions/resolve", {
      data: { eventId: EVENT_KEY, year: 9999 },
    });
    expect(refused.status()).toBe(400);

    // Two guards agree here and the test should survive losing either: the
    // endpoint's own bound produces the 400 above, and `race-editions.year`
    // would refuse the write regardless (RaceEditions.ts). Measured with the
    // endpoint's check removed — nothing lands, but the answer becomes a 404
    // blaming the event key. So the status assertion is what pins this
    // endpoint's behaviour, and the count below pins the outcome that must
    // hold either way.
    //
    // corpus-scoped: asserts about every row in the table, because the claim
    // is that no year 9999 edition exists anywhere — not merely that this
    // request did not add one.
    const all = await request.get(
      "/api/race-editions?where[year][equals]=9999&limit=0&pagination=false&depth=0",
    );
    expect(all.ok()).toBeTruthy();
    expect(((await all.json()) as { docs: unknown[] }).docs).toHaveLength(0);

    const anon = await anonContext(baseURL);
    const unauthorised = await anon.post("/api/members/race-editions/resolve", {
      data: { eventId: EVENT_KEY, year: YEAR },
    });
    expect(unauthorised.status()).toBe(401);
    await anon.dispose();
  });

  test("M-EDITION-T3: a race nobody has dated still gets an album", async ({
    request,
  }) => {
    test.setTimeout(budget(45_000));

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const resolved = await request.post("/api/members/race-editions/resolve", {
      data: { eventId: EVENT_KEY, year: YEAR },
    });
    expect(resolved.ok(), await resolved.text()).toBeTruthy();
    const editionId = ((await resolved.json()) as { id: number }).id;

    const slug = `race-${EVENT_KEY}-${YEAR}`;

    // The negative first, like V-RACEALBUM: without it this could pass
    // against an album a previous run left standing and prove nothing.
    const before = await getWithRetry(request, `/gallery/${slug}`);
    expect(before.status(), "the album must not exist before anything is tagged").toBe(404);

    const stamp = Date.now();
    const uploaded = await request.post("/api/media", {
      multipart: {
        file: {
          name: `m-edition-${stamp}.svg`,
          mimeType: "image/svg+xml",
          buffer: Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"></svg>',
          ),
        },
        // `usage` explicit rather than riding the field default, for the
        // reason gallery-videos.spec.ts gives: a fixture leaning on a default
        // stops pinning anything the day the default moves.
        _payload: JSON.stringify({
          alt: `M-EDITION probe ${stamp}`,
          usage: "gallery",
          raceEdition: editionId,
        }),
      },
    });
    expect(uploaded.ok(), `fixture upload failed: ${uploaded.status()}`).toBeTruthy();
    const mediaId = ((await uploaded.json()) as { doc: { id: number } }).doc.id;
    created.push({ collection: "media", id: mediaId });
    recordCreated({ collection: "media", id: mediaId, note: "M-EDITION probe" });

    // THE ASSERTION THIS FILE EXISTS FOR. `getRaceGalleries` used to take
    // `getRaceEditionOptions(now)` — every edition with a start date in the
    // past — as a whitelist, so a photo tagged to an edition nobody has dated
    // was dropped and this stayed 404 with nothing on screen to say why.
    // `race-editions.startDate` is optional exactly so history can exist
    // (RaceEditions.ts), and the rows a member's claim creates have no date,
    // so that whitelist excluded precisely the case the picker now allows.
    const album = await getWithRetry(request, `/gallery/${slug}`);
    expect(album.status(), "a dateless edition with media must have an album").toBe(200);
  });
});

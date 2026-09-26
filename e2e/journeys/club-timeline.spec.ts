import type { APIRequestContext } from "@playwright/test";

import { expect, test } from "../helpers/test";
import { budget } from "../helpers/budget";
import { waitForHydration } from "../helpers/hydration";
import { TEST_MEMBER, TEST_MEMBER_TWO, adminContext, loginContext } from "../helpers/members";

/**
 * V-CLUB — 野馬營穿越時光 (/riders/timeline), the club's whole rail.
 *
 * WHAT NEEDS A BROWSER HERE IS THE PAGING, and only that. The grouping,
 * ordering and cursor arithmetic are pure and are pinned in
 * `e2e/unit/club-timeline.spec.ts`; going up a level for those would mean
 * booting a server to check a `sort`. What cannot be checked at that level is
 * whether the reader ever *gets* the second page: an IntersectionObserver
 * that never fires, a cursor the route rejects, or an appended page that
 * lands with duplicate React keys all leave a page that renders perfectly and
 * simply stops.
 *
 * CORPUS-SCOPED BY NATURE, like `visitor.spec.ts`: a club rail is made of the
 * members' own content and a visitor can create none. Each test says what it
 * needs and fails loudly rather than passing vacuously — CI seeds the corpus,
 * so absence means the seed broke.
 */

const open = (page: import("@playwright/test").Page, path: string) =>
  page.goto(path, { waitUntil: "domcontentloaded" });

const rows = (page: import("@playwright/test").Page) =>
  page.getByTestId("club-timeline-row");

/**
 * Two members at one race this year, over the distances given — the one thing
 * the seeded corpus never has. Records are created by an admin on each
 * member's behalf; their ids come back so the caller deletes exactly those.
 *
 * This year, so the rows sort to the top of the rail and land on the
 * homepage map; the caller picks an event no seeded record uses, and no other
 * test here, so nothing else joins the meeting.
 */
async function twoMembersAt(
  admin: APIRequestContext,
  baseURL: string | undefined,
  eventId: string,
  distances: [string, string],
  /** Filled as records are made, so the caller's `finally` sees a half-made fixture too. */
  created: number[],
) {
  const members: { author?: { slug: string }; id: number }[] = [];
  for (const credentials of [TEST_MEMBER, TEST_MEMBER_TWO]) {
    // Each member's own `me`: an admin may not filter accounts by email.
    const self = await loginContext(baseURL, credentials);
    const me = await self.get("/api/users/me?depth=1");
    const body = await me.text();
    await self.dispose();
    const user = (JSON.parse(body) as { user?: { author?: { slug: string }; id: number } }).user;
    expect(user?.author?.slug, `${credentials.email} has no byline: ${body.slice(0, 300)}`).toBeTruthy();
    members.push(user as { author?: { slug: string }; id: number });
  }

  const year = new Date().getUTCFullYear();
  for (const [i, distanceId] of distances.entries()) {
    const made = await admin.post("/api/race-records", {
      data: { distanceId, eventId, owner: members[i].id, result: "finished", year },
    });
    expect(made.ok(), await made.text()).toBeTruthy();
    created.push(((await made.json()) as { doc: { id: number } }).doc.id);
  }
  return { members, year };
}

test.describe("V-CLUB 野馬營穿越時光", () => {
  test("V-CLUB-T1: scrolling to the end brings the next page, once each", async ({
    page,
  }) => {
    // By clicking, from the directory — the tab is a soft navigation, and this
    // suite has already shipped one bug that lived only there
    // (docs/testing-incidents.md).
    await open(page, "/riders");
    await page.getByTestId("club-timeline-link").click();
    await expect(page).toHaveURL(/\/riders\/timeline$/, { timeout: budget(15_000) });

    const sentinel = page.getByTestId("club-timeline-sentinel");
    await expect(
      sentinel,
      "the corpus fits in one page, so this test cannot observe the thing it is for",
    ).toBeAttached();

    const first = await rows(page).count();
    expect(first).toBeGreaterThan(0);

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect
      .poll(() => rows(page).count(), { timeout: budget(15_000) })
      .toBeGreaterThan(first);

    // No row twice. The cursor's fallback branch can legitimately return a row
    // already on screen when the row it pointed at has gone, and two React
    // children with one key is a console error — which the guard in
    // e2e/helpers/test.ts turns into a failure, but only if a duplicate ever
    // reaches React. This says it must not reach the reader either.
    const keys = await rows(page).evaluateAll((nodes) =>
      nodes.map((node) => node.textContent?.slice(0, 120) ?? ""),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("V-CLUB-T3: the homepage's highlighted link opens it", async ({ page }) => {
    // The homepage is where most people arrive, and 穿越時光 is its highlighted
    // call to action — so this is the path most visitors will take to the
    // rail, and the suite has to walk it. By clicking, not by URL: this
    // project has already shipped a bug that lived entirely in soft
    // navigation (docs/testing-incidents.md).
    await open(page, "/");
    await page.getByTestId("home-timeline-link").click();
    await expect(page).toHaveURL(/\/riders\/timeline$/, { timeout: budget(15_000) });
    await expect(page.getByTestId("club-timeline")).toBeVisible();
  });

  test("V-CLUB-T4: albums of no race become months, and still name their albums", async ({
    page,
  }) => {
    await open(page, "/riders/timeline");

    const months = page.getByTestId("timeline-month");
    await expect(
      months.first(),
      "no month of pictures on the club rail — the corpus has no albums, not the page",
    ).toBeVisible();

    // The names people wrote survive the merge, and each is the way back to
    // that album. A month card that only said "51 張" would be a dead end.
    const firstLink = months.first().getByTestId("timeline-album-links").locator("a").first();
    await expect(firstLink).toBeVisible();
    const href = await firstLink.getAttribute("href");
    expect(href).toMatch(/^\/gallery\/[^/]+$/);
    const response = await page.request.get(href as string);
    expect(response.status(), `${href} is named on the rail but does not open`).toBe(200);
  });

  test("V-CLUB-T5: tagging an album with a race moves it out of its month onto that race", async ({
    baseURL,
    page,
  }) => {
    // The only test here that signs in, and it pays for it: an admin login,
    // three API round trips and a page load, against a dev server that may
    // still be compiling the route. The others navigate and assert. Through
    // `budget()` so a deployed target scales it, per docs/testing-strategy.md §7.
    test.setTimeout(budget(60_000));

    // THE TEST OWNS THIS FIXTURE rather than the seeded corpus carrying it.
    // Tagging an album in the seed would change ambient data every other spec
    // reads; doing it here keeps the change inside one test and lets the
    // teardown put it back — including when the assertions fail, which is the
    // whole point of `finally` (docs/testing-strategy.md).
    const admin = await adminContext(baseURL);
    const albums = await admin.get("/api/galleries?limit=1&depth=0&sort=slug");
    expect(albums.ok(), await albums.text()).toBeTruthy();
    const album = ((await albums.json()) as { docs: { id: number; slug: string }[] }).docs[0];
    expect(album, "no album in the corpus to tag").toBeTruthy();

    // An edition the rail actually draws a row for — otherwise the picture has
    // nowhere to attach and correctly stays in its month, which would make
    // this test observe the opposite of what it is for.
    const records = await admin.get("/api/race-records?limit=1&depth=0");
    const record = ((await records.json()) as { docs: { edition: number }[] }).docs[0];
    expect(record?.edition, "no race record with an edition to attach to").toBeTruthy();

    try {
      const tagged = await admin.patch(`/api/galleries/${album.id}`, {
        data: { raceEdition: record.edition },
      });
      expect(tagged.ok(), await tagged.text()).toBeTruthy();

      await open(page, "/riders/timeline");

      // THE WHOLE RAIL, not the first page of it. The rail paginates at ten
      // rows and the race this album now belongs to is older than that — the
      // first version of this test asserted against page one and failed
      // looking for a link that was three rows below the fold. Scroll until
      // the sentinel is gone, which is the page saying it has everything.
      const sentinel = page.getByTestId("club-timeline-sentinel");
      for (let i = 0; i < 20 && (await sentinel.count()) > 0; i += 1) {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(budget(300));
      }

      // Its pictures are now on a race row, so no month card may name it.
      const named = page.locator(`[data-testid="timeline-album-links"] [data-album-slug="${album.slug}"]`);
      const inAMonth = page.locator(
        `[data-testid="timeline-month"] [data-album-slug="${album.slug}"]`,
      );
      await expect(named.first()).toBeVisible({ timeout: budget(15_000) });
      await expect(inAMonth).toHaveCount(0);
      await expect(page.getByTestId("timeline-race-media").first()).toBeVisible();
    } finally {
      // By id, and the value it had: this album was untagged, and every album
      // in the corpus is. Never a pattern, never "clear the column".
      await admin.patch(`/api/galleries/${album.id}`, { data: { raceEdition: null } });
      await admin.dispose();
    }
  });

  test("V-CLUB-T6: the 交會 view pulls two members at one edition into one meeting", async ({
    baseURL,
    page,
  }) => {
    // Signs in and writes, like T5, and pays for it the same way.
    test.setTimeout(budget(60_000));

    // THE TEST OWNS THIS FIXTURE: the seeded corpus has no race two members
    // ran together, so without one the view has nothing to draw and a green
    // run would mean nothing. Two distances of one edition, on purpose — the
    // rows stay split by distance and the meeting has to span them anyway
    // (U-BRAID-T1 pins the logic; this pins that the page draws it).
    const admin = await adminContext(baseURL);
    const created: number[] = [];
    try {
      const { members, year } = await twoMembersAt(
        admin,
        baseURL,
        "other-squamish-50",
        ["50k", "23k"],
        created,
      );
      // By clicking the tab — a soft navigation, which is where this suite
      // has shipped a bug before (docs/testing-incidents.md).
      await open(page, "/riders/timeline");
      await waitForHydration(page);
      await page.locator('[data-testid="club-timeline-view"][data-view="braid"]').click();
      await expect(page).toHaveURL(/\/riders\/timeline\?view=braid$/, { timeout: budget(15_000) });
      await expect(page.getByTestId("club-timeline")).toHaveAttribute("data-view", "braid");

      // Both distance rows are one meeting, and both members have a lane.
      const squamish = page
        .locator(`[data-testid="club-timeline-row"][data-year="${year}"]`)
        .filter({ hasText: "Squamish 50" });
      await expect(squamish).toHaveCount(2);
      await expect(squamish.getByTestId("club-row-meeting")).toHaveCount(2);
      const legend = page.getByTestId("braid-legend");
      for (const member of members) {
        await expect(legend.locator(`[data-lane-slug="${member.author?.slug}"]`)).toBeAttached();
      }
      await expect(page.locator("[data-braid-meeting]:visible").first()).toBeVisible();

      // And the default view is untouched by any of it.
      await page.locator('[data-testid="club-timeline-view"][data-view="single"]').click();
      await expect(page).toHaveURL(/\/riders\/timeline$/, { timeout: budget(15_000) });
      await expect(page.getByTestId("club-timeline")).toHaveAttribute("data-view", "single");
      await expect(page.getByTestId("club-row-meeting")).toHaveCount(0);
    } finally {
      // By the ids captured when they were created — never a pattern.
      for (const id of created) await admin.delete(`/api/race-records/${id}`);
      await admin.dispose();
    }
  });

  test("V-CLUB-T7: a meeting on the homepage map opens that race on the braided rail", async ({
    baseURL,
    page,
  }) => {
    test.setTimeout(budget(90_000));

    // The map only exists once somebody has run with somebody, and the seeded
    // corpus has nobody — so, as in T6, the test brings its own meeting. A
    // different event from T6's, so neither sees the other's rows.
    const admin = await adminContext(baseURL);
    const created: number[] = [];
    try {
      const { year } = await twoMembersAt(admin, baseURL, "utmb-whistler", ["50k", "25k"], created);

      await open(page, "/");
      await expect(page.getByTestId("home-trail-map")).toBeVisible({ timeout: budget(15_000) });

      // The caption names a meeting only while the runners are there, so wait
      // for the loop to reach this one — it is this year's, the last on the map.
      const meeting = page
        .getByTestId("home-trail-meeting")
        .filter({ hasText: `${year} · ` });
      await expect(meeting).toBeVisible({ timeout: budget(30_000) });
      await meeting.click();

      await expect(page).toHaveURL(/\/riders\/timeline\?view=braid&at=.+#row-/, {
        timeout: budget(15_000),
      });
      // The fragment names the element that holds this race. Not "the row is
      // in the viewport": this year's race is the first on the rail, so it
      // would be on screen whether or not the link pointed anywhere — an
      // assertion that could not fail here. Whether the browser scrolls to an
      // id is the browser's business; that the id is the right one is ours.
      const anchor = decodeURIComponent(new URL(page.url()).hash.slice(1));
      const target = page.locator(`[id="${anchor}"]`);
      await expect(target).toHaveCount(1);
      await expect(target.getByTestId("club-timeline-row").first()).toHaveAttribute(
        "data-year",
        String(year),
      );
      await expect(target).toContainText(/Whistler|威士拿/);
    } finally {
      for (const id of created) await admin.delete(`/api/race-records/${id}`);
      await admin.dispose();
    }
  });

  test("V-CLUB-T2: 列印全部 loads the rest of the rail before opening the dialog", async ({
    page,
  }) => {
    // Stubbed before the page runs, because `window.print()` opens a native
    // dialog that nothing in Playwright can dismiss. The stub replaces an
    // external side effect; it does not touch anything this test asserts on.
    await page.addInitScript(() => {
      (window as unknown as { __printed: number }).__printed = 0;
      window.print = () => {
        (window as unknown as { __printed: number }).__printed += 1;
      };
    });

    await open(page, "/riders/timeline");
    await expect(
      page.getByTestId("club-timeline-sentinel"),
      "the corpus fits in one page, so nothing would be left to load before printing",
    ).toBeAttached();

    const before = await rows(page).count();
    await page.getByTestId("club-timeline-print").click();

    // The sentinel only exists while a cursor does, so its disappearance is
    // the page saying it has everything — which is the claim being tested:
    // printing an infinite list must not print the part that happened to be
    // on screen.
    await expect(page.getByTestId("club-timeline-sentinel")).toHaveCount(0, {
      timeout: budget(20_000),
    });
    expect(await rows(page).count()).toBeGreaterThan(before);

    await expect
      .poll(
        () => page.evaluate(() => (window as unknown as { __printed: number }).__printed),
        { timeout: budget(10_000) },
      )
      .toBe(1);
  });
});

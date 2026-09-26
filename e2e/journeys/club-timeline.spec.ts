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
 * Twenty seconds of tones as a WAV — something this lane's Chromium can
 * decode, standing in for the site's AAC music in V-CLUB-T9. Several
 * frequencies, each swelling at its own rate, so the spectrum has a shape.
 */
function toneWav(seconds = 20, rate = 22050): Buffer {
  const samples = seconds * rate;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  const tones = [110, 220, 440, 880, 1760, 3520];
  for (let i = 0; i < samples; i += 1) {
    const t = i / rate;
    let value = 0;
    tones.forEach((frequency, k) => {
      value += Math.sin(2 * Math.PI * frequency * t) * (0.5 + 0.5 * Math.sin(2 * Math.PI * (0.3 + k * 0.2) * t));
    });
    buffer.writeInt16LE(Math.round((value / tones.length) * 30000), 44 + i * 2);
  }
  return buffer;
}

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
      // The site's page transition keeps the outgoing view mounted while the
      // new one arrives, so wait for the braid and then for it to be alone —
      // otherwise every locator below may be reading the view being left.
      await expect(page.locator('[data-testid="club-timeline"][data-view="braid"]')).toBeVisible({
        timeout: budget(15_000),
      });
      await expect(page.getByTestId("club-timeline")).toHaveCount(1, { timeout: budget(10_000) });

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
      await expect(page.locator('[data-testid="club-timeline"][data-view="single"]')).toBeVisible({
        timeout: budget(15_000),
      });
      await expect(page.getByTestId("club-timeline")).toHaveCount(1, { timeout: budget(10_000) });
      await expect(page.getByTestId("club-row-meeting")).toHaveCount(0);

      // And 對照, beside the two drawings, leaves for 成員對照 — T8 walks the
      // compare page itself, entering from a member's page instead.
      await page.getByTestId("club-timeline-compare").click();
      await expect(page).toHaveURL(/\/riders\/compare$/, { timeout: budget(15_000) });
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

  test("V-CLUB-T8: 對照 from a member's page zips two members together, side by side when there is room", async ({
    baseURL,
    page,
  }) => {
    test.setTimeout(budget(90_000));

    // Their own meeting, as in T6 and T7, on an event neither of those uses.
    const admin = await adminContext(baseURL);
    const created: number[] = [];
    try {
      const { members, year } = await twoMembersAt(
        admin,
        baseURL,
        "other-canadian-death-race",
        ["118k", "42k"],
        created,
      );
      // Picked in reverse-sorted order, so the canonical address — sorted —
      // differs from the one in the bar and the assertion on it can fail.
      const [first, second] = members.map((member) => member.author?.slug as string).sort().reverse();

      // And one race of the first member's alone, so the two-member layout
      // has a row that belongs on one side.
      const firstId = members.find((member) => member.author?.slug === first)?.id;
      const solo = await admin.post("/api/race-records", {
        data: { distanceId: "120m", eventId: "other-fat-dog", owner: firstId, result: "finished", year },
      });
      expect(solo.ok(), await solo.text()).toBeTruthy();
      created.push(((await solo.json()) as { doc: { id: number } }).doc.id);

      // In from the timeline and through the picker by clicking, as a reader
      // would. The site's page transition keeps the outgoing page mounted for
      // a moment — and the address changes before the new page arrives — so
      // each click is made in the picker that shows the selection so far,
      // never in whichever picker happens to be first in the DOM.
      const pickerWith = (...slugs: string[]) =>
        slugs.reduce(
          (picker, slug) => picker.filter({ has: page.locator(`[data-compare-selected="${slug}"]`) }),
          page.getByTestId("compare-picker"),
        );
      // In from the first member's own page, which arrives with them picked.
      await page.setViewportSize({ height: 900, width: 1280 });
      await open(page, `/riders/${first}`);
      await waitForHydration(page);
      await page.getByTestId("rider-compare-link").click();
      await expect(page).toHaveURL(new RegExp(`/riders/compare\\?with=${first}$`), {
        timeout: budget(15_000),
      });
      // The transition can hold two copies of the arriving page for a moment.
      await expect(pickerWith(first)).toHaveCount(1, { timeout: budget(10_000) });
      await pickerWith(first).locator(`[data-compare-add="${second}"]`).click();
      await expect(page).toHaveURL(new RegExp(`with=${first},${second}$`), {
        timeout: budget(15_000),
      });
      await expect(page.getByTestId("compare-picker")).toHaveCount(1, { timeout: budget(10_000) });

      // Both distance rows are the one race they ran together, zipped.
      const race = page
        .locator(`[data-testid="club-timeline-row"][data-year="${year}"]`)
        .filter({ hasText: "Canadian Death Race" });
      await expect(race).toHaveCount(2);
      await expect(race.getByTestId("club-row-meeting")).toHaveCount(2);
      await expect(page.getByTestId("club-timeline")).toHaveCount(1, { timeout: budget(10_000) });
      await expect(page.getByTestId("club-timeline")).toHaveAttribute("data-view", "compare");
      // Drawn as a zip — teeth, not the club rail's interchange. They close as
      // the race scrolls into view, and on this page the rail starts below
      // the picker, so scroll to it as a reader would.
      await race.first().scrollIntoViewIfNeeded();
      await expect(page.locator("[data-braid-zip]:visible").first()).toBeVisible({
        timeout: budget(5_000),
      });
      const pair = page.locator(`[data-testid="compare-pairs"] [data-pair="${first},${second}"]`);
      await expect(pair).toHaveAttribute("data-count", /^[1-9]/);

      // Two members on a wide screen: each one's own race on their side, the
      // race they ran together across the middle — measured, not only
      // labelled, because the label is set whatever the CSS then does.
      const own = page
        .locator(`[data-compare-side] [data-testid="club-timeline-row"][data-year="${year}"]`)
        .filter({ hasText: "Fat Dog" });
      const together = race.first();
      await expect(own).toHaveCount(1);
      const middle = 1280 / 2;
      const ownBox = await own.boundingBox();
      const togetherBox = await together.boundingBox();
      expect(ownBox && ownBox.x + ownBox.width, "the first member's own race sits left of the lanes").toBeLessThan(middle);
      expect(
        togetherBox && Math.abs(togetherBox.x + togetherBox.width / 2 - middle),
        "the race they ran together sits across the lanes",
      ).toBeLessThan(4);

      // On a phone there is no room for sides: one column again.
      await page.setViewportSize({ height: 844, width: 390 });
      await expect
        .poll(async () => {
          const [a, b] = await Promise.all([own.boundingBox(), together.boundingBox()]);
          return a && b ? Math.round(a.x - b.x) : null;
        })
        .toBe(0);
      await page.setViewportSize({ height: 900, width: 1280 });

      // Known to search engines by one address, whichever order they were picked in.
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        new RegExp(`/riders/compare\\?with=${[first, second].sort().join(",")}$`),
      );

      // Unpicking one leaves a single member: the picker, and no rail.
      await pickerWith(first, second).locator(`[data-compare-selected="${first}"]`).click();
      await expect(page).toHaveURL(new RegExp(`with=${second}$`), { timeout: budget(15_000) });
      await expect(page.getByTestId("compare-picker")).toHaveCount(1, { timeout: budget(10_000) });
      await expect(page.getByTestId("club-timeline")).toHaveCount(0);
    } finally {
      for (const id of created) await admin.delete(`/api/race-records/${id}`);
      await admin.dispose();
    }
  });

  test("V-CLUB-T9: 播放 drifts down the rail with the site's music, drawn along the bottom and playing on to the next page", async ({
    page,
  }) => {
    test.setTimeout(budget(60_000));

    // The real file is served, as an audio type...
    const served = await page.request.get("/audio/life-long-love.m4a");
    expect(served.status(), "the music file is not served").toBe(200);
    expect(served.headers()["content-type"]).toMatch(/^audio\//);

    // ...but this lane's Chromium ships without an AAC decoder, so the page
    // is given a tone it can decode in its place. Without that the music
    // could never be heard to play here, and the spectrum would have nothing
    // to draw — every assertion below about them would be unable to fail.
    // Whether the real song is audible, and survives a locked iPhone, is
    // checked on a device, not in this lane.
    await page.route("**/audio/life-long-love.m4a", (route) =>
      route.fulfill({ body: toneWav(), contentType: "audio/wav", status: 200 }),
    );

    await page.setViewportSize({ height: 720, width: 1280 });
    await open(page, "/riders/timeline");
    await waitForHydration(page);

    const audio = page.getByTestId("site-music-audio");
    // Held across the navigation below: the same element still connected
    // afterwards is what "plays on to the next page" means.
    const element = await audio.elementHandle();

    const before = await page.evaluate(() => window.scrollY);
    await page.getByTestId("club-timeline-play").click();
    await expect(page.getByTestId("club-timeline-play")).toHaveAttribute("aria-pressed", "true");

    // It plays, the page drifts, and the band along the bottom moves with it.
    await expect
      .poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime), {
        timeout: budget(10_000),
      })
      .toBeGreaterThan(1);
    await expect
      .poll(() => page.evaluate(() => window.scrollY), { timeout: budget(10_000) })
      .toBeGreaterThan(before + 20);
    await expect
      .poll(
        () =>
          page.getByTestId("site-music-spectrum").evaluate((canvas: HTMLCanvasElement) => {
            const pixels = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
            let lit = 0;
            for (let i = 3; pixels && i < pixels.length; i += 4) if (pixels[i] > 0) lit += 1;
            return lit;
          }),
        { timeout: budget(10_000) },
      )
      .toBeGreaterThan(0);
    await expect(page.getByTestId("site-music-toggle")).toBeVisible();

    // To another page by clicking, as a reader would — a soft navigation —
    // and the same element is still there, still playing.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator("header").getByRole("link", { name: /關於/ }).first().click();
    await expect(page).toHaveURL(/\/about$/, { timeout: budget(15_000) });
    expect(await element?.evaluate((node) => node.isConnected), "the music element was replaced").toBe(true);
    expect(await audio.evaluate((node: HTMLAudioElement) => node.paused)).toBe(false);

    // And the corner button pauses it there.
    await page.getByTestId("site-music-toggle").click();
    await expect.poll(() => audio.evaluate((node: HTMLAudioElement) => node.paused)).toBe(true);
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

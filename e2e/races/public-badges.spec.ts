import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "@playwright/test";

import { expectOkJson } from "../helpers/api";
import {
  TEST_MEMBER,
  TEST_MEMBER_TWO,
  adminContext,
  ensureMemberUser,
  loginContext,
} from "../helpers/members";
import { findRaceEvent } from "@/lib/races/catalogue";

/**
 * Phase D — badges on the public rider pages.
 *
 * Placed under e2e/races/ so A-T5's guard covers this file too: nothing here
 * may assert artwork, only the contract.
 */

const UTMB_EVENT = findRaceEvent("utmb-lavaredo")!;
const WTM_EVENT = findRaceEvent("wtm-hk100")!;

type Rider = { id: number; name: string; slug: string };

async function riderFor(context: APIRequestContext): Promise<Rider> {
  const me = await expectOkJson<{ user?: { author?: number | { id: number } } }>(
    await context.get("/api/users/me"),
  );
  const author = me.user?.author;
  const id = typeof author === "object" && author ? author.id : author;
  if (!id) throw new Error(`No author linked: ${JSON.stringify(me)}`);
  const doc = await expectOkJson<Rider>(
    await context.get(`/api/authors/${id}?depth=0`),
  );
  return { id: doc.id, name: doc.name, slug: doc.slug };
}

test.describe("D badges on public rider pages", () => {
  let admin: APIRequestContext;
  let memberOne: APIRequestContext;
  let memberTwo: APIRequestContext;
  let riderOne: Rider;
  let riderTwo: Rider;

  const created: number[] = [];

  async function addRecord(
    context: APIRequestContext,
    eventId: string,
    distanceId: string,
    year: number,
  ) {
    const body = await expectOkJson<{ doc: { id: number } }>(
      await context.post("/api/race-records", {
        data: { distanceId, eventId, year },
      }),
    );
    created.push(body.doc.id);
    return body.doc.id;
  }

  test.beforeAll(async ({ baseURL }) => {
    admin = await adminContext(baseURL);
    await ensureMemberUser(admin, TEST_MEMBER);
    await ensureMemberUser(admin, TEST_MEMBER_TWO);
    memberOne = await loginContext(baseURL, TEST_MEMBER);
    memberTwo = await loginContext(baseURL, TEST_MEMBER_TWO);
    riderOne = await riderFor(memberOne);
    riderTwo = await riderFor(memberTwo);

    // Start from empty so counts below mean what they say.
    for (const context of [memberOne, memberTwo]) {
      const existing = await context.get("/api/race-records?limit=200&depth=0");
      if (existing.ok()) {
        const body = (await existing.json()) as { docs: { id: number }[] };
        for (const doc of body.docs) {
          await context.delete(`/api/race-records/${doc.id}`);
        }
      }
    }
  });

  test.afterAll(async () => {
    for (const id of created) await admin?.delete(`/api/race-records/${id}`);
    await Promise.all([
      admin?.dispose(),
      memberOne?.dispose(),
      memberTwo?.dispose(),
    ]);
  });

  test("D-T1/D-T2: badges reach the card and the profile, grouped by series", async ({
    page,
  }) => {
    const stamp = Date.now();
    await addRecord(memberOne, UTMB_EVENT.id, UTMB_EVENT.distances[0].id, 2021);
    await addRecord(memberOne, WTM_EVENT.id, WTM_EVENT.distances[0].id, 2022);

    // Anonymous — `page` carries no session.
    await page.goto(`/riders?t=${stamp}`);
    const card = page.locator(
      `[data-testid="rider-card"][data-rider-slug="${riderOne.slug}"]`,
    );
    const cardBadges = card.locator('[data-testid="race-badge"]');
    await expect(cardBadges).toHaveCount(2);

    await page.goto(`/riders/${riderOne.slug}?t=${stamp}`);
    const wall = page.getByTestId("rider-badge-wall");
    await expect(wall).toBeVisible();

    // One group per series, each holding its own event and not the other's.
    const utmbGroup = page.locator('[data-testid="rider-badge-group"][data-series="utmb"]');
    const wtmGroup = page.locator('[data-testid="rider-badge-group"][data-series="wtm"]');
    await expect(
      utmbGroup.locator(`[data-event-id="${UTMB_EVENT.id}"]`),
    ).toHaveCount(1);
    await expect(utmbGroup.locator(`[data-event-id="${WTM_EVENT.id}"]`)).toHaveCount(0);
    await expect(wtmGroup.locator(`[data-event-id="${WTM_EVENT.id}"]`)).toHaveCount(1);

    const badge = utmbGroup.locator(`[data-event-id="${UTMB_EVENT.id}"]`);
    await expect(badge).toHaveAttribute("data-distance-id", UTMB_EVENT.distances[0].id);
    await expect(badge).toHaveAttribute("data-year", "2021");
  });

  test("D-T3/D-T4: adding and removing a record reaches the public page", async ({
    page,
  }) => {
    const added = await addRecord(
      memberOne,
      "utmb-eiger",
      "50k",
      2019,
    );

    // Unique query string per visit: pages ship `public, max-age=3600`, so a
    // bare URL would serve the browser's pre-edit copy (same reason R-T7
    // does this).
    await page.goto(`/riders/${riderOne.slug}?t=${Date.now()}`);
    await expect(page.locator('[data-event-id="utmb-eiger"]')).toHaveCount(1);

    const deleted = await memberOne.delete(`/api/race-records/${added}`);
    expect(deleted.ok()).toBeTruthy();
    created.splice(created.indexOf(added), 1);

    await page.goto(`/riders/${riderOne.slug}?t=${Date.now()}`);
    await expect(page.locator('[data-event-id="utmb-eiger"]')).toHaveCount(0);
  });

  test("D-T5: records are grouped to the right rider", async ({ page }) => {
    // The join runs through `authors.owner`, so getting it wrong would show
    // one member's races on another's page — the failure this pins.
    await addRecord(memberTwo, "utmb-canyons", "100k", 2018);

    const stamp = Date.now();
    await page.goto(`/riders/${riderTwo.slug}?t=${stamp}`);
    await expect(page.locator('[data-event-id="utmb-canyons"]')).toHaveCount(1);

    await page.goto(`/riders/${riderOne.slug}?t=${stamp}`);
    await expect(page.locator('[data-event-id="utmb-canyons"]')).toHaveCount(0);
  });

  test("D-T6: no account PII rides in with the badges", async ({ page }) => {
    // `race-records.owner` is a `users` relationship, so a depth or select
    // slip would pull whole accounts onto a public page — the same leak R-T6
    // guards for authors.
    const stamp = Date.now();

    await page.goto(`/riders?t=${stamp}`);
    const directory = await page.content();
    expect(directory).not.toContain(TEST_MEMBER.email);
    expect(directory).not.toContain("invitePending");
    expect(directory).not.toContain("sessions");

    await page.goto(`/riders/${riderOne.slug}?t=${stamp}`);
    const profile = await page.content();
    expect(profile).not.toContain(TEST_MEMBER.email);
    expect(profile).not.toContain("invitePending");
    expect(profile).not.toContain("sessions");
  });

  test("D-T7: a rider with no records renders no badge container", async ({
    page,
  }) => {
    // An empty flex row under half the cards reads as a broken layout.
    const bare = await expectOkJson<{ docs: { slug: string }[] }>(
      await admin.get(
        "/api/authors?limit=200&depth=0&where[owner][exists]=true",
      ),
    );
    const withRecords = new Set([riderOne.slug, riderTwo.slug]);
    const empty = bare.docs.find((doc) => !withRecords.has(doc.slug));
    test.skip(!empty, "no ownerless-record rider available in this database");

    await page.goto(`/riders/${empty!.slug}?t=${Date.now()}`);
    await expect(page.getByTestId("rider-badge-wall")).toHaveCount(0);
    await expect(page.getByTestId("rider-badge-row")).toHaveCount(0);
  });
});

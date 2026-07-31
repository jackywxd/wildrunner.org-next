import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectOkJson } from "../helpers/api";
import {
  TEST_MEMBER,
  TEST_MEMBER_TWO,
  adminContext,
  ensureMemberUser,
  loginContext,
} from "../helpers/members";
import { lexicalParagraph } from "@/lib/lexical-helpers";

/**
 * R — the public rider directory.
 *
 * Everything here is sourced from `authors`; `users` (email, role, invite
 * state) must never surface, which R-T6 asserts directly.
 */

type Rider = { id: number; name: string; slug: string };

/**
 * The author slug is derived from the email but `uniqueAuthorSlug` may add a
 * numeric suffix when a previous run left a record behind, so it is looked
 * up rather than assumed.
 */
async function riderFor(context: APIRequestContext): Promise<Rider> {
  const me = await expectOkJson<{ user?: { author?: number | { id: number } } }>(
    await context.get("/api/users/me"),
  );
  const author = me.user?.author;
  const id = typeof author === "object" && author ? author.id : author;
  if (!id) throw new Error(`No author linked to this account: ${JSON.stringify(me)}`);

  const doc = await expectOkJson<Rider>(await context.get(`/api/authors/${id}?depth=0`));
  return { id: doc.id, name: doc.name, slug: doc.slug };
}

test.describe("R public rider directory", () => {
  let admin: APIRequestContext;
  let memberOne: APIRequestContext;
  let memberTwo: APIRequestContext;
  let riderOne: Rider;
  let riderTwo: Rider;

  test.beforeAll(async ({ baseURL }) => {
    admin = await adminContext(baseURL);
    await ensureMemberUser(admin, TEST_MEMBER);
    await ensureMemberUser(admin, TEST_MEMBER_TWO);

    memberOne = await loginContext(baseURL, TEST_MEMBER);
    memberTwo = await loginContext(baseURL, TEST_MEMBER_TWO);
    riderOne = await riderFor(memberOne);
    riderTwo = await riderFor(memberTwo);
  });

  test.afterAll(async () => {
    await Promise.all([
      admin?.dispose(),
      memberOne?.dispose(),
      memberTwo?.dispose(),
    ]);
  });

  test("R-T1: anonymous sees every member in the directory", async ({ page }) => {
    await page.goto("/riders");

    await expect(page.getByTestId("rider-list")).toBeVisible();
    await expect(
      page.locator(`[data-testid="rider-card"][data-rider-slug="${riderOne.slug}"]`),
    ).toBeVisible();
    await expect(
      page.locator(`[data-testid="rider-card"][data-rider-slug="${riderTwo.slug}"]`),
    ).toBeVisible();
  });

  test("R-T2: a card opens that member's page", async ({ page }) => {
    await page.goto("/riders");

    const card = page.locator(
      `[data-testid="rider-card"][data-rider-slug="${riderOne.slug}"]`,
    );

    // Assert the destination before following it, the way G-T1/G-T2 split
    // this: a card pointing at the wrong member then fails here and says so,
    // rather than surfacing as a navigation timeout.
    await expect(card).toHaveAttribute("href", `/riders/${riderOne.slug}`);
    await card.click();

    // `waitForURL` rather than `toHaveURL`, whose 5s expect timeout is too
    // tight here: this is the first test to reach /riders/[slug], and
    // `next dev` compiles a route on demand the first time it is requested.
    // On a loaded CI runner that cold compile alone can outlast 5s — observed
    // as an R-T2 flake that passed on retry.
    await page.waitForURL(`**/riders/${riderOne.slug}`, { timeout: 30_000 });
    await expect(page.getByTestId("rider-name")).toHaveText(riderOne.name);
  });

  test("R-T3: a member's page lists their posts and nobody else's", async ({
    page,
  }) => {
    const stamp = Date.now();
    const title = `R-T3 rider post ${stamp}`;
    const slug = `r-t3-rider-${stamp}`;

    // Bylined to riderOne but created (and therefore owned) by the admin —
    // the page must key on `author`, not `owner`.
    const created = await expectOkJson<{ doc: { id: number } }>(
      await admin.post("/api/posts", {
        data: {
          author: riderOne.id,
          content: lexicalParagraph("R-T3 body"),
          description: "R-T3 description",
          publishedAt: new Date().toISOString(),
          slug,
          title,
          _status: "published",
        },
      }),
    );
    expect(created.doc.id).toBeTruthy();

    await page.goto(`/riders/${riderOne.slug}?t=${stamp}`);
    await expect(
      page.locator(`[data-testid="rider-post"][data-post-slug="${slug}"]`),
    ).toBeVisible();

    await page.goto(`/riders/${riderTwo.slug}?t=${stamp}`);
    await expect(
      page.locator(`[data-testid="rider-post"][data-post-slug="${slug}"]`),
    ).toHaveCount(0);
  });

  test("R-T4: the homepage and the top nav both link to the directory", async ({
    page,
  }) => {
    await page.goto("/");

    const cta = page.getByTestId("home-riders-link");
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/riders");

    await expect(page.locator('a[href="/riders"]').first()).toBeVisible();
  });

  test("R-T5: an unknown rider slug renders not-found, not an empty profile", async ({
    page,
  }) => {
    await page.goto(`/riders/not-a-rider-${Date.now()}`);

    // Asserting content rather than status on purpose: `notFound()` here is
    // reached after streaming has begun, so the response is already committed
    // as 200. That is true of `/posts/<unknown>` and `/gallery/<unknown>` in
    // production as well — a pre-existing soft-404, not something this route
    // introduced. What matters for this feature is that no profile shell
    // renders for a slug that does not exist.
    await expect(page.getByTestId("rider-profile")).toHaveCount(0);
    await expect(page.getByTestId("rider-name")).toHaveCount(0);
  });

  test("R-T6: no account PII reaches either public page", async ({ page }) => {
    await page.goto("/riders");
    expect(await page.content()).not.toContain(TEST_MEMBER.email);

    await page.goto(`/riders/${riderOne.slug}`);
    const html = await page.content();
    expect(html).not.toContain(TEST_MEMBER.email);
    // `role` and `invitePending` live on `users`; leaking them would mean the
    // page is reading the wrong collection.
    expect(html).not.toContain("invitePending");
  });

  test("R-T7: a bio edit reaches the public page", async ({ page }) => {
    const stamp = Date.now();
    const bio = `R-T7 bio ${stamp}`;

    const updated = await memberOne.patch(`/api/authors/${riderOne.id}`, {
      data: { bio },
    });
    expect(updated.ok()).toBeTruthy();

    // Unique query string: pages ship `public, max-age=3600`, so revisiting
    // the bare URL would serve the browser's pre-edit copy.
    await page.goto(`/riders/${riderOne.slug}?t=${stamp}`);
    await expect(page.getByTestId("rider-bio")).toHaveText(bio);

    await page.goto(`/riders?t=${stamp}`);
    await expect(
      page.locator(`[data-testid="rider-card"][data-rider-slug="${riderOne.slug}"]`),
    ).toContainText(bio);
  });

  test("R-T9: every rider has an avatar, and it is stable across loads", async ({
    page,
  }) => {
    await page.goto("/riders");

    const cards = page.locator('[data-testid="rider-card"]');
    const avatars = page.locator(
      '[data-testid="rider-card"] [data-testid="rider-avatar"]',
    );
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    // No blank squares: nobody has uploaded an avatar, so this only passes
    // because the generated fallback covers every rider.
    await expect(avatars).toHaveCount(count);

    const one = page.locator(
      `[data-rider-slug="${riderOne.slug}"] [data-testid="rider-avatar"]`,
    );
    await expect(one).toHaveAttribute("data-avatar-kind", "generated");
    const first = await one.getAttribute("style");
    expect(first).toContain("linear-gradient");

    // Derived from the slug, so a reload — and any other page showing the
    // same rider — must produce identical colours.
    await page.reload();
    expect(await one.getAttribute("style")).toBe(first);

    await page.goto(`/riders/${riderOne.slug}`);
    const onProfile = await page
      .getByTestId("rider-avatar")
      .getAttribute("style");
    // Same gradient, different box size.
    const gradient = (s: string | null) => s?.match(/linear-gradient\([^)]*\)+/)?.[0];
    expect(gradient(onProfile)).toBe(gradient(first));
  });

  test("R-T8: a signed-in member still sees the whole directory", async ({
    page,
  }) => {
    // `authors.read` is `ownedOnlyPublicRead`, which narrows a signed-in
    // member to their own record. The public pages go through the Local API
    // with the default `overrideAccess: true`, so the directory stays whole —
    // if that ever changes, a logged-in member sees a directory of one.
    await page.goto("/members/login");
    await page.getByTestId("member-login-email").fill(TEST_MEMBER.email);
    await page.getByTestId("member-login-password").fill(TEST_MEMBER.password);
    await page.getByTestId("member-login-submit").click();
    await page.waitForURL("**/members");

    await page.goto(`/riders?t=${Date.now()}`);
    await expect(
      page.locator(`[data-testid="rider-card"][data-rider-slug="${riderTwo.slug}"]`),
    ).toBeVisible();
  });
});

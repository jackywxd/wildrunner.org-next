import { budget } from "../helpers/budget";
import { expect, test } from "../helpers/test";

/**
 * RF — filtering the directory by badge.
 *
 * WHAT THIS COVERS THAT `U-RIDERFILTER` CANNOT. The unit test proves the
 * matching; this proves a visitor can reach it. The filter is deliberately
 * built out of links rather than client state (see RiderFilters' header),
 * and the two claims that rests on are only true on a real page: a click
 * changes the URL, and that URL renders the same thing when it is opened
 * cold. A filter that worked only after a click would look identical here
 * until somebody shared one.
 *
 * ARRIVES BY CLICKING. AGENTS.md records why: tests navigate with `goto`
 * and users click, and the calendar-toggle bug lived entirely in the gap.
 * The `goto` is here too, as the *second* half — that is the shareable-URL
 * claim, not a substitute for the first.
 *
 * WAITING FOR THE PAGE TO STOP BEING TWO PAGES, which took three attempts
 * to get right and is the reason this comment is long.
 *
 * The site crossfades between pages, so for the length of a transition
 * *both* copies are mounted and every locator resolves to two elements.
 * `visitor.spec` hit the same window on the race-schedule toggle and its
 * comment carries a measurement, about 350ms.
 *
 * Two repairs failed, and they failed for the same underlying reason —
 * each was a condition that is *also* true at a moment when nothing has
 * happened yet:
 *
 *   1. "Wait for the container count to be 1" after a click. Immediately
 *      after a click the old page is still the only one mounted, so the
 *      count is already 1 and the wait returns before the transition has
 *      begun.
 *   2. "Wait for the chip that will be selected to carry `aria-current`,
 *      then for the count to be 1." That survived locally and died against
 *      staging on a *cold load*, where there is no old page: the server
 *      renders one copy, the wait passes, and the second copy appears when
 *      hydration mounts the transition. The count goes 1 → 2 → 1, not
 *      2 → 1, so a single check of "is it 1" can land before the 2.
 *
 * `member-races.spec`'s `badgeCount` had already recorded this exact
 * window — "domcontentloaded fires before hydration finishes, so a single
 * count taken right after it can land inside that window" — and rides it
 * out by requiring two consecutive reads to agree. That is what this does
 * now, plus requiring the agreed value to be 1. No fixed delay, and no
 * condition that is satisfiable before the thing being waited for exists.
 *
 * SEVERAL BADGES MEAN ALL OF THEM. RF-T4 is the one a single-select
 * version of this feature would have passed unchanged, so it is the one
 * that actually covers the change: two chips selected, and the result is
 * the intersection rather than either chip's own list.
 *
 * ASSERTS ON RELATIONSHIPS, NOT ON NAMES. The corpus differs between local,
 * CI and staging — AGENTS.md: local D1 is e2e residue, CI starts empty —
 * so nothing here expects a particular rider or a particular count. What
 * holds everywhere is that a chip's own number is what the page then shows,
 * and that is what is checked.
 */

/**
 * The chip for one badge. Selected by `data-badge`, not by a testid built
 * from the id: `assert:schema-screen` greps src/ for the literal a test
 * names, and a template-string testid has no literal to find — it failed
 * that check, which is the check working. The kind of control is the
 * testid; which one it is, is the attribute.
 */
const chipFor = (page: import("@playwright/test").Page, badge: string) =>
  page.locator(`[data-badge="${badge}"]`);

/**
 * How long the row must be a single row before it counts as settled.
 *
 * A duration, not a guess at *when*: visitor.spec measured the crossfade at
 * about 350ms, so six samples at 100ms is comfortably longer than one
 * transition. Two agreeing reads — the technique member-races.spec uses for
 * the hydration window — is not enough here, because two samples 100ms
 * apart can both land in the gap before the second copy mounts.
 */
const STABLE_SAMPLES = 6;

/**
 * Waits until the filter row has stopped being two filter rows — see the
 * header for the ways of getting this wrong.
 */
const settled = async (page: import("@playwright/test").Page) => {
  const row = page.getByTestId("rider-filters");
  let stable = 0;
  for (let attempt = 0; attempt < 80; attempt++) {
    if ((await row.count()) === 1) {
      stable += 1;
      if (stable >= STABLE_SAMPLES) return;
    } else {
      stable = 0;
    }
    await page.waitForTimeout(100);
  }
  throw new Error("the filter row never settled to a single copy");
};

/**
 * The selection the test asked for has arrived, and the page has stopped
 * being two pages. IN THAT ORDER, and the order is the whole thing.
 *
 * Settling first is what broke the previous version: right after a click
 * the old page is still the only one mounted, so "one row" is already true
 * and the wait returns before the new page exists. Waiting for the selected
 * chip first cannot be satisfied early — no chip carries it until the new
 * page renders — and only then is the count worth watching.
 */
const settledOn = async (
  page: import("@playwright/test").Page,
  selector: string,
) => {
  await expect(page.locator(`${selector}[aria-current="true"]`)).toHaveCount(1, {
    timeout: budget(15_000),
  });
  await settled(page);
};

test.describe("RF filtering riders by badge", () => {
  test("RF-T1: a shortcut chip filters the directory, and the URL carries it", async ({
    page,
  }) => {
    test.setTimeout(budget(45_000));

    await page.goto("/riders", { waitUntil: "domcontentloaded" });
    await settledOn(page, '[data-testid="rider-filter-all"]');

    // The heading the club asked for. It read "Riders" on a Traditional
    // Chinese site whose every other page header is Chinese.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("野馬");

    const filters = page.getByTestId("rider-filters");
    await expect(filters).toBeVisible();

    // All three shortcuts are present whatever the data says. Nobody has
    // finished the six majors yet, and the chip still has to exist — its
    // absence would read as a missing feature rather than an empty shelf.
    await expect(page.getByTestId("rider-filter-shortcut")).toHaveCount(3);
    for (const id of ["six-majors", "utmb-100m", "torx-330"]) {
      await expect(chipFor(page, id)).toBeVisible();
    }

    const chip = chipFor(page, "utmb-100m");
    // Read as an attribute, not parsed out of the label. The first version
    // took trailing digits from the text and read 「TORX 330」 with a count
    // of 0 as 3300 — there is no whitespace between them, only a margin.
    const promised = Number(await chip.getAttribute("data-count"));
    expect(Number.isFinite(promised), "the chip showed no count").toBe(true);

    await chip.click();

    await expect(page).toHaveURL(/\/riders\?badge=utmb-100m$/);
    await settledOn(page, '[data-badge="utmb-100m"]');

    // Kept, exactly. A filter that quietly showed everybody would still
    // look like a working page — that is the failure this asserts against,
    // and why it compares to the count rather than to "fewer than before".
    const shown = await page.getByTestId("rider-card").count();
    expect(shown).toBe(promised);
    // The whole club is bigger than any one badge's holders, or this
    // assertion proves nothing about filtering at all.
    if (promised > 0) {
      await expect(page.getByTestId("rider-empty")).toHaveCount(0);
    }
  });

  test("RF-T2: the filtered URL renders the same page when opened cold", async ({
    page,
  }) => {
    test.setTimeout(budget(45_000));

    // The point of building this out of links. A shared or bookmarked
    // filter has no click behind it, and nothing on the page hydrates, so
    // this is the assertion that the server did the filtering.
    await page.goto("/riders?badge=utmb-100m", { waitUntil: "domcontentloaded" });
    await settledOn(page, '[data-badge="utmb-100m"]');

    const chip = chipFor(page, "utmb-100m");
    const promised = Number(await chip.getAttribute("data-count"));
    expect(await page.getByTestId("rider-card").count()).toBe(promised);

    // 全部 clears everything, and the URL goes back to being clean rather
    // than carrying `?badge=`.
    await page.getByTestId("rider-filter-all").click();
    await expect(page).toHaveURL(/\/riders$/);
    await settledOn(page, '[data-testid="rider-filter-all"]');
  });

  test("RF-T3: a badge nobody holds says so, rather than showing everybody", async ({
    page,
  }) => {
    test.setTimeout(budget(45_000));

    // The wrong answer this feature could give. An unrecognised id that
    // fell back to "no filter" would render the entire club under a chip
    // reading 「六大」 — every member presented as a six-star finisher.
    await page.goto("/riders?badge=not-a-real-badge", {
      waitUntil: "domcontentloaded",
    });
    // No chip is selected here, so there is no `aria-current` to wait on —
    // but the two-copies window is the same, and `rider-empty` resolving to
    // two nodes would fail on strict mode rather than on what it checks.
    await settled(page);

    await expect(page.getByTestId("rider-card")).toHaveCount(0);
    await expect(page.getByTestId("rider-empty")).toHaveText(
      "還沒有成員拿到這個徽章。",
    );
    // And no chip claims to be the one selected.
    await expect(page.locator('[aria-current="true"]')).toHaveCount(0);
  });
});

test.describe("RF several badges at once", () => {

  test("RF-T4: a second chip narrows rather than replaces, and unpicks again", async ({
    page,
  }) => {
    test.setTimeout(budget(45_000));

    await page.goto("/riders?badge=utmb-100m", { waitUntil: "domcontentloaded" });
    await settledOn(page, '[data-badge="utmb-100m"]');
    const afterOne = await page.getByTestId("rider-card").count();

    // The chip's number is the promise, and under AND it is the number for
    // *this selection plus that chip* — which is the assertion a
    // single-select implementation could not satisfy, because there it
    // would be the second badge's own total.
    const second = chipFor(page, "torx-330");
    const promised = Number(await second.getAttribute("data-count"));

    await second.click();
    await expect(page).toHaveURL(/badge=torx-330/);
    // Both, not just the newest — a replace would have dropped this one.
    await expect(page).toHaveURL(/badge=utmb-100m/);
    await settledOn(page, '[data-badge="torx-330"]');
    await expect(chipFor(page, "utmb-100m")).toHaveAttribute(
      "aria-current",
      "true",
    );

    const afterTwo = await page.getByTestId("rider-card").count();
    expect(afterTwo).toBe(promised);
    // An intersection can only ever be smaller or equal. Larger would mean
    // the second chip replaced the first, which is the bug this covers.
    expect(afterTwo).toBeLessThanOrEqual(afterOne);

    // Pressing it again is the way back out, and leaves the other in place.
    await second.click();
    await expect(page).toHaveURL(/\/riders\?badge=utmb-100m$/);
    await settledOn(page, '[data-badge="utmb-100m"]');
    expect(await page.getByTestId("rider-card").count()).toBe(afterOne);
  });
});

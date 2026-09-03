/**
 * V-PRINT — an article, laid out for paper.
 *
 * WHAT A BROWSER TEST CAN SHOW HERE, and what it cannot. Nothing in Playwright
 * produces a sheet of paper: `window.print()` opens the browser's own dialog,
 * which headless Chromium has no way to complete. So the claims are about the
 * page that WOULD be printed — which template the server rendered, what it put
 * on it, and what it deliberately left off.
 *
 * The one that matters most is compact dropping the photographs. It is the
 * whole reason that template exists rather than being standard at 90%, and it
 * is done by removing the nodes server-side so the images are never even
 * requested — a `display: none` version would pass any visual check and still
 * download every photograph in the article.
 */
import { expect, test } from "../helpers/test";
import { budget } from "../helpers/budget";

/** 1×1 transparent GIF, answered in-process so no request leaves the sandbox. */
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

/**
 * The wordiest published article, chosen by body size so the choice is
 * deterministic — a post that is mostly photographs would prove little about
 * a layout for text.
 */
async function longestArticle(
  request: import("@playwright/test").APIRequestContext,
) {
  const res = await request.get(
    "/api/posts?limit=50&depth=0&where[_status][equals]=published",
  );
  expect(res.ok(), `could not read posts: ${res.status()}`).toBeTruthy();
  const docs = ((await res.json()).docs ?? []) as {
    slug: string;
    title: string;
    content?: unknown;
  }[];
  const withBody = docs
    .filter((doc) => doc.content)
    .sort(
      (a, b) =>
        JSON.stringify(b.content).length - JSON.stringify(a.content).length,
    );
  expect(
    withBody[0],
    "the seeded corpus has 15 posts with bodies — reseed with pnpm db:reset:local",
  ).toBeTruthy();
  return withBody[0];
}

/** `posts/2024/utmb` and `2024/utmb` both address the same article. */
const printPath = (slug: string) =>
  `/print/${slug.replace(/^\/+/, "").replace(/^(?!posts\/)/, "posts/")}`;

test.describe("V-PRINT an article laid out for paper", () => {
  test("V-PRINT-T1: the article page offers it, and all three templates render", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(60_000));
    const post = await longestArticle(request);

    await page.route(/\/api\/media\/file\/|images\.wildrunner\.org/, (route) =>
      route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL }),
    );

    // Arrived at by clicking, like every other route a visitor can reach.
    await page.goto(`/posts/${post.slug.replace(/^posts\//, "")}`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByTestId("post-print-link").click();
    await expect(page).toHaveURL(/\/print\/posts\//, {
      timeout: budget(20_000),
    });

    // Default: standard, sans, and the article on it.
    const sheet = page.getByTestId("print-page");
    await expect(sheet).toBeVisible({ timeout: budget(20_000) });
    await expect(sheet).toHaveAttribute("data-template", "standard");
    await expect(sheet).toHaveAttribute("data-font", "sans");
    // By testid, not by role: an article body may carry its own `<h1>` — the
    // corpus has three — so "the level-1 heading" is ambiguous on this page
    // exactly as it already is on the article page itself.
    await expect(page.getByTestId("print-title")).toHaveText(post.title);
    // The one static footer, which is how a loose sheet is traced back.
    await expect(page.getByTestId("print-foot")).toContainText("/posts/");

    // No site chrome: this page is not inside `(site)`, so there is no nav to
    // hide at print time — it was never rendered.
    await expect(page.getByTestId("member-nav-media")).toHaveCount(0);

    await page.getByTestId("print-template").selectOption("magazine");
    await expect(sheet).toHaveAttribute("data-template", "magazine", {
      timeout: budget(15_000),
    });
    // Magazine brings its own face with it, without touching the font menu.
    await expect(sheet).toHaveAttribute("data-font", "serif");

    await page.getByTestId("print-template").selectOption("compact");
    await expect(sheet).toHaveAttribute("data-template", "compact", {
      timeout: budget(15_000),
    });
  });

  test("V-PRINT-T3: a compact print never asks for the photographs", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(60_000));
    const post = await longestArticle(request);

    let imageRequests = 0;
    await page.route(
      /\/api\/media\/file\/|images\.wildrunner\.org/,
      (route) => {
        imageRequests += 1;
        return route.fulfill({
          status: 200,
          contentType: "image/gif",
          body: PIXEL,
        });
      },
    );

    // COMPACT FIRST, ON A PAGE THAT HAS LOADED NOTHING, and the order is the
    // whole test. An earlier version switched to compact through the toolbar
    // after standard had already rendered — by then every photograph was in
    // the browser cache, so re-rendering them made no new request and the
    // counter could not move whichever way the code behaved. Breaking
    // `printsPhotos` to always return true left that version green.
    await page.goto(`${printPath(post.slug)}?template=compact`, {
      waitUntil: "networkidle",
    });
    await expect(page.getByTestId("print-page")).toHaveAttribute(
      "data-template",
      "compact",
      { timeout: budget(20_000) },
    );
    expect(
      imageRequests,
      "a compact print must not fetch photographs it will not print",
    ).toBe(0);
    // ...and nothing was merely hidden: the nodes are gone from the document.
    await expect(page.locator("[data-testid='print-page'] img")).toHaveCount(0);

    // The same article in standard does fetch them, which is what makes the
    // zero above mean something.
    await page.goto(`${printPath(post.slug)}?template=standard`, {
      waitUntil: "networkidle",
    });
    await expect(page.getByTestId("print-page")).toHaveAttribute(
      "data-template",
      "standard",
      { timeout: budget(20_000) },
    );
    expect(
      imageRequests,
      "...and the standard template must actually have fetched some",
    ).toBeGreaterThan(0);
  });

  test("V-PRINT-T2: the font menu is independent, and a nonsense value still prints", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(60_000));
    const post = await longestArticle(request);
    await page.route(/\/api\/media\/file\/|images\.wildrunner\.org/, (route) =>
      route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL }),
    );

    // A serif compact print: the two menus do not constrain each other.
    await page.goto(`${printPath(post.slug)}?template=compact&font=serif`, {
      waitUntil: "domcontentloaded",
    });
    const sheet = page.getByTestId("print-page");
    await expect(sheet).toHaveAttribute("data-template", "compact", {
      timeout: budget(20_000),
    });
    await expect(sheet).toHaveAttribute("data-font", "serif");

    // A stale bookmark, or a template renamed later. The article still prints.
    await page.goto(`${printPath(post.slug)}?template=broadsheet&font=comic`, {
      waitUntil: "domcontentloaded",
    });
    await expect(sheet).toHaveAttribute("data-template", "standard", {
      timeout: budget(20_000),
    });
    await expect(page.getByTestId("print-title")).toHaveText(post.title);
  });
});

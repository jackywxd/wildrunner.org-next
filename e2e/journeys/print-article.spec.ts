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
import { contentDisposition, pdfFilename } from "@/lib/print/filename";

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
    // Scoped to the body, because the running head carries the club's mark and
    // a compact print should still be on野馬營 paper — `withoutUploads` strips
    // the article's own uploads and nothing else.
    await expect(
      page.locator("[data-testid='print-page'] .print-body img"),
    ).toHaveCount(0);

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

  test("V-PRINT-T4: the download endpoint renders the article, or says why it cannot", async ({
    request,
  }) => {
    test.setTimeout(budget(60_000));
    const post = await longestArticle(request);

    // 503 IS THE RIGHT ANSWER HERE AND IS ASSERTED AS SUCH, not skipped
    // around. The PDF is rendered by Cloudflare Browser Rendering over the
    // `BROWSER` binding, which is absent in dev and in CI by construction —
    // the same position `V-PICKFRAME-T1` is in with the transcoder. A 200
    // would mean the site had handed back a file nothing here can produce.
    //
    // What that leaves provable is the half that has gone wrong before: a
    // member pressing a button that quietly does nothing. The endpoint has to
    // exist, has to reach the point of asking for a renderer, and has to say
    // so when there is none.
    const rendered = await request.get(`/api${printPath(post.slug)}`);
    expect(
      rendered.status(),
      "the download must report that no renderer is configured, not quietly fail",
    ).toBe(503);
    expect(await rendered.text()).toContain("列印");

    // Refused before any browser time is spent, and by the same lookup the
    // print page uses — so this endpoint can never hand back an article the
    // page itself would not show.
    const missing = await request.get("/api/print/posts/2019/nothing-here");
    expect(missing.status(), await missing.text()).toBe(404);
  });

  test("V-PRINT-T5: the button downloads the article, and reports a refusal in place", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(60_000));
    const post = await longestArticle(request);

    await page.route(/\/api\/media\/file\/|images\.wildrunner\.org/, (route) =>
      route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL }),
    );

    // THE ENDPOINT IS STUBBED, and the gap that leaves is worth naming. No
    // renderer exists in this environment, so the real response can only ever
    // be the 503 T4 asserts — and letting the browser see that would add a
    // 5xx the console guard is right to refuse. What is pinned here is the
    // client half: pressing the button reaches the right address, carrying
    // the menus, and produces a saved file rather than nothing.
    //
    // The stub answers with a header built by the same `contentDisposition`
    // the route uses, so the client parses the real shape rather than one
    // hand-written to match.
    let available = true;
    let asked: string | null = null;
    await page.route(/\/api\/print\/posts\//, async (route) => {
      const at = new URL(route.request().url());
      asked = `${at.pathname}${at.search}`;
      if (!available) {
        return route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "找不到這篇文章，它可能已經下架。" }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: {
          "Content-Disposition": contentDisposition(pdfFilename(post.title)),
        },
        body: "%PDF-1.4\n%%EOF\n",
      });
    });

    // A template that is not the default, so "the menus travelled" is a claim
    // the query string can actually falsify.
    await page.goto(`${printPath(post.slug)}?template=magazine&font=serif`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("print-page")).toBeVisible({
      timeout: budget(20_000),
    });

    // A download happens at all — the defect this replaces is a button that
    // looks like it worked and saves nothing.
    //
    // WHAT IS NOT ASSERTED HERE IS THE NAME, and that is a limit of the
    // harness rather than a gap in the code. Chromium reports every blob-URL
    // download as `suggestedFilename() === "download"` whatever the anchor's
    // `download` attribute says; measured from this very test's trace, where
    // the attribute read `我的第一场百迈越野—UTMB.pdf` while the event still
    // said `download`. An assertion on that value cannot report the right
    // answer, so it would only ever be measuring the instrument. The name is
    // pinned by `U-PDFNAME` instead.
    await Promise.all([
      page.waitForEvent("download", { timeout: budget(20_000) }),
      page.getByTestId("print-download").click(),
    ]);
    expect(
      asked,
      "the button asked the print API for this article, carrying the menus",
    ).toBe(`/api${printPath(post.slug)}?template=magazine&font=serif`);

    // ...and when the endpoint refuses, the member is told in the toolbar they
    // pressed rather than being left with a button that did nothing.
    //
    // A 404 — an article withdrawn between opening this page and pressing the
    // button — and not the 503 this environment really answers with, because
    // letting the browser see a 5xx adds an error the console guard is right
    // to refuse. The status differs; the branch under test does not, and T4
    // asserts the 503 where no browser is watching.
    available = false;
    await page.getByTestId("print-download").click();
    await expect(page.getByTestId("print-download-error")).toContainText(
      "找不到這篇文章",
      { timeout: budget(15_000) },
    );
  });
});

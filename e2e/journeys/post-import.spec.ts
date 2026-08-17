/**
 * A member imports a markdown document and gets a draft they can edit.
 *
 * The 19 tests in `e2e/unit/mdx-import.spec.ts` prove the converter's
 * output shape, entirely without a browser. What none of them can see is
 * whether the whole path actually works in one: `@/lib/mdx-import` is
 * loaded with a dynamic `import()` inside a click handler
 * (`ImportPost.tsx`), and a lazy chunk that fails to load in a real browser
 * is invisible to every one of those unit tests. This is the one journey
 * that exercises the real click, the real parse, and a real `createPost`
 * call landing in the editor the member already uses.
 *
 * It also covers two visitor-facing things this feature makes reachable for
 * the first time: a fenced code block (`docs/testing-strategy.md` §0.1 lists
 * "reads an article, including its … code blocks" as a use case; 0 of 15
 * migrated posts ever exercised `blocks.Code` in `payload-rich-text.tsx`)
 * and an embedded HTML/SVG block (`blocks.HtmlEmbed`, `src/blocks/
 * HtmlEmbedBlock.ts`).
 *
 * The HtmlEmbed block specifically is why this is a *publish* test, not
 * just a create test. Measured directly, once, against a dev server that
 * had booted before `HtmlEmbedBlock` was registered in `payload.config.ts`:
 * creating a draft with an `HtmlEmbed` block succeeded anyway — draft saves
 * do not enforce `blockValidationHOC` — but publishing refused it with
 * "Block HtmlEmbed not found", because that server's cached config had
 * never heard of the slug. Restarting the dev server fixed it. A second
 * attempt to reproduce the same failure by editing the block list back out
 * and restarting did *not* reproduce it — something in Next/Turbopack's
 * on-disk cache served the older, correct config despite the source change,
 * and the exact caching boundary was not pinned down. So: a config-loading
 * regression of this shape is a real, observed failure mode, not a
 * hypothetical one, but this journey's HtmlEmbed assertions are ordinary
 * ongoing coverage rather than a reliably-reproducible trap for that
 * specific mechanism. A journey that only creates a draft would never
 * see this class of bug at all; one that publishes and reads the result
 * back at least has a chance to.
 */
import { expect, test } from "../helpers/test";
import { TEST_ADMIN } from "../helpers/auth";

const SOURCE = [
  "# M-IMPORT 匯入測試文章",
  "",
  "這篇文章有 **粗體** 文字，用來確認匯入的內容正確。",
  "",
  "- 第一項",
  "- 第二項",
  "",
  "![未匯入的圖片](./missing.jpg)",
  "",
  '<YouTube id="dQw4w9WgXcQ"/>',
  "",
  "```js",
  "console.log('m-import-marker');",
  "```",
  "",
  '<div class="m-import-embed"><p>m-import-html-marker</p></div>',
].join("\n");

test.describe("M-IMPORT a member imports a markdown document", () => {
  /**
   * Teardown by the id this test captured, and by nothing else — see
   * `docs/testing-strategy.md`'s rule against `like`/prefix deletes.
   */
  let postId: string | null = null;

  test.afterEach(async ({ request }) => {
    const post = postId;
    postId = null;
    if (!post) return;

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    if (!login.ok()) throw new Error(`teardown could not sign in: ${login.status()}`);

    const deleted = await request.delete(`/api/posts/${post}`);
    if (!deleted.ok() && deleted.status() !== 404) {
      throw new Error(`teardown failed to delete posts/${post}: ${deleted.status()}`);
    }
  });

  test("M-IMPORT-T1: imports a document and publishes it", async ({ page }) => {
    // Above the 20s local default (playwright.config.ts): this journey signs
    // in, loads the import page, pays the dynamic `import("@/lib/mdx-import")`
    // chunk's first-hit dev-server compile (the same on-demand-compile cost
    // the config's own comment measured at 13.3s for /admin — see P0-T6),
    // creates a post, edits and publishes it, then loads the public post page
    // — five navigations and several writes where most journeys have two or
    // three.
    test.setTimeout(60_000);

    await page.goto("/members/login", { waitUntil: "domcontentloaded" });
    await page.getByTestId("member-login-email").fill(TEST_ADMIN.email);
    await page.getByTestId("member-login-password").fill(TEST_ADMIN.password);
    await page.getByTestId("member-login-submit").click();
    await expect(page).toHaveURL(/\/members$/, { timeout: 15_000 });

    // By clicking, not by URL: soft navigation is where a whole class of
    // bugs has lived before (docs/testing-strategy.md §4).
    await page.getByTestId("member-nav-posts").click();
    await page.getByTestId("posts-import").click();
    await expect(page).toHaveURL(/\/members\/posts\/import$/, { timeout: 15_000 });

    await page.getByTestId("import-source").fill(SOURCE);
    await page.getByTestId("import-parse").click();

    await expect(page.getByTestId("import-title")).toHaveValue("M-IMPORT 匯入測試文章", {
      timeout: 10_000,
    });
    await expect(page.getByTestId("import-preview")).toBeVisible();

    // The image reference, the code-not-editable notice, and the
    // HTML-embedded notice, at minimum — the exact count is the unit
    // tests' job, not this journey's.
    const warnings = page.getByTestId("import-warnings");
    await expect(warnings).toBeVisible();
    const warningCount = await warnings.getAttribute("data-count");
    expect(Number(warningCount)).toBeGreaterThanOrEqual(3);

    await page.getByTestId("import-create").click();
    await expect(page).toHaveURL(/\/members\/posts\/\d+$/, { timeout: 20_000 });

    // Captured immediately, before any assertion that could fail.
    const created = page.url().match(/\/members\/posts\/(\d+)/);
    if (!created) throw new Error(`no post id in ${page.url()}`);
    postId = created[1];

    // The imported document opened in the real editor without Lexical
    // throwing on an unregistered node type.
    await expect(page.getByTestId("post-title")).toHaveValue("M-IMPORT 匯入測試文章");
    await expect(page.getByTestId("editor-content")).toContainText("粗體");
    await expect(page.getByTestId("editor-content")).toContainText("第一項");

    await page.getByTestId("post-description").fill("M-IMPORT 摘要");
    await page.getByTestId("post-publish").click();
    // Publishing leaves the editor (`PostEditor` calls
    // `router.push("/members/posts")` on success), so the list URL is the
    // observable success signal — anchored to the end, since
    // `/members/posts` is a prefix of `/members/posts/<id>`.
    await expect(page).toHaveURL(/\/members\/posts$/, { timeout: 20_000 });

    const doc = await page.request.get(`/api/posts/${postId}?depth=0`);
    expect(doc.ok()).toBe(true);
    const body = (await doc.json()) as { _status?: string; slug?: string };
    expect(body._status).toBe("published");
    expect(body.slug).toBeTruthy();

    // The one place the new `blocks.Code` and `blocks.HtmlEmbed` converters
    // in `payload-rich-text.tsx` are observable: without either, the
    // dispatcher renders the literal text "unknown node" instead of the
    // block's content. The HtmlEmbed case is also the only place a
    // registration gap in `payload.config.ts`'s `BlocksFeature` would be
    // caught — see this file's header.
    //
    // `.first()` on both marker locators: caught once in CI (never locally)
    // as a strict-mode violation — `getByText` resolved 2 DOM nodes for
    // text the rendered page shows only once. The saved accessibility
    // snapshot from that failure has exactly one `code` node, so the
    // second match was accessibility-hidden — consistent with a transient
    // duplicate from React's SSR/streaming HTML that hydration removes
    // shortly after `domcontentloaded` fires (`getByText` matches hidden
    // elements; the a11y tree does not). Slower CI runners make that
    // window more likely to be caught mid-transition. `.first()` +
    // `toBeVisible()`'s built-in retry re-resolves the locator each poll,
    // so once hydration removes the hidden duplicate, `.first()` settles
    // on the one real node — the assertion's actual concern (the real
    // content rendered, not "unknown node") is unaffected either way.
    await page.goto(`/posts/${body.slug}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("m-import-marker").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("m-import-html-marker").first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("unknown node")).toHaveCount(0);
  });
});

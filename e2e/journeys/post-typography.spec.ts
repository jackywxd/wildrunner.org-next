import { expect, test } from "../helpers/test";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";

/**
 * M-TYPO — a published article looks like an article.
 *
 * The bug this was written from: every heading on the public post page
 * rendered at body size and body weight, so a document with three levels of
 * heading read as one undifferentiated column. The page asked for
 * `prose prose-neutral dark:prose-invert`, but `@tailwindcss/typography` has
 * never been a dependency here — three class names matching no rule — while
 * Tailwind's preflight resets headings to `font-size: inherit`. Lists lost
 * their markers the same way, and blockquotes their rule.
 *
 * Nothing in a suite that asks "is this text present" can see that. Text was
 * present throughout, in the right order, inside the right tags. So these
 * assert on computed style, which is the only place the difference exists.
 *
 * The fixture is built over the API rather than typed into the editor: what
 * is under test is how a stored document is *rendered*, and driving the
 * editor to produce one would test the editor twice and this once. The
 * document deliberately holds one of everything — the table in particular,
 * which nothing had ever rendered on a published page before.
 */

const H1 = "一級標題";
const H2 = "二級標題";
const H3 = "三級標題";
const BODY = "這是內文段落。";

const text = (value: string, format = 0) => ({
  type: "text",
  text: value,
  format,
  style: "",
  mode: "normal",
  detail: 0,
  version: 1,
});

const paragraph = (value: string) => ({
  type: "paragraph",
  format: "",
  indent: 0,
  version: 1,
  direction: "ltr",
  children: [text(value)],
});

const heading = (tag: string, value: string) => ({
  type: "heading",
  tag,
  format: "",
  indent: 0,
  version: 1,
  direction: "ltr",
  children: [text(value)],
});

const item = (value: string, index: number) => ({
  type: "listitem",
  value: index,
  format: "",
  indent: 0,
  version: 1,
  direction: "ltr",
  children: [text(value)],
});

const cell = (value: string, header: boolean) => ({
  type: "tablecell",
  headerState: header ? 1 : 0,
  colSpan: 1,
  rowSpan: 1,
  format: "",
  indent: 0,
  version: 1,
  direction: "ltr",
  children: [paragraph(value)],
});

const row = (cells: unknown[]) => ({
  type: "tablerow",
  format: "",
  indent: 0,
  version: 1,
  direction: "ltr",
  children: cells,
});

/** One of everything a member can produce with the editor's shortcuts. */
const DOCUMENT = {
  root: {
    type: "root",
    format: "",
    indent: 0,
    version: 1,
    direction: "ltr",
    children: [
      heading("h1", H1),
      paragraph(BODY),
      heading("h2", H2),
      heading("h3", H3),
      {
        type: "list",
        listType: "bullet",
        tag: "ul",
        start: 1,
        format: "",
        indent: 0,
        version: 1,
        direction: "ltr",
        children: [item("項目一", 1), item("項目二", 2)],
      },
      {
        type: "list",
        listType: "number",
        tag: "ol",
        start: 1,
        format: "",
        indent: 0,
        version: 1,
        direction: "ltr",
        children: [item("第一", 1), item("第二", 2)],
      },
      {
        type: "quote",
        format: "",
        indent: 0,
        version: 1,
        direction: "ltr",
        children: [text("引用的一段話")],
      },
      {
        type: "table",
        format: "",
        indent: 0,
        version: 1,
        direction: "ltr",
        children: [
          row([cell("欄一", true), cell("欄二", true)]),
          row([cell("甲", false), cell("乙", false)]),
        ],
      },
      { type: "horizontalrule", version: 1 },
      {
        type: "paragraph",
        format: "",
        indent: 0,
        version: 1,
        direction: "ltr",
        children: [text("粗體", 1), text("／"), text("行內程式", 16)],
      },
    ],
  },
};

/** Computed style of the last element matching each selector, as numbers. */
const measure = (page: import("@playwright/test").Page, root: string) =>
  page.evaluate((selector) => {
    const scope = document.querySelector(selector);
    if (!scope) throw new Error(`no ${selector} on the page`);
    const read = (tag: string) => {
      const el = scope.querySelector(tag);
      if (!el) return null;
      const style = getComputedStyle(el);
      return {
        size: parseFloat(style.fontSize),
        weight: Number(style.fontWeight),
        marker: style.listStyleType,
        padLeft: parseFloat(style.paddingLeft),
        borderLeft: parseFloat(style.borderLeftWidth),
        borderTop: parseFloat(style.borderTopWidth),
        decoration: style.textDecorationLine,
        background: style.backgroundColor,
      };
    };
    return {
      h1: read("h1"),
      h2: read("h2"),
      h3: read("h3"),
      p: read("p"),
      ul: read("ul"),
      ol: read("ol"),
      blockquote: read("blockquote"),
      td: read("td"),
      th: read("th"),
      code: read("code"),
    };
  }, root);

/**
 * The browser needs its own session: Playwright's `request` fixture and
 * `page` keep separate cookie jars, so signing in over the API leaves the
 * browser anonymous and the editor route bounces it to /members/login.
 */
async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/members/login", { waitUntil: "domcontentloaded" });
  await page.getByTestId("member-login-email").fill(TEST_ADMIN.email);
  await page.getByTestId("member-login-password").fill(TEST_ADMIN.password);
  await page.getByTestId("member-login-submit").click();
  await expect(page).toHaveURL(/\/members$/, { timeout: budget(15_000) });
}

test.describe("M-TYPO a published article is readable", () => {
  const created: { collection: string; id: number }[] = [];
  let postId = 0;
  let postSlug = "";

  test.beforeEach(async ({ request }) => {
    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const stamp = Date.now();
    const post = await request.post("/api/posts", {
      data: {
        title: `排版驗證 ${stamp}`,
        slug: `m-typo-${stamp}`,
        description: "排版驗證",
        _status: "published",
        content: DOCUMENT,
      },
    });
    expect(post.ok(), `post create failed: ${post.status()}`).toBeTruthy();
    const doc = (await post.json()).doc as { id: number; slug: string };
    postId = doc.id;
    postSlug = doc.slug;
    created.push({ collection: "posts", id: postId });
    recordCreated({ collection: "posts", id: postId, note: "M-TYPO probe post" });
  });

  test.afterEach(async ({ request }) => {
    const pending = created.splice(0, created.length).reverse();
    if (pending.length === 0) return;

    // Best effort, and deliberately not asserted on. The `request` fixture
    // still holds the cookies from the sign-in this test already did, so
    // this is a second login for a session that already exists — a failure
    // surface with nothing behind it. One of them answered 500 on a CI
    // shard, with no server-side log and with the deletes right after it
    // fine, and failed a test whose own assertions had all passed.
    //
    // What has to work here is the delete, so that is what fails the test.
    // A session that really had lapsed shows up as a 401 on the line below,
    // which says so.
    await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });

    for (const rowToDelete of pending) {
      const deleted = await request.delete(
        `/api/${rowToDelete.collection}/${rowToDelete.id}`,
      );
      if (!deleted.ok()) {
        throw new Error(
          `teardown failed to delete ${rowToDelete.collection}/${rowToDelete.id}`,
        );
      }
    }
  });

  test("M-TYPO-T1: headings, lists, quotes and tables are told apart on the published page", async ({
    page,
  }) => {
    await page.goto(`/posts/${postSlug}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".article-body")).toContainText(H1, {
      timeout: budget(15_000),
    });

    const style = await measure(page, ".article-body");

    // The failure that started this: all four came back at 15px/400.
    expect(style.h1!.size).toBeGreaterThan(style.h2!.size);
    expect(style.h2!.size).toBeGreaterThan(style.h3!.size);
    expect(style.h3!.size).toBeGreaterThan(style.p!.size);
    expect(style.h2!.weight).toBeGreaterThan(style.p!.weight);

    // Preflight sets `list-style: none` on every list, so a list with no
    // rule of its own renders as unindented lines with nothing in front.
    expect(style.ul!.marker).toBe("disc");
    expect(style.ul!.padLeft).toBeGreaterThan(0);
    expect(style.ol!.marker).toBe("decimal");

    // A quote with no rule down its side is a paragraph.
    expect(style.blockquote!.borderLeft).toBeGreaterThan(0);

    // The table nobody had ever rendered on a published page.
    expect(style.td!.borderTop).toBeGreaterThan(0);
    expect(style.th!.weight).toBeGreaterThan(style.td!.weight);

    // Inline code that looks like prose is code nobody can see.
    expect(style.code!.background).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("M-TYPO-T2: the editor and the published page agree about the heading scale", async ({
    page,
  }) => {
    // Two definitions of one scale — `editorTheme` for the editing surface,
    // `.article-body` for everything that reads a document back — because
    // Lexical hangs classes on the nodes it creates and cannot use the
    // stylesheet. This is what stops them drifting, and it is the member's
    // actual complaint: the editor showed headings, the published page did
    // not.
    await page.goto(`/posts/${postSlug}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".article-body")).toContainText(H1, {
      timeout: budget(15_000),
    });
    const published = await measure(page, ".article-body");

    await signIn(page);
    await page.goto(`/members/posts/${postId}`);
    await expect(page.getByTestId("editor-content")).toContainText(H1, {
      timeout: budget(20_000),
    });
    const editing = await measure(page, '[data-testid="editor-content"]');

    expect(editing.h1!.size).toBe(published.h1!.size);
    expect(editing.h2!.size).toBe(published.h2!.size);
    expect(editing.h3!.size).toBe(published.h3!.size);
    expect(editing.h1!.weight).toBe(published.h1!.weight);
  });
});

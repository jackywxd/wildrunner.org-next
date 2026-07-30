import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "@playwright/test";

import { lexicalParagraph } from "@/lib/lexical-helpers";
import {
  TEST_MEMBER,
  TEST_MEMBER_TWO,
  adminContext,
  ensureMemberUser,
  loginContext,
} from "../helpers/members";

/**
 * Dispatches a real `paste` event carrying a PNG File, as a screenshot would.
 *
 * A function rather than a string: `page.evaluate` treats a string as an
 * *expression*, so a string holding an arrow function would only ever
 * evaluate to the function object and never call it.
 */
function pasteImage() {
  const b64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const dt = new DataTransfer();
  dt.items.add(new File([bytes], "pasted.png", { type: "image/png" }));
  document
    .querySelector('[data-testid="editor-content"]')!
    .dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      }),
    );
}

async function signIn(
  page: Page,
  credentials: { email: string; password: string },
) {
  const login = await page.context().request.post("/api/users/login", {
    data: credentials,
  });
  expect(login.ok()).toBeTruthy();
}

/**
 * F — the member posts list and the Notion-style editor.
 *
 * The two rules that make this dangerous rather than merely fiddly are
 * asserted here directly: every write except an explicit publish must carry
 * `?draft=true` (or typing publishes to the live site), and the editor must
 * load at `depth: 0` (or a populated Media object gets written back into a
 * field that has to hold an id).
 */
test.describe("F member posts and editor", () => {
  const stamp = Date.now();
  let admin: APIRequestContext;
  let member: APIRequestContext;
  const createdPostIds: number[] = [];
  const createdMediaIds: number[] = [];

  test.beforeAll(async ({ baseURL }) => {
    admin = await adminContext(baseURL);
    await ensureMemberUser(admin, TEST_MEMBER);
    await ensureMemberUser(admin, TEST_MEMBER_TWO);
    member = await loginContext(baseURL, TEST_MEMBER);
  });

  test.afterAll(async () => {
    for (const id of createdPostIds) await admin?.delete(`/api/posts/${id}`);
    for (const id of createdMediaIds) await admin?.delete(`/api/media/${id}`);
    await Promise.all([admin?.dispose(), member?.dispose()]);
  });

  /**
   * Creates a post through the API so a test can start at the editor.
   *
   * `?draft=true` forces `_status: 'draft'` on create no matter what the
   * body says, so a fixture that needs to be genuinely published has to be
   * created without it.
   */
  async function seedPost(overrides: Record<string, unknown> = {}) {
    const slug = `f-${stamp}-${Math.random().toString(36).slice(2, 8)}`;
    // Title deliberately *not* equal to the slug: the slug appears in the
    // URL and therefore in the RSC payload of any page under it, including
    // the 404, so a title equal to it would make "is this post on the
    // public site?" true no matter what.
    const title = `標題 ${slug}`;
    const wantsPublished = overrides._status === "published";
    const response = await member.post(
      wantsPublished ? "/api/posts" : "/api/posts?draft=true",
      {
        data: {
          title,
          slug,
          description: "F fixture",
          content: lexicalParagraph("fixture body"),
          _status: "draft",
          ...overrides,
        },
      },
    );
    expect(response.ok(), await response.text()).toBeTruthy();
    const doc = (await response.json()).doc;
    createdPostIds.push(doc.id);
    return doc as { id: number; slug: string; title: string };
  }

  test("F1-T1: a new post starts as a draft and is not on the public site", async ({
    page,
  }) => {
    await signIn(page, TEST_MEMBER);
    await page.goto("/members/posts");
    await page.getByTestId("posts-new").click();
    await page.waitForURL(/\/members\/posts\/\d+$/);

    const id = Number(page.url().split("/").pop());
    createdPostIds.push(id);
    await expect(page.getByTestId("post-status")).toHaveAttribute(
      "data-status",
      "draft",
    );

    // Asserted on what the page shows, not its status code: a `notFound()`
    // in a dynamic route still renders under a 200 in dev, so the status is
    // a proxy for the thing that actually matters — that no draft content
    // is served. Matches how P2-T1/T3 checks the same property.
    const slug = await page.getByTestId("post-slug").inputValue();
    const title = await page.getByTestId("post-title").inputValue();
    await page.goto(`/posts/${slug}`);
    await expect(page.getByRole("heading", { name: title })).toHaveCount(0);

    await page.goto("/members/posts");
    await expect(page.getByTestId(`post-row-${id}`)).toHaveAttribute(
      "data-status",
      "draft",
    );
  });

  test("F1-T2: publishing puts the post on the public site", async ({
    page,
  }) => {
    const post = await seedPost();
    await signIn(page, TEST_MEMBER);
    await page.goto(`/members/posts/${post.id}`);
    await page.waitForSelector('[data-testid="editor-content"]');

    await page.getByTestId("post-publish").click();
    await expect(page.getByTestId("post-status")).toHaveAttribute(
      "data-status",
      "published",
    );

    // Unique query so this is a distinct browser-cache entry from any
    // earlier visit to the same URL — pages ship public, max-age=3600 and
    // would otherwise serve the pre-publish copy (see P2-T1/T3).
    await page.goto(`/posts/${post.slug}?published=${Date.now()}`);
    await expect(
      page.getByRole("heading", { name: post.title }),
    ).toBeVisible();
  });

  test("F1-T3: unpublishing removes it from the public site", async ({
    page,
  }) => {
    const post = await seedPost({
      _status: "published",
      publishedAt: new Date().toISOString(),
    });
    await signIn(page, TEST_MEMBER);
    await page.goto(`/members/posts/${post.id}`);
    await page.waitForSelector('[data-testid="editor-content"]');

    await page.getByTestId("post-unpublish").click();
    await expect(page.getByTestId("post-status")).toHaveAttribute(
      "data-status",
      "draft",
    );

    await expect
      .poll(
        async () => {
          await page.goto(`/posts/${post.slug}?unpublished=${Date.now()}`);
          return page
            .getByRole("heading", { name: post.title })
            .count();
        },
        { timeout: 15_000, message: "post stayed on the public site" },
      )
      .toBe(0);
  });

  test("F1-T4: a duplicate slug shows a field error, not a 500", async ({
    page,
  }) => {
    const taken = await seedPost();
    const mine = await seedPost();

    await signIn(page, TEST_MEMBER);
    await page.goto(`/members/posts/${mine.id}`);
    await page.waitForSelector('[data-testid="editor-content"]');

    await page.getByTestId("post-slug").fill(taken.slug);
    await page.getByTestId("post-save-draft").click();

    await expect(page.getByTestId("post-slug-error")).toBeVisible();
    // The post itself must be untouched, not half-written.
    const doc = await (
      await member.get(`/api/posts/${mine.id}?draft=true&depth=0`)
    ).json();
    expect(doc.slug).toBe(mine.slug);
  });

  test("F1-T5: another member cannot see or open the post", async ({
    page,
  }) => {
    const post = await seedPost();

    await signIn(page, TEST_MEMBER_TWO);
    await page.goto("/members/posts");
    await expect(page.getByTestId(`post-row-${post.id}`)).toHaveCount(0);

    const other = await loginContext(page.url(), TEST_MEMBER_TWO);
    try {
      const read = await other.get(`/api/posts/${post.id}?depth=0`);
      expect(read.status()).toBeGreaterThanOrEqual(400);
      const write = await other.patch(`/api/posts/${post.id}?draft=true`, {
        data: { title: "hijacked" },
      });
      expect(write.status()).toBeGreaterThanOrEqual(400);
    } finally {
      await other.dispose();
    }
  });

  test("F1-T6: a published post with an unsaved draft lists its draft title", async ({
    page,
  }) => {
    const post = await seedPost({
      _status: "published",
      publishedAt: new Date().toISOString(),
    });
    const draftTitle = `草稿標題-${stamp}`;

    await signIn(page, TEST_MEMBER);
    await page.goto(`/members/posts/${post.id}`);
    await page.waitForSelector('[data-testid="editor-content"]');
    await page.getByTestId("post-title").fill(draftTitle);
    await page.getByTestId("post-save-draft").click();
    await expect(page.getByTestId("post-message")).toBeVisible();

    await page.goto("/members/posts");
    await expect(page.getByTestId(`post-row-${post.id}`)).toContainText(
      draftTitle,
    );

    // ...while the public page still shows the published title.
    await page.goto(`/posts/${post.slug}?check=${Date.now()}`);
    await expect(
      page.getByRole("heading", { name: post.title }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: draftTitle }),
    ).toHaveCount(0);
  });

  test("F2-T1: typed content saves as matching Lexical JSON", async ({
    page,
  }) => {
    const post = await seedPost();
    await signIn(page, TEST_MEMBER);
    await page.goto(`/members/posts/${post.id}`);
    await page.waitForSelector('[data-testid="editor-content"]');

    const typed = `打字內容-${stamp}`;
    await page.getByTestId("editor-content").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type(typed);
    await page.getByTestId("post-save-draft").click();
    await expect(page.getByTestId("post-message")).toBeVisible();

    const doc = await (
      await member.get(`/api/posts/${post.id}?draft=true&depth=0`)
    ).json();
    expect(JSON.stringify(doc.content)).toContain(typed);
    expect(doc.content.root.type).toBe("root");
  });

  test("F2-T2: a post containing an unregistered node saves back unchanged", async ({
    page,
  }) => {
    // A `table` is something an admin can create in /admin today
    // (EXPERIMENTAL_TableFeature is enabled) and this editor has no class
    // for. Opening and saving must not touch it — UnknownNode's whole job.
    const content = {
      root: {
        type: "root",
        version: 1,
        direction: null,
        format: "",
        indent: 0,
        children: [
          {
            type: "paragraph",
            version: 1,
            direction: null,
            format: "",
            indent: 0,
            // textFormat/textStyle are always present on a paragraph Payload
            // itself wrote — Lexical's ParagraphNode.exportJSON() emits them
            // unconditionally. Included so this fixture matches real stored
            // content and the assertion below is about the table, not about
            // paragraph normalisation.
            textFormat: 0,
            textStyle: "",
            children: [
              {
                type: "text",
                version: 1,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                text: "before the table",
              },
            ],
          },
          {
            type: "table",
            version: 1,
            colWidths: [100, 200],
            children: [
              {
                type: "tablerow",
                version: 1,
                children: [
                  {
                    type: "tablecell",
                    version: 1,
                    headerState: 1,
                    colSpan: 1,
                    rowSpan: 1,
                    children: [
                      {
                        type: "paragraph",
                        version: 1,
                        direction: null,
                        format: "",
                        indent: 0,
                        children: [
                          {
                            type: "text",
                            version: 1,
                            detail: 0,
                            format: 0,
                            mode: "normal",
                            style: "",
                            text: "cell one",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    const post = await seedPost({ content });

    await signIn(page, TEST_MEMBER);
    await page.goto(`/members/posts/${post.id}`);
    await page.waitForSelector('[data-testid="editor-content"]');

    // Save without editing anything.
    await page.getByTestId("post-save-draft").click();
    await expect(page.getByTestId("post-message")).toBeVisible();

    const doc = await (
      await member.get(`/api/posts/${post.id}?draft=true&depth=0`)
    ).json();
    // The table specifically: this is the node the editor has no class for,
    // so it is the one UnknownNode has to hand back untouched.
    expect(doc.content.root.children[1]).toEqual(content.root.children[1]);
    expect(doc.content).toEqual(content);
  });

  test("F2-T3: editing a published post's draft leaves the public page alone", async ({
    page,
  }) => {
    const post = await seedPost({
      _status: "published",
      publishedAt: new Date().toISOString(),
      content: lexicalParagraph("published body"),
    });

    await signIn(page, TEST_MEMBER);
    await page.goto(`/members/posts/${post.id}`);
    await page.waitForSelector('[data-testid="editor-content"]');

    await page.getByTestId("editor-content").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("draft-only body");
    await page.getByTestId("post-save-draft").click();
    await expect(page.getByTestId("post-message")).toBeVisible();

    const publicHtml = await (
      await page.context().request.get(`/posts/${post.slug}?draftcheck=${Date.now()}`)
    ).text();
    expect(publicHtml).toContain("published body");
    expect(publicHtml).not.toContain("draft-only body");

    // And publishing makes it visible.
    await page.getByTestId("post-publish").click();
    await expect(page.getByTestId("post-status")).toHaveAttribute(
      "data-status",
      "published",
    );
    await expect
      .poll(
        async () =>
          (
            await page.context().request.get(
              `/posts/${post.slug}?afterpublish=${Date.now()}`,
            )
          ).text(),
        { timeout: 15_000 },
      )
      .toContain("draft-only body");
  });

  test("F2-T4: the slash menu inserts blocks in the corpus's shape", async ({
    page,
  }) => {
    const post = await seedPost();
    await signIn(page, TEST_MEMBER);
    await page.goto(`/members/posts/${post.id}`);
    await page.waitForSelector('[data-testid="editor-content"]');

    await page.getByTestId("editor-content").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");

    await page.keyboard.type("/");
    await expect(page.getByTestId("editor-slash-menu")).toBeVisible();
    await page.getByTestId("editor-slash-option-小標題").click();
    await page.keyboard.type("一個標題");

    await page.keyboard.press("Enter");
    await page.keyboard.type("/");
    await expect(page.getByTestId("editor-slash-menu")).toBeVisible();
    await page.getByTestId("editor-slash-option-項目清單").click();
    await page.keyboard.type("第一項");

    await page.getByTestId("post-save-draft").click();
    await expect(page.getByTestId("post-message")).toBeVisible();

    const doc = await (
      await member.get(`/api/posts/${post.id}?draft=true&depth=0`)
    ).json();
    const types = doc.content.root.children.map(
      (child: { type: string }) => child.type,
    );
    expect(types).toContain("heading");
    expect(types).toContain("list");

    const heading = doc.content.root.children.find(
      (child: { type: string }) => child.type === "heading",
    );
    expect(heading.tag).toBe("h2");

    const list = doc.content.root.children.find(
      (child: { type: string }) => child.type === "list",
    );
    expect(list.listType).toBe("bullet");
    expect(list.children[0].type).toBe("listitem");
  });

  test("F3-T1: pasting an image uploads it and renders on the published page", async ({
    page,
  }) => {
    const post = await seedPost();
    await signIn(page, TEST_MEMBER);
    await page.goto(`/members/posts/${post.id}`);
    await page.waitForSelector('[data-testid="editor-content"]');

    await page.getByTestId("editor-content").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");
    await page.evaluate(pasteImage);

    const uploaded = page.getByTestId("editor-upload");
    await expect(uploaded).toBeVisible({ timeout: 30_000 });
    const mediaId = Number(await uploaded.getAttribute("data-media-id"));
    expect(mediaId).toBeGreaterThan(0);
    createdMediaIds.push(mediaId);

    await page.getByTestId("post-publish").click();
    await expect(page.getByTestId("post-status")).toHaveAttribute(
      "data-status",
      "published",
    );

    // The stored node must be the exact shape Payload's own upload field
    // writes — anything else and server-side population won't resolve it.
    const doc = await (
      await member.get(`/api/posts/${post.id}?draft=true&depth=0`)
    ).json();
    const upload = doc.content.root.children.find(
      (child: { type: string }) => child.type === "upload",
    );
    expect(upload).toMatchObject({
      type: "upload",
      version: 3,
      relationTo: "media",
      value: mediaId,
    });

    await page.goto(`/posts/${post.slug}`);
    const image = page.locator('img[src*="/_next/image"]').first();
    await expect(image).toBeVisible();
  });

  test("F3-T2: saving is blocked while an upload is in flight", async ({
    page,
  }) => {
    const post = await seedPost();
    await signIn(page, TEST_MEMBER);

    // Hold the upload open so the in-flight state is observable rather than
    // a race — a tiny PNG against a local server otherwise finishes before
    // any assertion could run.
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/media", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await held;
      await route.continue();
    });

    await page.goto(`/members/posts/${post.id}`);
    await page.waitForSelector('[data-testid="editor-content"]');
    await page.getByTestId("editor-content").click();
    await page.evaluate(pasteImage);

    await expect(page.getByTestId("editor-upload-pending")).toBeVisible();
    await expect(page.getByTestId("post-uploading")).toBeVisible();
    await expect(page.getByTestId("post-save-draft")).toBeDisabled();
    await expect(page.getByTestId("post-publish")).toBeDisabled();

    release!();

    await expect(page.getByTestId("editor-upload")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("post-save-draft")).toBeEnabled();

    const mediaId = Number(
      await page.getByTestId("editor-upload").getAttribute("data-media-id"),
    );
    if (mediaId > 0) createdMediaIds.push(mediaId);
  });
});

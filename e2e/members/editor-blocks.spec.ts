import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "../helpers/test";

import { lexicalParagraph } from "@/lib/lexical-helpers";
import { emptyContent } from "@/lib/editor/empty";
import {
  TEST_MEMBER,
  adminContext,
  ensureMemberUser,
  loginContext,
} from "../helpers/members";

/**
 * E — tables, the save flow, image drop, block dragging, markdown.
 *
 * Kept out of post-editor.spec.ts, which already owns the two rules that
 * make the editor dangerous (draft=true on every non-publish write, depth 0
 * on load). Those are unchanged here; this file is about what the editor
 * can now do.
 */

/**
 * Dispatches a real `drop` carrying a PNG File, as dragging one in from the
 * desktop would.
 *
 * A function rather than a string, for the same reason `pasteImage` in
 * post-editor.spec.ts is: `page.evaluate` treats a string as an
 * *expression*, so a string holding an arrow function would evaluate to the
 * function object and never call it.
 *
 * `dragover` is dispatched first and its `defaultPrevented` returned: that
 * is the half of the contract a drop test would otherwise miss entirely.
 * Without preventDefault there, a real browser refuses the drop and
 * navigates the tab to the file — but a synthetic `drop` event still
 * arrives, so the plugin would look like it worked while being broken for
 * every actual user.
 */
function dropImage(): boolean {
  const b64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const dt = new DataTransfer();
  dt.items.add(new File([bytes], "dropped.png", { type: "image/png" }));

  const target = document.querySelector(
    '[data-testid="editor-content"]',
  ) as HTMLElement;
  const box = target.getBoundingClientRect();
  const init = {
    bubbles: true,
    cancelable: true,
    clientX: Math.round(box.left + box.width / 2),
    clientY: Math.round(box.top + 10),
    dataTransfer: dt,
  };

  const over = new DragEvent("dragover", init);
  target.dispatchEvent(over);
  const accepted = over.defaultPrevented;

  target.dispatchEvent(new DragEvent("drop", init));
  return accepted;
}

/** Drops a PNG onto the last paragraph, so it lands at the end. */
function dropImageAtEnd() {
  const b64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const dt = new DataTransfer();
  dt.items.add(new File([bytes], "at-end.png", { type: "image/png" }));

  const paragraphs = document.querySelectorAll(
    '[data-testid="editor-content"] p',
  );
  const last = paragraphs[paragraphs.length - 1] as HTMLElement;
  const box = last.getBoundingClientRect();
  const init = {
    bubbles: true,
    cancelable: true,
    // Past the right edge of the text, not at the left: the drop point
    // resolves to a caret, and one landing mid-word splits the paragraph
    // around the image instead of putting it after.
    clientX: Math.round(box.right - 5),
    clientY: Math.round(box.top + box.height / 2),
    dataTransfer: dt,
  };
  last.dispatchEvent(new DragEvent("dragover", init));
  last.dispatchEvent(new DragEvent("drop", init));
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

test.describe("E editor blocks", () => {
  const stamp = Date.now();
  let admin: APIRequestContext;
  let member: APIRequestContext;
  const createdPostIds: number[] = [];
  const createdMediaIds: number[] = [];

  test.beforeAll(async ({ baseURL }) => {
    admin = await adminContext(baseURL);
    await ensureMemberUser(admin, TEST_MEMBER);
    member = await loginContext(baseURL, TEST_MEMBER);
  });

  test.afterAll(async () => {
    for (const id of createdPostIds) await admin?.delete(`/api/posts/${id}`);
    for (const id of createdMediaIds) await admin?.delete(`/api/media/${id}`);
    await Promise.all([admin?.dispose(), member?.dispose()]);
  });

  async function seedPost(overrides: Record<string, unknown> = {}) {
    const slug = `e-${stamp}-${Math.random().toString(36).slice(2, 8)}`;
    const response = await member.post("/api/posts?draft=true", {
      data: {
        title: `標題 ${slug}`,
        slug,
        description: "E fixture",
        content: lexicalParagraph("fixture body"),
        _status: "draft",
        ...overrides,
      },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const doc = (await response.json()).doc;
    createdPostIds.push(doc.id);
    return doc as { id: number; slug: string; title: string };
  }

  /** The stored draft content, which is what a save actually wrote. */
  async function storedContent(id: number) {
    const response = await member.get(`/api/posts/${id}?draft=true&depth=0`);
    expect(response.ok()).toBeTruthy();
    return (await response.json()).content as {
      root: { children: { type: string; [key: string]: unknown }[] };
    };
  }

  async function openEditor(page: Page, id: number) {
    await page.goto(`/members/posts/${id}`);
    await page.waitForSelector('[data-testid="editor-content"]');
  }

  test("E-T1: a table survives insert, save and reload", async ({ page }) => {
    const post = await seedPost();
    await signIn(page, TEST_MEMBER);
    await openEditor(page, post.id);

    await page.getByTestId("editor-content").click();
    await page.getByTestId("editor-toolbar-table").click();

    const table = page.locator('[data-testid="editor-content"] table');
    await expect(table).toHaveCount(1);
    // 3 rows of 3, the documented default.
    await expect(table.locator("tr")).toHaveCount(3);
    await expect(table.locator("tr").first().locator("th")).toHaveCount(3);

    // Type into a body cell so the reload assertion is about content, not
    // just structure — an empty table would round-trip even if cell text
    // were being dropped.
    await table.locator("tr").nth(1).locator("td").first().click();
    await page.keyboard.type("CCC");

    await page.getByTestId("post-save-draft").click();
    await expect(page.getByTestId("post-message")).toHaveText("已儲存草稿");

    const stored = await storedContent(post.id);
    expect(stored.root.children.some((node) => node.type === "table")).toBe(
      true,
    );

    await page.reload();
    await page.waitForSelector('[data-testid="editor-content"]');
    await expect(
      page.locator('[data-testid="editor-content"] table'),
    ).toHaveCount(1);
    await expect(page.locator('[data-testid="editor-content"] table')).toContainText(
      "CCC",
    );
  });

  test("E-T2: the table toolbar adds and removes rows and columns", async ({
    page,
  }) => {
    const post = await seedPost();
    await signIn(page, TEST_MEMBER);
    await openEditor(page, post.id);

    await page.getByTestId("editor-content").click();
    await page.getByTestId("editor-toolbar-table").click();

    const table = page.locator('[data-testid="editor-content"] table');
    await table.locator("tr").nth(1).locator("td").first().click();

    // The toolbar only exists while the caret is in a table — that
    // conditional rendering is itself the first assertion.
    await expect(page.getByTestId("editor-table-toolbar")).toBeVisible();

    await page.getByTestId("editor-table-row-below").click();
    await expect(table.locator("tr")).toHaveCount(4);

    await page.getByTestId("editor-table-col-right").click();
    await expect(table.locator("tr").nth(1).locator("td")).toHaveCount(4);

    await page.getByTestId("editor-table-row-delete").click();
    await expect(table.locator("tr")).toHaveCount(3);

    await page.getByTestId("editor-table-table-delete").click();
    await expect(table).toHaveCount(0);
    await expect(page.getByTestId("editor-table-toolbar")).toHaveCount(0);
  });

  test("E-T3: publishing returns to the post list", async ({ page }) => {
    const post = await seedPost();
    await signIn(page, TEST_MEMBER);
    await openEditor(page, post.id);

    await page.getByTestId("post-publish").click();
    await page.waitForURL("**/members/posts", { timeout: 30_000 });

    await expect(page.getByTestId(`post-row-${post.id}`)).toHaveAttribute(
      "data-status",
      "published",
    );
  });

  test("E-T4: saving a draft stays in the editor", async ({ page }) => {
    const post = await seedPost();
    await signIn(page, TEST_MEMBER);
    await openEditor(page, post.id);

    await page.getByTestId("editor-content").click();
    await page.keyboard.type("草稿內容");

    const before = page.url();
    await page.getByTestId("post-save-draft").click();
    await expect(page.getByTestId("post-message")).toHaveText("已儲存草稿");

    expect(page.url()).toBe(before);
    await expect(page.getByTestId("editor-content")).toContainText("草稿內容");
    // The dirty marker clearing is what tells the member the save landed.
    await expect(page.getByTestId("post-dirty")).toHaveCount(0);
  });

  test("E-T5: a dropped image is accepted and uploaded", async ({ page }) => {
    const post = await seedPost();
    await signIn(page, TEST_MEMBER);
    await openEditor(page, post.id);

    await page.getByTestId("editor-content").click();
    const accepted = await page.evaluate(dropImage);
    // Without this the browser would navigate to the file instead.
    expect(accepted, "dragover must preventDefault to accept the drop").toBe(
      true,
    );

    // The placeholder resolves into a real upload node once the media id
    // comes back; waiting on the *uploading* flag clearing is what proves
    // the shared pending counter is wired to the save button.
    await expect(page.getByTestId("post-uploading")).toHaveCount(0, {
      timeout: 30_000,
    });

    await page.getByTestId("post-save-draft").click();
    await expect(page.getByTestId("post-message")).toHaveText("已儲存草稿");

    const stored = await storedContent(post.id);
    const upload = stored.root.children.find((node) => node.type === "upload");
    expect(upload, "a dropped image must reach the saved document").toBeTruthy();
    // A number, never a populated Media object — the same rule the editor's
    // depth:0 load exists to protect.
    const value = upload?.value;
    expect(typeof value).toBe("number");
    createdMediaIds.push(value as number);
  });

  test("E-T6: markdown shortcuts produce real blocks", async ({ page }) => {
    // `emptyContent()`, not `lexicalParagraph("")`: the latter builds a
    // paragraph holding an empty *text node*, which no code path in the
    // product produces — `PostsList.create` uses `emptyContent()`, whose
    // paragraph has no children at all. Typing into that stray empty text
    // node leaves the first character in a text node of its own, and
    // @lexical/markdown's element transformers only run when the caret's
    // text node is the paragraph's first child, so `## ` silently stayed a
    // paragraph. The shortcut was never broken; the fixture was.
    const post = await seedPost({ content: emptyContent() });
    await signIn(page, TEST_MEMBER);
    await openEditor(page, post.id);

    const content = page.getByTestId("editor-content");
    await content.click();
    await page.keyboard.type("## 小標題");
    await page.keyboard.press("Enter");
    await page.keyboard.type("- 第一項");
    await page.keyboard.press("Enter");
    await page.keyboard.type("第二項");

    await expect(content.locator("h2")).toHaveText("小標題");
    await expect(content.locator("ul li")).toHaveCount(2);

    // Saved, because the shortcut has to produce the node type Payload
    // stores — not merely something that looks right in the DOM.
    await page.getByTestId("post-save-draft").click();
    await expect(page.getByTestId("post-message")).toHaveText("已儲存草稿");

    const stored = await storedContent(post.id);
    const types = stored.root.children.map((node) => node.type);
    expect(types).toContain("heading");
    expect(types).toContain("list");
  });

  test("E-T7: the block type dropdown reflects and changes the caret's block", async ({
    page,
  }) => {
    const post = await seedPost();
    await signIn(page, TEST_MEMBER);
    await openEditor(page, post.id);

    const content = page.getByTestId("editor-content");
    await content.click();

    const blockType = page.getByTestId("editor-block-type");
    await expect(blockType).toHaveValue("paragraph");

    await blockType.selectOption("h1");
    await expect(content.locator("h1")).toHaveCount(1);
    // Reflecting back is the half that breaks silently: the toolbar has to
    // read the selection, not just write to it.
    await expect(blockType).toHaveValue("h1");

    await blockType.selectOption("ul");
    await expect(content.locator("ul li")).toHaveCount(1);
    await expect(blockType).toHaveValue("ul");

    // Leaving a list needs the list dismantled first, or $setBlocksType
    // swaps the item and strands the <ul> around it.
    await blockType.selectOption("paragraph");
    await expect(content.locator("ul")).toHaveCount(0);
  });

  test("E-T10: the toolbar prevents mousedown for buttons but not the select", async ({
    page,
  }) => {
    // The bug this pins was invisible to E-T7, and that is the point of
    // having it separately. E-T7 drives the dropdown with `selectOption`,
    // which sets the value directly — so it passed while the control was
    // completely dead to a real user: the container's blanket
    // `onMouseDown={preventDefault}` swept up the <select> along with the
    // buttons, and preventing mousedown on a native select stops the
    // browser opening its dropdown at all.
    //
    // Asserted on `defaultPrevented` rather than on "did a popup appear",
    // because the native dropdown is browser chrome that a page cannot
    // observe. This is the mechanism, one layer below the symptom.
    const post = await seedPost();
    await signIn(page, TEST_MEMBER);
    await openEditor(page, post.id);

    const prevented = await page.evaluate(() => {
      const fire = (selector: string) => {
        const element = document.querySelector(selector) as HTMLElement;
        const event = new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
        });
        element.dispatchEvent(event);
        return event.defaultPrevented;
      };
      return {
        button: fire('[data-testid="editor-toolbar-bold"]'),
        select: fire('[data-testid="editor-block-type"]'),
      };
    });

    expect(prevented.select, "the block-type dropdown must open").toBe(false);
    // The other half: buttons still must not steal focus, or pressing one
    // collapses the selection it was about to format.
    expect(prevented.button, "buttons must keep the selection alive").toBe(
      true,
    );

    // And the dropdown still applies after a real click has moved focus
    // off the editor — the reason the blanket prevent was there at all.
    const content = page.getByTestId("editor-content");
    await content.click();
    const blockType = page.getByTestId("editor-block-type");
    await blockType.click();
    await blockType.selectOption("h1");
    await expect(content.locator("h1")).toHaveCount(1);
  });

  /**
   * Block order as a single string, images shown as [IMG].
   *
   * Keyed on the upload wrapper rather than on an `<img>`: the preview
   * resolves the media id over the API and renders a "媒體 #123" fallback
   * until that returns, so an `img` probe reports the image as a text
   * block whenever the fetch is slow — which made this fail against
   * working code in a full-suite run but not in isolation. Reading the
   * wrapper also keeps the delete button's own label out of the text.
   */
  async function blockOrder(page: Page) {
    return page.evaluate(() =>
      Array.from(
        document.querySelector('[data-testid="editor-content"]')!.children,
      )
        .map((el) =>
          el.matches('[data-testid="editor-upload"]') ||
          el.querySelector('[data-testid="editor-upload"]')
            ? "[IMG]"
            : (el.textContent || "").trim() || el.tagName,
        )
        .join(" | "),
    );
  }

  test("E-T8: the drag handle reorders blocks", async ({ page }) => {
    const post = await seedPost({ content: emptyContent() });
    await signIn(page, TEST_MEMBER);
    await openEditor(page, post.id);

    const content = page.getByTestId("editor-content");
    await content.click();
    await page.keyboard.type("AAA");
    await page.keyboard.press("Enter");
    await page.keyboard.type("BBB");
    await page.keyboard.press("Enter");
    await page.keyboard.type("CCC");
    // Polled, not a bare await: every one of these order reads is a
    // snapshot of a document Lexical may still be reconciling, and a
    // precondition that fails on the first frame reports as a broken
    // feature rather than as "not settled yet".
    await expect.poll(() => blockOrder(page), { timeout: 10_000 }).toBe(
      "AAA | BBB | CCC",
    );

    const first = content.locator("p").first();
    await first.hover();
    const handle = page.getByTestId("editor-drag-handle");
    await expect(handle).toBeAttached();
    const handleBox = await handle.boundingBox();
    const lastBox = await content.locator("p").nth(2).boundingBox();
    expect(handleBox, "the handle must have a laid-out position").toBeTruthy();

    // A real mouse drag, not a synthetic DragEvent: the handle's whole job
    // is to respond to one.
    await page.mouse.move(
      handleBox!.x + handleBox!.width / 2,
      handleBox!.y + handleBox!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(lastBox!.x + 20, lastBox!.y + lastBox!.height - 2, {
      steps: 20,
    });
    await page.mouse.up();

    // Asserted as a full ordering rather than "AAA is not first". An
    // earlier version of this check asked whether a block had ended up
    // where it already was, and passed without the drag doing anything.
    await expect
      .poll(() => blockOrder(page), { timeout: 5_000 })
      .toBe("BBB | CCC | AAA");
  });

  test("E-T11: dragging an image itself moves it", async ({ page }) => {
    // The handle can move any block, images included — but grabbing the
    // picture is what people try first, and an <img> is natively
    // draggable, so that gesture used to start a browser image drag that
    // went nowhere at all.
    const post = await seedPost({ content: emptyContent() });
    await signIn(page, TEST_MEMBER);
    await openEditor(page, post.id);

    const content = page.getByTestId("editor-content");
    await content.click();
    await page.keyboard.type("AAA");
    await page.keyboard.press("Enter");
    await page.keyboard.type("BBB");

    // Land the image at the end, so "moved" has a distinct answer.
    await page.evaluate(dropImageAtEnd);
    // Waited on the *settled* node, not on `img` or on the uploading flag:
    // the pending placeholder renders an <img> too (an object URL), and
    // the flag clears in a `finally` that can run before the replacement
    // has flushed. Dragging a PendingUploadNode is not the thing under
    // test — it has no media id yet and is deliberately not movable.
    await expect(page.getByTestId("editor-upload")).toHaveCount(1, {
      timeout: 30_000,
    });
    await expect(page.getByTestId("editor-upload-pending")).toHaveCount(0);
    // The exact starting order, trailing empty paragraph included —
    // `$insertNodeToNearestRoot` leaves one after the image so there is
    // somewhere to keep typing. Stated in full so the assertion after the
    // drag is comparing against something known rather than a shape that
    // happens to satisfy a loose predicate.
    //
    // Polled: the placeholder is replaced by the settled node in a separate
    // Lexical update, so a bare read can land between the two and see an
    // order that is real but momentary. That is what made this fail twice
    // and pass on the second retry in CI.
    await expect
      .poll(() => blockOrder(page), { timeout: 10_000 })
      .toBe("AAA | BBB | [IMG] | P");

    // The <img> only exists once the preview's media fetch resolves — until
    // then the node renders a "媒體 #123" fallback. The drag has to start on
    // the picture, because that is the element the browser makes draggable,
    // so this waits for it rather than reaching for whatever is there. In
    // CI it was not there yet and the drag threw on a null element.
    await expect(content.locator("img")).toHaveCount(1, { timeout: 15_000 });

    const result = await page.evaluate(() => {
      const img = document.querySelector(
        '[data-testid="editor-content"] img',
      ) as HTMLElement;
      const firstParagraph = document.querySelector(
        '[data-testid="editor-content"] p',
      ) as HTMLElement;
      const from = img.getBoundingClientRect();
      const to = firstParagraph.getBoundingClientRect();
      // One DataTransfer shared across the three events, as a real browser
      // drag does — the whole point is that dragstart writes the key that
      // drop reads back.
      const transfer = new DataTransfer();

      img.dispatchEvent(
        new DragEvent("dragstart", {
          bubbles: true,
          cancelable: true,
          clientX: Math.round(from.left + 5),
          clientY: Math.round(from.top + 5),
          dataTransfer: transfer,
        }),
      );
      const claimed = Array.from(transfer.types);

      const init = {
        bubbles: true,
        cancelable: true,
        clientX: Math.round(to.left + 10),
        clientY: Math.round(to.top + to.height - 1),
        dataTransfer: transfer,
      };
      const over = new DragEvent("dragover", init);
      firstParagraph.dispatchEvent(over);
      firstParagraph.dispatchEvent(new DragEvent("drop", init));
      return { claimed, overPrevented: over.defaultPrevented };
    });

    // The drag has to be claimed on dragstart, or the browser's own image
    // drag wins and the drop never carries anything we can act on.
    expect(result.claimed).toContain("application/x-wildrunner-move-upload");
    expect(result.overPrevented).toBe(true);

    // Moved up to sit directly after AAA. The move path uses `insertAfter`
    // rather than `$insertNodeToNearestRoot`, so dropping onto a line of
    // text relocates the block instead of splitting the paragraph.
    await expect
      .poll(() => blockOrder(page), { timeout: 5_000 })
      .toBe("AAA | [IMG] | BBB | P");
  });

  test("E-T12: an image can be deleted, by button and by keyboard", async ({
    page,
  }) => {
    // A DecoratorNode sits outside ordinary caret editing — the caret
    // cannot be placed on it — so before node selection existed there was
    // no gesture at all that removed an image. Clicking it and pressing
    // Backspace deleted the empty paragraph *after* the image while the
    // image stayed; Backspace and Delete from either neighbour did
    // nothing. Both routes are pinned because they fail independently:
    // the button is a plain click, the keyboard path needs a real
    // NodeSelection.
    const post = await seedPost({ content: emptyContent() });
    await signIn(page, TEST_MEMBER);
    await openEditor(page, post.id);

    const content = page.getByTestId("editor-content");
    await content.click();
    await page.keyboard.type("AAA");

    await page.evaluate(dropImageAtEnd);
    await expect(page.getByTestId("editor-upload")).toHaveCount(1, {
      timeout: 30_000,
    });

    // Route 1: the hover button.
    const image = page.getByTestId("editor-upload");
    await image.hover();
    const removeButton = page.getByTestId("editor-upload-remove");
    await expect(removeButton).toBeVisible();
    await removeButton.click();
    await expect(page.getByTestId("editor-upload")).toHaveCount(0);
    await expect(content).toContainText("AAA");

    // Route 2: select it and press Backspace.
    await content.click();
    await page.evaluate(dropImageAtEnd);
    await expect(page.getByTestId("editor-upload")).toHaveCount(1, {
      timeout: 30_000,
    });

    await page.getByTestId("editor-upload").click();
    await expect(page.getByTestId("editor-upload")).toHaveAttribute(
      "data-selected",
      "true",
    );
    await page.keyboard.press("Backspace");
    await expect(page.getByTestId("editor-upload")).toHaveCount(0);
    // The text either side must survive — an over-eager handler that
    // removed the selection rather than the node would take this too.
    await expect(content).toContainText("AAA");
  });

  test("E-T9: an admin-authored table renders on the public post", async ({
    page,
  }) => {
    // Written through the API in Payload's own shape, which is the case
    // that matters: these tables predate the member editor and must both
    // survive it and render publicly.
    const post = await seedPost({
      content: {
        root: {
          type: "root",
          version: 1,
          direction: "ltr",
          format: "",
          indent: 0,
          children: [
            {
              type: "table",
              version: 1,
              direction: "ltr",
              format: "",
              indent: 0,
              children: [
                {
                  type: "tablerow",
                  version: 1,
                  direction: "ltr",
                  format: "",
                  indent: 0,
                  children: [
                    tableCell("賽事", 1),
                    tableCell("年份", 1),
                  ],
                },
                {
                  type: "tablerow",
                  version: 1,
                  direction: "ltr",
                  format: "",
                  indent: 0,
                  children: [tableCell("CCC", 0), tableCell("2024", 0)],
                },
              ],
            },
          ],
        },
      },
    });

    const published = await member.patch(`/api/posts/${post.id}`, {
      data: { _status: "published", publishedAt: new Date().toISOString() },
    });
    expect(published.ok(), await published.text()).toBeTruthy();

    await page.goto(`/posts/${post.slug}?t=${Date.now()}`);
    const table = page.locator("article table, main table").first();
    await expect(table).toBeVisible();
    await expect(table).toContainText("CCC");
    await expect(table.locator("th")).toHaveCount(2);

    // The design system's border, not the default converter's #ccc — that
    // literal is the same grey in both themes and vanishes on dark.
    const border = await table
      .locator("td")
      .first()
      .evaluate((cell) => getComputedStyle(cell).borderTopColor);
    expect(border).not.toBe("rgb(204, 204, 204)");
  });
});

function tableCell(text: string, headerState: number) {
  return {
    type: "tablecell",
    version: 1,
    backgroundColor: null,
    colSpan: 1,
    direction: "ltr",
    format: "",
    headerState,
    indent: 0,
    rowSpan: 1,
    children: [
      {
        type: "paragraph",
        version: 1,
        direction: "ltr",
        format: "",
        indent: 0,
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
            text,
          },
        ],
      },
    ],
  };
}

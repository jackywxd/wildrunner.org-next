import { expect, test } from "../helpers/test";
import { waitForHydration } from "../helpers/hydration";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";
import { deleteCreatedRows, leavePostEditor } from "../helpers/teardown";

/**
 * M-IMGWIDTH — a member narrows a picture, on a phone.
 *
 * The stored half of this is `U-IMGWIDTH` (pure, environment-independent):
 * the preset table, the default for a node with no `fields`, and the
 * round trip that proves an author's choice survives Payload's content
 * column. None of that needs a browser and none of it is repeated here.
 *
 * What is here is the half a unit test cannot see, and it is the half that
 * was broken. The controls first sat in an `opacity-0` bar floating on top
 * of the picture, revealed on hover — and on a 320px screen `small` is a
 * 149x100 frame under a 141x92 bar, so the tap that was meant to select the
 * image landed on a button instead: it set 滿版 and selected nothing, with
 * the bar never once visible. `pointer-events-none` did not fix it either,
 * because Chromium applies `:hover` on touchstart and the companion
 * `group-hover:pointer-events-auto` turned the bar live again before the
 * click was dispatched. So this test taps, at a phone's width, with touch —
 * a `click()` on a desktop viewport passed against every one of those
 * versions.
 *
 * The assertion is a measurement, not a class name. `w-3/5` present in the
 * DOM says the component decided; the rendered width says the page agreed,
 * and a Tailwind class that stops being generated would keep the first one
 * true.
 */

/**
 * A 64x16 PNG — wide and flat, and that shape is the fixture's whole job.
 *
 * The 1x1 every other spec uses renders as a square: at `small` on this
 * viewport that is a 190x190 box, and a bar across its top covers a quarter
 * of it, so a tap aimed at the middle never reaches the bar and the test
 * passes against the broken overlay. Measured — it did. A flat picture at
 * `small` is 190x47, which a 44px bar covers outright, and that is the
 * geometry a member's panorama actually has.
 */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAAAQCAIAAAAphe5+AAAAN0lEQVR4nO3PUQkAAAjE0GtoALPZ1RB+" +
    "DGGwAG+p6dcFFzhACxygBQ7QAgdogQO0wAFa4AAtOLaKXhxMeKkjowAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * The browser needs its own session: Playwright's `request` fixture and
 * `page` keep separate cookie jars, so signing in over the API leaves the
 * browser anonymous and the editor route bounces it to /members/login.
 */
async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/members/login", { waitUntil: "domcontentloaded" });
  // The login form is a Client Component whose <form> has no `action`:
  // submitted before React attaches, nothing is sent at all.
  await waitForHydration(page);
  await page.getByTestId("member-login-email").fill(TEST_ADMIN.email);
  await page.getByTestId("member-login-password").fill(TEST_ADMIN.password);
  await page.getByTestId("member-login-submit").click();
  await expect(page).toHaveURL(/\/members$/, { timeout: budget(15_000) });
}

test.describe("M-IMGWIDTH a member narrows a picture on a phone", () => {
  // The device the choice is made on. `hasTouch` is the load-bearing half:
  // without it `tap()` is not available and the gesture under test is a
  // mouse click, which is not the gesture that was broken.
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  const created: { collection: string; id: number }[] = [];
  let postId = 0;

  test.beforeEach(async ({ request }) => {
    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const stamp = Date.now();
    const uploaded = await request.post("/api/media", {
      multipart: {
        file: { name: `width-${stamp}.png`, mimeType: "image/png", buffer: PNG },
        _payload: JSON.stringify({ alt: `M-IMGWIDTH probe ${stamp}` }),
      },
    });
    expect(uploaded.ok(), `media upload failed: ${uploaded.status()}`).toBeTruthy();
    const mediaId = (await uploaded.json()).doc.id as number;
    created.push({ collection: "media", id: mediaId });
    recordCreated({ collection: "media", id: mediaId, note: "M-IMGWIDTH probe image" });

    // No `fields` at all, which is every image written before this feature:
    // the document starts full-width because that is what absent means.
    const post = await request.post("/api/posts?draft=true", {
      data: {
        title: `M-IMGWIDTH ${stamp}`,
        slug: `m-imgwidth-${stamp}`,
        description: "圖片寬度",
        _status: "draft",
        content: {
          root: {
            type: "root",
            format: "",
            indent: 0,
            version: 1,
            direction: "ltr",
            children: [
              {
                type: "paragraph",
                format: "",
                indent: 0,
                version: 1,
                direction: "ltr",
                children: [
                  {
                    type: "text",
                    text: "圖片上面",
                    format: 0,
                    style: "",
                    mode: "normal",
                    detail: 0,
                    version: 1,
                  },
                ],
              },
              {
                type: "upload",
                relationTo: "media",
                value: mediaId,
                version: 3,
                format: "",
              },
            ],
          },
        },
      },
    });
    expect(post.ok(), `post create failed: ${post.status()}`).toBeTruthy();
    postId = (await post.json()).doc.id as number;
    created.push({ collection: "posts", id: postId });
    recordCreated({ collection: "posts", id: postId, note: "M-IMGWIDTH probe post" });
  });

  test.afterEach(async ({ page, request }) => {
    const pending = created.splice(0, created.length).reverse();
    await leavePostEditor(page);
    await deleteCreatedRows(request, pending);
  });

  test("M-IMGWIDTH-T1: 小 narrows the picture and survives a save", async ({
    page,
  }) => {
    // The first visit to /members/posts/<id> in a run pays next dev's
    // on-demand compile.
    test.setTimeout(budget(90_000));

    await signIn(page);
    await page.goto(`/members/posts/${postId}`);
    await expect(page.getByTestId("editor-content")).toBeVisible({
      timeout: budget(20_000),
    });

    const block = page.getByTestId("editor-upload");
    const picture = page.getByTestId("editor-upload-picture");
    await expect(block).toBeVisible({ timeout: budget(20_000) });

    const widthOf = async (target: typeof block) => {
      const box = await target.boundingBox();
      expect(box, "the element has no box to measure").not.toBeNull();
      return box!.width;
    };

    // Absent `fields` renders full width — the same picture an article
    // written before this feature carries.
    expect(await widthOf(picture)).toBeCloseTo(await widthOf(block), -1);

    // Every control is reachable without a hover, which a phone does not
    // have, and each is a thumb-sized target.
    for (const id of ["full", "medium", "small", "remove"]) {
      const control = page.getByTestId(
        id === "remove" ? "editor-upload-remove" : `editor-upload-width-${id}`,
      );
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box!.width, `${id} is too narrow for a thumb`).toBeGreaterThanOrEqual(44);
      expect(box!.height, `${id} is too short for a thumb`).toBeGreaterThanOrEqual(44);
    }

    await page.getByTestId("editor-upload-width-small").tap();
    await expect(page.getByTestId("editor-upload-width-small")).toHaveAttribute(
      "aria-pressed",
      "true",
      { timeout: budget(5_000) },
    );
    await expect
      .poll(async () => (await widthOf(picture)) / (await widthOf(block)), {
        timeout: budget(5_000),
      })
      .toBeLessThan(0.75);

    const narrowed = await widthOf(picture);

    // Now tap the picture itself. It must select, and it must not change
    // the width — this is the gesture that used to land on a button of an
    // invisible bar lying over the photo, and `small` is when that photo is
    // at its smallest. Order matters: the same tap before narrowing has a
    // much larger target and passes either way.
    await picture.locator("img").tap();
    await expect(block).toHaveAttribute("data-selected", "true", {
      timeout: budget(5_000),
    });
    expect(await widthOf(picture), "the tap moved the width").toBe(narrowed);

    await page.getByTestId("post-save-draft").click();
    await expect(page.getByTestId("post-status")).toBeVisible({
      timeout: budget(20_000),
    });

    // The reload is the point: until now the choice has only ever lived in
    // the editor's own state.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("editor-content")).toBeVisible({
      timeout: budget(20_000),
    });
    await expect(page.getByTestId("editor-upload-picture")).toBeVisible({
      timeout: budget(20_000),
    });
    expect(await widthOf(page.getByTestId("editor-upload-picture"))).toBe(
      narrowed,
    );
  });
});

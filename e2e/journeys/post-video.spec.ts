import { expect, test } from "../helpers/test";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";
import { getWithRetry } from "../helpers/request";
import { deleteCreatedRows, leavePostEditor } from "../helpers/teardown";

/**
 * V-POSTVIDEO — a video inside an article plays.
 *
 * The failure this pins is silent, which is why nothing caught it. The
 * `upload` converter in src/components/payload-rich-text.tsx returned
 * `next/image` for every upload node whatever its mime type, so a video in a
 * post became an `<img src="….mp4">`. `next.config.ts` sets a custom image
 * loader, so `/_next/image` is never involved and the request answers 200
 * `video/mp4`; Chromium logs nothing at all for an `<img>` it cannot decode.
 * The page just had a blank 3:2 box in it, and neither the console guard in
 * ../helpers/test.ts nor any assertion in the suite could see it.
 *
 * A video can reach `posts.content` three ways now, and none is exotic:
 * /admin's editor has Payload's unrestricted `UploadFeature`,
 * `guardPostContent` (src/collections/hooks/guard-content.ts) checks only that
 * the node's `value` is an id and never its mime type, so a member POSTing to
 * /api/posts can do it — and since #122 the member editor has its own 影片
 * button and media picker.
 *
 * That third way is `M-POSTVIDEO` below. This one stays built over the API,
 * because the two make different claims: T1 is about what a *reader* sees for
 * a document that exists however it got there, and it was written when the
 * editor could not produce one at all. Keeping it API-built also keeps it
 * covering /admin's route, which nothing else does.
 */

/**
 * The smallest bytes Payload's type sniffing accepts as `video/mp4`.
 *
 * Copied from gallery-videos.spec.ts rather than shared: a fixture is part of
 * the test that uses it, and an empty file named `.mp4` is rejected on
 * content ("File type text/plain (from extension mp4) is not allowed").
 * Nothing decodes it — this asserts the element is rendered, not that it plays.
 */
const MP4_HEADER = Buffer.concat([
  Buffer.from("00000018", "hex"),
  Buffer.from("ftypmp42"),
  Buffer.from("00000000", "hex"),
  Buffer.from("mp42isom"),
  Buffer.alloc(1024),
]);

const text = (value: string) => ({
  type: "text",
  text: value,
  detail: 0,
  format: 0,
  mode: "normal",
  style: "",
  version: 1,
});

const paragraph = (value: string) => ({
  type: "paragraph",
  format: "",
  indent: 0,
  version: 1,
  direction: "ltr",
  textFormat: 0,
  children: [text(value)],
});

/** The shape Payload's UploadServerNode serializes — see src/lib/media/references.ts. */
const upload = (mediaId: number) => ({
  type: "upload",
  relationTo: "media",
  value: mediaId,
  format: "",
  version: 3,
});

test.describe("V-POSTVIDEO a video in an article plays", () => {
  const created: { collection: string; id: number }[] = [];

  test.afterEach(async ({ page, request }) => {
    const pending = created.splice(0, created.length).reverse();
    // Before the deletes, not after: M-POSTVIDEO ends inside the editor, and
    // a post cannot be deleted out from under a page that is still autosaving
    // it. A no-op for T1, which never goes there.
    await leavePostEditor(page);
    await deleteCreatedRows(request, pending);
  });

  test("V-POSTVIDEO-T1: an uploaded video in a post body renders a player", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(60_000));

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const stamp = Date.now();
    const uploaded = await request.post("/api/media", {
      multipart: {
        file: {
          name: `post-video-${stamp}.mp4`,
          mimeType: "video/mp4",
          buffer: MP4_HEADER,
        },
        // 'attachment' because that is what a video placed in an article is,
        // and it keeps this fixture off /gallery — the two are separate
        // claims and this test should not quietly depend on the other one.
        _payload: JSON.stringify({
          alt: `V-POSTVIDEO probe ${stamp}`,
          usage: "attachment",
        }),
      },
    });
    expect(uploaded.ok(), `media upload failed: ${uploaded.status()}`).toBeTruthy();
    const mediaId = (await uploaded.json()).doc.id as number;
    created.push({ collection: "media", id: mediaId });
    recordCreated({ collection: "media", id: mediaId, note: "V-POSTVIDEO probe video" });

    const post = await request.post("/api/posts", {
      data: {
        title: `影片文章 ${stamp}`,
        slug: `v-postvideo-${stamp}`,
        description: "影片文章",
        _status: "published",
        content: {
          root: {
            type: "root",
            format: "",
            indent: 0,
            version: 1,
            direction: "ltr",
            children: [paragraph("影片在下面。"), upload(mediaId)],
          },
        },
      },
    });
    expect(post.ok(), `post create failed: ${post.status()}`).toBeTruthy();
    const doc = (await post.json()).doc as { id: number; slug: string };
    created.push({ collection: "posts", id: doc.id });
    recordCreated({ collection: "posts", id: doc.id, note: "V-POSTVIDEO probe post" });

    await page.goto(`/posts/${doc.slug}`, { waitUntil: "domcontentloaded" });

    // The paragraph proves the body rendered at all, so a missing player
    // below cannot be confused with a post that failed to load.
    await expect(page.getByText("影片在下面。")).toBeVisible({
      timeout: budget(20_000),
    });
    await expect(page.getByTestId("direct-video")).toBeVisible({
      timeout: budget(20_000),
    });
  });

  /**
   * M-POSTVIDEO — a member puts a video in an article through the editor.
   *
   * The claim is that a *person* can do this, so it is driven through the
   * toolbar. Until #122 they could not: the toolbar's file input accepted
   * `image/*` and `ImageInsertPlugin` dropped anything whose type was not an
   * image, so a member with a race clip had no route that did not involve
   * knowing what the REST API was.
   *
   * WHAT IS SPECIFICALLY WORTH ASSERTING, and why the node appearing is not
   * enough on its own: a video is uploaded *before* it is inserted, which is
   * the opposite of how an image works here. An image gets a
   * `PendingUploadNode` immediately and settles later, and `PostEditor` blocks
   * every save while one exists — right for a screenshot, unusable for twenty
   * minutes of video. So the invariant this pins is that the document reaches
   * `posts.content` carrying a real media id: an upload node holding a
   * placeholder would be refused by `guardPostContent`, and a save that
   * silently dropped the node would look identical on screen.
   *
   * `usage` is checked for the same reason M-COVER-T1 checks it. `media.usage`
   * decides whether a file appears on the public photo wall, and a video
   * dropped into an article is not photo-wall content — a wrong value here
   * puts somebody's raw race footage on /gallery with nothing on screen
   * saying so.
   */
  test("M-POSTVIDEO: uploads a video from the toolbar and saves it into the body", async ({
    page,
  }) => {
    test.setTimeout(budget(90_000));

    await page.goto("/members/login", { waitUntil: "domcontentloaded" });
    await page.getByTestId("member-login-email").fill(TEST_ADMIN.email);
    await page.getByTestId("member-login-password").fill(TEST_ADMIN.password);
    await page.getByTestId("member-login-submit").click();
    await expect(page).toHaveURL(/\/members$/, { timeout: budget(15_000) });

    await page.getByTestId("member-nav-posts").click();
    await page.getByTestId("posts-new").click();
    await expect(page).toHaveURL(/\/members\/posts\/\d+/, { timeout: budget(20_000) });

    const opened = page.url().match(/\/members\/posts\/(\d+)/);
    if (!opened) throw new Error(`no post id in ${page.url()}`);
    const postId = Number(opened[1]);
    created.push({ collection: "posts", id: postId });
    recordCreated({ collection: "posts", id: postId, note: "M-POSTVIDEO post" });

    await page.getByTestId("post-title").fill("M-POSTVIDEO 影片文章");
    await page.getByTestId("post-description").fill("M-POSTVIDEO 摘要");
    await page.getByTestId("editor-content").fill("影片在下面。");

    const stamp = Date.now();
    await page.getByTestId("editor-toolbar-video-input").setInputFiles({
      name: `m-postvideo-${stamp}.mp4`,
      mimeType: "video/mp4",
      buffer: MP4_HEADER,
    });

    // The node appears only once the upload has a media id — that ordering is
    // the feature. `data-media-id` is where the id is legible from outside.
    const node = page.getByTestId("editor-upload");
    await expect(node).toBeVisible({ timeout: budget(45_000) });
    const mediaAttr = await node.getAttribute("data-media-id");
    if (!mediaAttr) throw new Error("the inserted node carries no media id");
    const mediaId = Number(mediaAttr);
    created.push({ collection: "media", id: mediaId });
    recordCreated({ collection: "media", id: mediaId, note: "M-POSTVIDEO video" });

    await page.getByTestId("post-save-draft").click();
    await expect(page.getByTestId("post-message")).toHaveText("已儲存草稿", {
      timeout: budget(20_000),
    });

    const saved = await getWithRetry(
      page.request,
      `/api/posts/${postId}?depth=0&draft=true`,
    );
    const body = (await saved.json()) as {
      content?: { root?: { children?: { type?: string; value?: unknown }[] } };
    };
    const uploads = (body.content?.root?.children ?? []).filter(
      (child) => child.type === "upload",
    );
    expect(uploads, "one upload node reached posts.content").toHaveLength(1);
    expect(uploads[0].value).toBe(mediaId);

    const media = await getWithRetry(page.request, `/api/media/${mediaId}?depth=0`);
    const doc = (await media.json()) as { mimeType?: string; usage?: string };
    expect(doc.mimeType).toBe("video/mp4");
    expect(doc.usage).toBe("attachment");
  });
});

import { expect, test } from "../helpers/test";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";
import { deleteCreatedRows } from "../helpers/teardown";

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
 * A video can reach `posts.content` two ways, and neither is exotic: /admin's
 * editor has Payload's unrestricted `UploadFeature`, and
 * `guardPostContent` (src/collections/hooks/guard-content.ts) checks only
 * that the node's `value` is an id, never its mime type — so a member POSTing
 * to /api/posts can do it too. The member *editor* is the only thing that
 * filters, and that is deliberate and unchanged.
 *
 * Built over the API rather than through the editor for exactly that reason:
 * the editor cannot produce this document, and the point is what the reader
 * sees, not how it got there.
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

  test.afterEach(async ({ request }) => {
    const pending = created.splice(0, created.length).reverse();
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
});

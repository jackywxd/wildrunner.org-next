import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "../helpers/test";

import { youTubeVideoId } from "@/lib/youtube";
import {
  TEST_MEMBER,
  adminContext,
  ensureMemberUser,
  loginContext,
} from "../helpers/members";

/**
 * Y — YouTube links rendered as the video on a published post.
 *
 * Public-side only: the member editor still shows the link. Nothing about
 * `posts.content` changes, so an existing post gains the embed with no
 * migration and no edit.
 */

const VIDEO = "dQw4w9WgXcQ";

/** A paragraph holding exactly one text run. */
function paragraph(text: string) {
  return {
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
  };
}

/** A paragraph whose text is wrapped in a link node. */
function linkParagraph(url: string, label: string) {
  return {
    type: "paragraph",
    version: 1,
    direction: "ltr",
    format: "",
    indent: 0,
    textFormat: 0,
    textStyle: "",
    children: [
      {
        type: "link",
        version: 3,
        direction: "ltr",
        format: "",
        indent: 0,
        id: "68000000000000000000000a",
        fields: { linkType: "custom", newTab: false, url },
        children: [
          {
            type: "text",
            version: 1,
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            text: label,
          },
        ],
      },
    ],
  };
}

function document(children: unknown[]) {
  return {
    root: {
      type: "root",
      version: 1,
      direction: "ltr",
      format: "",
      indent: 0,
      children,
    },
  };
}

test.describe("Y YouTube embeds", () => {
  let admin: APIRequestContext;
  let member: APIRequestContext;
  const createdPostIds: number[] = [];

  test.beforeAll(async ({ baseURL }) => {
    admin = await adminContext(baseURL);
    await ensureMemberUser(admin, TEST_MEMBER);
    member = await loginContext(baseURL, TEST_MEMBER);
  });

  test.afterAll(async () => {
    for (const id of createdPostIds) await admin?.delete(`/api/posts/${id}`);
    await Promise.all([admin?.dispose(), member?.dispose()]);
  });

  async function publish(content: unknown) {
    const slug = `y-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const response = await member.post("/api/posts", {
      data: {
        title: `標題 ${slug}`,
        slug,
        description: "Y fixture",
        content,
        _status: "published",
        publishedAt: new Date().toISOString(),
      },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const doc = (await response.json()).doc;
    createdPostIds.push(doc.id);
    return doc as { id: number; slug: string };
  }

  test("Y-T1: the URL shapes a member might paste all resolve to one id", () => {
    // Plain Node, no browser: this is the function the iframe's src is
    // built from, and it is the only thing standing between `posts.content`
    // and an arbitrary third-party origin embedded in our own page.
    for (const url of [
      `https://www.youtube.com/watch?v=${VIDEO}`,
      `https://youtube.com/watch?v=${VIDEO}&t=42s`,
      `https://m.youtube.com/watch?v=${VIDEO}`,
      `https://youtu.be/${VIDEO}`,
      `https://youtu.be/${VIDEO}?t=42`,
      `https://www.youtube.com/embed/${VIDEO}`,
      `https://www.youtube.com/shorts/${VIDEO}`,
      `https://www.youtube-nocookie.com/embed/${VIDEO}`,
      `http://www.youtube.com/watch?v=${VIDEO}`,
    ]) {
      expect(youTubeVideoId(url), url).toBe(VIDEO);
    }
  });

  test("Y-T2: anything that is not a single video is left alone", () => {
    for (const url of [
      "https://vimeo.com/123456789",
      // A look-alike host is the attack this rejects — the id would be
      // valid, the origin would not be YouTube's.
      `https://youtube.com.evil.example/watch?v=${VIDEO}`,
      `https://notyoutube.com/watch?v=${VIDEO}`,
      // A playlist or channel has no single video; embedding "whichever is
      // first" would be inventing the author's intent.
      "https://www.youtube.com/playlist?list=PL1234567890",
      "https://www.youtube.com/@somechannel",
      // Wrong id length, and a javascript: URL for completeness.
      "https://www.youtube.com/watch?v=tooshort",
      `javascript:alert(1)//youtube.com/watch?v=${VIDEO}`,
      "not a url at all",
    ]) {
      expect(youTubeVideoId(url), url).toBeNull();
    }
  });

  test("Y-T3: a pasted URL on its own line becomes the player", async ({
    page,
  }) => {
    // The case that matters for members: the editor has no autolink, so a
    // pasted URL is stored as plain paragraph text.
    const post = await publish(
      document([
        paragraph("影片在下面"),
        paragraph(`https://www.youtube.com/watch?v=${VIDEO}`),
      ]),
    );

    await page.goto(`/posts/${post.slug}?t=${Date.now()}`);
    const embed = page.getByTestId("youtube-embed");
    await expect(embed).toBeVisible();
    await expect(embed).toHaveAttribute("data-video-id", VIDEO);

    const src = await embed.locator("iframe").getAttribute("src");
    // Rebuilt from the id, and on the no-cookie host — never the author's
    // own string handed to an iframe.
    expect(src).toBe(`https://www.youtube-nocookie.com/embed/${VIDEO}`);

    // The surrounding prose is untouched.
    await expect(page.locator("article, main").first()).toContainText(
      "影片在下面",
    );
  });

  test("Y-T4: a link node pointing at a video becomes the player", async ({
    page,
  }) => {
    const post = await publish(
      document([linkParagraph(`https://youtu.be/${VIDEO}`, "看影片")]),
    );

    await page.goto(`/posts/${post.slug}?t=${Date.now()}`);
    await expect(page.getByTestId("youtube-embed")).toHaveAttribute(
      "data-video-id",
      VIDEO,
    );
  });

  test("Y-T5: ordinary paragraphs and links are unchanged", async ({
    page,
  }) => {
    // The overrides sit on `paragraph` and `link`, the two most common node
    // types on the site. Breaking them would break every post, so this is
    // the assertion that matters most in the file.
    const post = await publish(
      document([
        paragraph("一段普通的文字"),
        // A sentence that merely mentions a video keeps its sentence.
        paragraph(`我推薦 https://youtu.be/${VIDEO} 這支`),
        linkParagraph("https://example.com/somewhere", "外部連結"),
      ]),
    );

    await page.goto(`/posts/${post.slug}?t=${Date.now()}`);
    await expect(page.getByTestId("youtube-embed")).toHaveCount(0);

    const body = page.locator("article, main").first();
    await expect(body).toContainText("一段普通的文字");
    await expect(body).toContainText("我推薦");
    await expect(
      body.locator('a[href="https://example.com/somewhere"]'),
    ).toHaveCount(1);
  });
});

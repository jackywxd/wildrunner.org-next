import { expect, test } from "@playwright/test";

import { toSimplifiedPost, toSimplifiedRichText } from "@/lib/i18n/zh-post";
import type { SitePost } from "@/lib/content-types";

/**
 * U-ZHPOST — an article rendered in Simplified is derived, not stored.
 *
 * The failure this exists to catch is not "the conversion is wrong" — OpenCC
 * is covered by U-CONVERT. It is the conversion reaching something that is
 * not prose. A `SitePost` carries the article's words and the article's
 * address in one object, and a converted `slug` is a 404 rather than a
 * translation.
 */

const post: SitePost = {
  id: 1,
  title: "野馬營穿越時光",
  slug: "posts/2024/穿越時光",
  slugAsParams: "2024/穿越時光",
  description: "轉檔完成，請檢視影片",
  published: true,
  featured: false,
  author: "張小明",
  authorSlug: "張小明-zhang",
  image: { src: "/api/media/file/時光.webp", width: 100, height: 100 },
  musicPlaylist: ["dQw4w9WgXcQ"],
};

test.describe("U-ZHPOST an article in Simplified", () => {
  test("U-ZHPOST-1: the words convert", () => {
    const out = toSimplifiedPost(post);
    expect(out.title).toBe("野马营穿越时光");
    // Through the glossary, not just OpenCC: 轉檔 alone becomes 转档, which is
    // not a word — the same entry `zh-Hans.json` is generated with.
    expect(out.description).toBe("转码完成，请检视影片");
    expect(out.author).toBe("张小明");
  });

  test("U-ZHPOST-2: the addresses do not", () => {
    const out = toSimplifiedPost(post);
    // Every one of these is how something is *found*, not how it reads. A
    // converted character here is a broken link, and the article it breaks is
    // the one somebody already shared.
    expect(out.slug).toBe(post.slug);
    expect(out.slugAsParams).toBe(post.slugAsParams);
    expect(out.authorSlug).toBe(post.authorSlug);
    expect(out.image?.src).toBe(post.image?.src);
    expect(out.musicPlaylist).toEqual(post.musicPlaylist);
    expect(out.id).toBe(post.id);
  });

  test("U-ZHPOST-3: a link's words convert and its destination does not", () => {
    const tree = {
      root: {
        type: "root",
        children: [
          {
            type: "link",
            fields: { url: "https://example.com/時光", newTab: true },
            children: [{ type: "text", text: "穿越時光", format: 0 }],
          },
        ],
      },
    };
    const out = toSimplifiedRichText(tree);
    expect(out.root.children[0].fields.url).toBe("https://example.com/時光");
    expect(out.root.children[0].children[0].text).toBe("穿越时光");
    // Structure Lexical needs to render at all.
    expect(out.root.children[0].type).toBe("link");
    expect(out.root.children[0].children[0].format).toBe(0);
  });

  test("U-ZHPOST-4: prose nested where the shape does not predict it", () => {
    // An upload node's caption is its own rich text tree. A walk that only
    // knew about top-level paragraphs would convert the body and leave the
    // caption under the photo in Traditional.
    const tree = {
      root: {
        children: [
          {
            type: "upload",
            relationTo: "media",
            value: 42,
            fields: {
              caption: {
                root: {
                  children: [{ type: "text", text: "轉檔中的影片" }],
                },
              },
            },
          },
        ],
      },
    };
    const out = toSimplifiedRichText(tree);
    expect(out.root.children[0].fields.caption.root.children[0].text).toBe(
      "转码中的影片",
    );
    expect(out.root.children[0].value).toBe(42);
    expect(out.root.children[0].relationTo).toBe("media");
  });

  test("U-ZHPOST-5: the input is not mutated", () => {
    // The caller holds the Traditional post — `/print` renders it, and the
    // detail page reads it for its own metadata. A transform that converted
    // in place would change the article under them.
    const before = JSON.stringify(post);
    toSimplifiedPost(post);
    expect(JSON.stringify(post)).toBe(before);
  });
});

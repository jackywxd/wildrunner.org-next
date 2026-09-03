/**
 * The three-step social-card chain: cover image, first body picture,
 * generated card.
 *
 * Pure functions over a Lexical tree, so this is the cheapest level that can
 * see every failure below — no browser, no database, no network. The one
 * thing it deliberately does not assert is what the generated card *looks
 * like*; that was checked by rendering it and looking at the PNG, and a
 * pixel assertion here would only break on every design tweak.
 *
 * `@playwright/test` rather than `../helpers/test`: nothing here touches
 * `page`, and the console-guard fixture in that helper depends on it, so
 * importing it would launch a browser for nothing.
 */
import { expect, test } from "@playwright/test";

import {
  absoluteImageUrl,
  firstContentImageSrc,
  resolvePostOgCard,
} from "@/lib/postOg";
import type { Post } from "@/payload-types";

const BASE = "https://wildrunner.org";

/** An upload node as `depth: 1` hands it over: `value` fully populated. */
function upload(media: {
  url: string;
  mimeType?: string | null;
}): Record<string, unknown> {
  return {
    type: "upload",
    relationTo: "media",
    version: 3,
    value: { id: 1, mimeType: media.mimeType ?? "image/webp", url: media.url },
  };
}

function para(text: string): Record<string, unknown> {
  return {
    type: "paragraph",
    version: 1,
    children: [{ type: "text", text, version: 1 }],
  };
}

function body(nodes: Record<string, unknown>[]): Post["content"] {
  return { root: { type: "root", version: 1, children: nodes } } as never;
}

const POST = {
  author: "追雲逐雪",
  content: undefined as Post["content"] | undefined,
  image: undefined as { src: string; width: number; height: number } | undefined,
  slug: "posts/2026/a-post",
  title: "測試文章",
};

test.describe("U-POSTOG a post's social card", () => {
  test("U-POSTOG-1: the cover image wins over everything in the body", () => {
    // Protects against: a post that HAS a chosen cover silently losing it to
    // whatever picture happens to sit first in the article.
    const card = resolvePostOgCard({
      ...POST,
      content: body([upload({ url: "https://images.wildrunner.org/body.webp" })]),
      image: {
        height: 800,
        src: "https://images.wildrunner.org/cover.webp",
        width: 1200,
      },
    });
    expect(card).toEqual({
      kind: "photo",
      src: "https://images.wildrunner.org/cover.webp",
    });
  });

  test("U-POSTOG-2: with no cover, the first body picture is used", () => {
    // Protects against: the whole reason this exists — every member-written
    // post falling to a generated card while full of photographs, because
    // the editor never exposed the cover field.
    const card = resolvePostOgCard({
      ...POST,
      content: body([
        para("前言"),
        upload({ url: "https://images.wildrunner.org/first.webp" }),
        upload({ url: "https://images.wildrunner.org/second.webp" }),
      ]),
    });
    expect(card).toEqual({
      kind: "photo",
      src: "https://images.wildrunner.org/first.webp",
    });
  });

  test("U-POSTOG-3: 'first' is document order, including nested pictures", () => {
    // Protects against: a walk that scans top-level children only, or one
    // that reverses order via a naive stack — both would pick the wrong
    // picture on any post whose first image sits inside a quote or a list.
    const nested = {
      type: "quote",
      version: 1,
      children: [upload({ url: "https://images.wildrunner.org/nested.webp" })],
    };
    expect(
      firstContentImageSrc(
        body([para("前言"), nested, upload({ url: "https://images.wildrunner.org/later.webp" })]),
      ),
    ).toBe("https://images.wildrunner.org/nested.webp");
  });

  test("U-POSTOG-4: a video is skipped and the next real image is used", () => {
    // Protects against: handing a crawler an mp4 as og:image, which renders
    // as a broken card rather than a video. `media` holds 23 videos as of
    // 2026-08-18 and a member can embed one anywhere.
    expect(
      firstContentImageSrc(
        body([
          upload({ mimeType: "video/mp4", url: "https://images.wildrunner.org/clip.mp4" }),
          upload({ url: "https://images.wildrunner.org/photo.webp" }),
        ]),
      ),
    ).toBe("https://images.wildrunner.org/photo.webp");
  });

  test("U-POSTOG-5: an upload whose media did not populate is skipped, not used", () => {
    // Protects against: reading a bare id (what depth 0 would give) as if it
    // were a document, which would produce "og:image=3" or a crash rather
    // than falling through to the next candidate.
    const bare = { type: "upload", relationTo: "media", value: 3, version: 3 };
    expect(
      firstContentImageSrc(
        body([bare, upload({ url: "https://images.wildrunner.org/real.webp" })]),
      ),
    ).toBe("https://images.wildrunner.org/real.webp");
  });

  test("U-POSTOG-6: a post with no picture at all falls to the seeded card", () => {
    // THE SEED IS THE SLUG, NOT THE TITLE: a retitled post has to keep the
    // card it was already shared with.
    //
    // What this no longer asserts is the `/og` query, because the resolver no
    // longer builds one — it returns the decision and `pageMetadata` turns it
    // into a URL. The query's own guarantees (a subtitle on every card, so the
    // route never splits a title on `|`) moved to `X-OG-2`, which reads them
    // off the HTML the site really serves.
    expect(
      resolvePostOgCard({ ...POST, content: body([para("只有文字")]) }),
    ).toEqual({ kind: "rainbow", seed: "posts/2026/a-post" });
  });

  test("U-POSTOG-7: a same-origin path is absolutised, a CDN url is left alone", () => {
    // Protects against: emitting `og:image=/api/media/file/x.webp`. A crawler
    // has no page context to resolve a path against, so the card silently
    // shows nothing. `mediaImageSrc` strips our own origin, so this case is
    // reached by every image uploaded through the member editor.
    expect(absoluteImageUrl("/api/media/file/x.webp", BASE)).toBe(
      "https://wildrunner.org/api/media/file/x.webp",
    );
    expect(absoluteImageUrl("https://images.wildrunner.org/x.webp", BASE)).toBe(
      "https://images.wildrunner.org/x.webp",
    );
  });

  test("U-POSTOG-8: an absent body is not an error, just a generated card", () => {
    // Card queries leave `content` undefined by design (POST_CARD_SELECT),
    // so the chain has to tolerate it rather than throw.
    expect(firstContentImageSrc(undefined)).toBeUndefined();
    expect(resolvePostOgCard({ ...POST }).kind).toBe("rainbow");
  });
});

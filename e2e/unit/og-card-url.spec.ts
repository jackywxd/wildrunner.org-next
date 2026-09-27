import { expect, test } from "@playwright/test";

import { pageMetadata } from "@/lib/site-metadata";

/**
 * U-OGCARD — which picture a shared link draws, and what it is titled.
 *
 * Three decisions `pageMetadata` makes and nothing on screen shows: 穿越時光's
 * card is the trail map's own route, a member's avatar travels to the card
 * as an absolute URL (`/og` refuses anything else, silently — see
 * `cardUrl`), and a post's shared title is signed by its author while its tab
 * title is not. `X-OG` renders every card the corpus reaches; this pins the
 * branches the corpus does not have — no seeded member has an avatar.
 */

const images = (meta: ReturnType<typeof pageMetadata>) =>
  (meta.openGraph?.images as { url: string }[])[0].url;

test.describe("U-OGCARD share cards", () => {
  test("U-OGCARD-T1: 穿越時光 is drawn by /og/timeline, with its title and byline", () => {
    const url = new URL(
      images(pageMetadata({ path: "/riders/timeline", title: "穿越時光", subtitle: "每一場", card: { kind: "trail-map" } })),
    );
    expect(url.pathname).toBe("/og/timeline");
    expect(url.searchParams.get("title")).toBe("穿越時光");
    expect(url.searchParams.get("subtitle")).toBe("每一場");
  });

  test("U-OGCARD-T2: a member's avatar reaches the card as an absolute URL, and only when set", () => {
    const withAvatar = new URL(
      images(
        pageMetadata({
          path: "/riders/a",
          title: "A",
          subtitle: "a",
          card: { kind: "rainbow", seed: "a", avatar: "/api/media/file/a.webp" },
        }),
      ),
    );
    expect(withAvatar.pathname).toBe("/og");
    expect(withAvatar.searchParams.get("avatar")).toMatch(/^https:\/\/[^/]+\/api\/media\/file\/a\.webp$/);

    const without = new URL(
      images(pageMetadata({ path: "/riders/b", title: "B", subtitle: "b", card: { kind: "rainbow", seed: "b" } })),
    );
    expect(without.searchParams.has("avatar")).toBe(false);
  });

  test("U-OGCARD-T3: a post is shared as 「標題｜作者」, in the page's script, and its tab is not", () => {
    const meta = pageMetadata({
      path: "/posts/x",
      title: "越野跑",
      subtitle: "一篇文章",
      card: { kind: "plain" },
      type: "article",
      author: "追雲逐雪",
      locale: "zh-hans",
    });
    expect(meta.openGraph?.title).toBe("越野跑｜追云逐雪");
    expect((meta.twitter as { title?: string }).title).toBe("越野跑｜追云逐雪");
    expect(meta.title).toBe("越野跑");
    // The card's own headline stays the title alone; the byline under it is
    // the post's summary.
    expect(new URL(images(meta)).searchParams.get("title")).toBe("越野跑");

    const unsigned = pageMetadata({ path: "/posts/y", title: "無名", subtitle: "s", card: { kind: "plain" } });
    expect(unsigned.openGraph?.title).toBe("無名");
  });
});

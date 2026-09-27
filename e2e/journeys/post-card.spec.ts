import { expect, test } from "../helpers/test";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";
import { TEST_MEMBER, adminContext, loginContext } from "../helpers/members";
import { deleteCreatedRows } from "../helpers/teardown";

/**
 * P-CARD — an article, as a card on /posts and as a link shared elsewhere,
 * says who wrote it.
 *
 * TWO POSTS BY ONE MEMBER, one with a summary far longer than a card holds
 * and one with a single line. They are the instrument: every card on the page
 * must be the same height whichever it is, the long summary must end in 「…」
 * rather than push the date and byline out of the card, and both must still
 * be signed. A corpus of ordinary summaries would pass all of that with no
 * fixed height and no clamp at all, so this makes its own.
 *
 * The shared title is read off the served HTML, not a function's return
 * value: the crawler that draws a chat preview reads nothing else.
 */

/** The smallest body a post may be published with: one paragraph. */
const BODY = {
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
        children: [{ type: "text", text: "內文", format: 0, style: "", mode: "normal", detail: 0, version: 1 }],
      },
    ],
  },
};

const LONG =
  "這是一段刻意寫得很長的簡介，" + "用來確認卡片的高度不會被它撐開，".repeat(24) + "最後一句。";

test.describe("P-CARD an article card is signed and one height", () => {
  test("P-CARD-T1: the byline sits under the date in bold, and a long summary is cut short", async ({
    baseURL,
    page,
  }) => {
    test.setTimeout(budget(60_000));

    const member = await loginContext(baseURL, TEST_MEMBER);
    const me = await member.get("/api/users/me?depth=1");
    const author = ((await me.json()) as { user?: { author?: { id: number; name: string } } }).user
      ?.author;
    await member.dispose();
    expect(author?.name, "the test member has no byline").toBeTruthy();

    const admin = await adminContext(baseURL);
    const created: { collection: string; id: number }[] = [];
    try {
      const stamp = Date.now();
      const slugs: string[] = [];
      const titles: string[] = [];
      for (const [label, description] of [
        ["long", LONG],
        ["short", "一句話。"],
      ] as const) {
        const post = await admin.post("/api/posts", {
          data: {
            _status: "published",
            author: author!.id,
            content: BODY,
            description,
            slug: `p-card-${label}-${stamp}`,
            title: `P-CARD ${label} ${stamp}`,
          },
        });
        expect(post.ok(), await post.text()).toBeTruthy();
        const doc = ((await post.json()) as { doc: { id: number; slug: string; title: string } }).doc;
        created.push({ collection: "posts", id: doc.id });
        recordCreated({ collection: "posts", id: doc.id, note: `P-CARD ${label}` });
        slugs.push(doc.slug.replace(/^posts\//, ""));
        titles.push(doc.title);
      }

      // The link a chat preview draws: 「標題｜作者」, while the tab keeps the
      // subject alone and the layout's 「｜野馬營」 after it.
      const html = await (await admin.get(`/posts/${slugs[1]}`)).text();
      expect(html).toContain(`property="og:title" content="${titles[1]}｜${author!.name}"`);
      expect(html).toContain(`name="twitter:title" content="${titles[1]}｜${author!.name}"`);
      expect(html).not.toContain(`<title>${titles[1]}｜${author!.name}`);

      // A phone's width, one card to a row. Side by side, a grid row stretches
      // its cards to the taller one's height whether or not they have one of
      // their own — which is how the first version of this passed without it.
      await page.setViewportSize({ height: 844, width: 390 });
      await page.goto("/posts", { waitUntil: "domcontentloaded" });
      const cards = slugs.map((slug) => page.locator(`[data-post-slug$="${slug}"]`));
      await expect(cards[0]).toBeVisible({ timeout: budget(15_000) });

      const boxes = await Promise.all(cards.map((card) => card.boundingBox()));
      expect(boxes[0]!.height, "a long summary made its card taller").toBe(boxes[1]!.height);

      for (const card of cards) {
        const byline = card.getByTestId("post-card-author");
        await expect(byline).toHaveText(author!.name);
        await expect(byline).toHaveCSS("font-weight", "700");

        const [date, name, frame] = await Promise.all([
          card.locator("p.text-sm").boundingBox(),
          byline.boundingBox(),
          card.boundingBox(),
        ]);
        expect(name!.y, "the byline is not under the date").toBeGreaterThan(date!.y + date!.height - 1);
        expect(name!.y + name!.height, "the byline was pushed out of the card").toBeLessThanOrEqual(
          frame!.y + frame!.height,
        );
      }

      // Cut short, not cut off: the summary ends in an ellipsis because it is
      // clamped, which leaves text it did not show.
      const summary = cards[0].locator("p", { hasText: "這是一段刻意寫得很長的簡介" });
      expect(
        await summary.evaluate((node) => node.scrollHeight > node.clientHeight),
        "the long summary is shown whole",
      ).toBe(true);
    } finally {
      await deleteCreatedRows(admin, created);
      await admin.dispose();
    }
  });
});

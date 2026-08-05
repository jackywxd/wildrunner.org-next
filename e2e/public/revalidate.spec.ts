import { expect, test } from "../helpers/test";

import { ensureAdminUser } from "../helpers/auth";
import { expectOkJson } from "../helpers/api";
import { lexicalParagraph } from "@/lib/lexical-helpers";

test.describe("P2 public content and revalidation", () => {
  test("P2-T2/T7: published posts appear on list and home after publish", async ({
    request,
    page,
  }) => {
    await ensureAdminUser(request);
    const slug = `p2-list-${Date.now()}`;
    const title = `P2 List ${slug}`;

    const created = await expectOkJson(
      await request.post("/api/posts", {
        data: {
          title,
          slug,
          description: "list visibility",
          content: lexicalParagraph("published list body"),
          _status: "draft",
        },
      }),
    );
    const id = created.doc?.id ?? created.id;

    await page.goto("/posts");
    await expect(page.getByText(title)).toHaveCount(0);

    await request.patch(`/api/posts/${id}`, {
      data: {
        _status: "published",
        publishedAt: new Date().toISOString(),
      },
    });

    await expect
      .poll(
        async () => {
          // Unique query per poll: same reason as posts.spec.ts — the
          // browser would otherwise replay its cached pre-publish copy.
          await page.goto(`/posts?poll=${Date.now()}`);
          return page.getByText(title).count();
        },
        { timeout: 15_000 },
      )
      .toBe(1);

    await expect
      .poll(
        async () => {
          await page.goto(`/?poll=${Date.now()}`);
          return page.getByText(title).count();
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);
  });
});

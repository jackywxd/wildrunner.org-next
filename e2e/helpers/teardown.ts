import type { APIRequestContext, Page } from "@playwright/test";

import { TEST_ADMIN } from "./auth";

/**
 * Leave the post editor before API teardown.
 *
 * Run 33535522253 (PR #110 staging deploy): M-SUMMARY-T1's assertions all
 * passed, then afterEach's DELETE failed while the browser was still on
 * `/members/posts/<id>`. Same shape as M-AIIMPROVE's ECONNRESET on delete —
 * the fixture row is gone or the Worker is mid-request when teardown races
 * the page the test just left mounted.
 */
export async function leavePostEditor(page: Page): Promise<void> {
  if (!page.url().includes("/members/posts/")) return;
  await page.goto("/members/posts", { waitUntil: "domcontentloaded" });
}

export async function deleteCreatedRows(
  request: APIRequestContext,
  pending: { collection: string; id: number }[],
): Promise<void> {
  if (pending.length === 0) return;

  await request.post("/api/users/login", {
    data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
  });

  for (const row of pending) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const deleted = await request.delete(`/api/${row.collection}/${row.id}`);
      if (deleted.ok() || deleted.status() === 404) break;
      if (attempt === 3) {
        const body = (await deleted.text()).slice(0, 200);
        throw new Error(
          `teardown failed to delete ${row.collection}/${row.id}: ${deleted.status()} ${body}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
}

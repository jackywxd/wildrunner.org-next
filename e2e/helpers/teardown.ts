import type { APIRequestContext, Page } from "@playwright/test";

import { TEST_ADMIN } from "./auth";
import { withTransportRetry } from "./request";

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

/**
 * Sign the teardown context in, and refuse to continue if it did not work.
 *
 * The response used to be discarded. That is what made the failure in the
 * #116 staging deploy unreadable: `deleteCreatedRows` carried on with an
 * unauthenticated context, and what got reported was
 * `teardown failed to delete posts/18: 403 您沒有執行此操作的權限。` — a
 * permission error about the row, when nothing was wrong with the row and
 * the sign-in was the thing that had failed. `Posts.access.delete` is
 * `isOwner`, whose only `false` branch is `if (!user)`, so a 403 there means
 * "nobody is signed in" and never "signed in as the wrong person".
 *
 * beforeEach in every spec already asserts its own login with
 * `expect(login.ok())`. Teardown was the one path that did not.
 */
async function signIn(request: APIRequestContext): Promise<void> {
  const login = await withTransportRetry("/api/users/login", () =>
    request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    }),
  );
  if (!login.ok()) {
    const body = (await login.text()).slice(0, 200);
    throw new Error(
      `teardown could not sign in as ${TEST_ADMIN.email}: ${login.status()} ${body}`,
    );
  }
}

export async function deleteCreatedRows(
  request: APIRequestContext,
  pending: { collection: string; id: number | string }[],
): Promise<void> {
  if (pending.length === 0) return;

  await signIn(request);

  for (const row of pending) {
    const path = `/api/${row.collection}/${row.id}`;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const deleted = await withTransportRetry(path, () => request.delete(path));
        if (deleted.ok() || deleted.status() === 404) break;
        if (attempt === 3) {
          const body = (await deleted.text()).slice(0, 200);
          throw new Error(
            `teardown failed to delete ${row.collection}/${row.id}: ${deleted.status()} ${body}`,
          );
        }
        // The retry used to re-send the same request from the same context,
        // so a lost session produced three identical 403s and then threw. A
        // repeat cannot change a genuine permission answer — this context
        // created the row it is deleting — so the only thing worth changing
        // between attempts is the session, and that is what these two codes
        // mean. Payload validates the JWT's `sid` against `users.sessions` on
        // every request (auth/strategies/jwt.js), and `addSessionToUser`
        // rewrites that whole array on each login, so a session this context
        // still holds can stop existing while the run is in progress.
        //
        // Deliberately not a blanket re-login before every delete: each one
        // appends another row to `users_sessions`, and that table growing on
        // the shared staging account is the leading suspect for the session
        // going missing in the first place.
        if (deleted.status() === 401 || deleted.status() === 403) {
          await signIn(request);
        }
      } catch (error) {
        if (attempt === 3) throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
}

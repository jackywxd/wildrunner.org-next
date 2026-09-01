import type { APIRequestContext, APIResponse } from "@playwright/test";

/**
 * GET with a short retry loop.
 *
 * PR #112 CI shard 2: M-COVER-T1's save succeeded, then
 * `page.request.get('/api/posts/…')` died with ECONNRESET — the dev server
 * dropping a connection under parallel shard load, not a wrong answer.
 */
export async function getWithRetry(
  request: APIRequestContext,
  url: string,
): Promise<APIResponse> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await request.get(url);
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  throw new Error(`getWithRetry: unreachable (${url})`);
}

import type { APIRequestContext, APIResponse } from "@playwright/test";

/**
 * Retry when Playwright's transport dies before a response arrives.
 *
 * PR #112 CI shard 2: M-COVER-T1's save succeeded, then
 * `page.request.get('/api/posts/…')` died with ECONNRESET — the dev server
 * dropping a connection under parallel shard load, not a wrong answer.
 * Staging deploy run after #112 merge: V-RACEALBUM-T1's assertions passed,
 * then teardown's `request.post('/api/users/login')` hit the same shape.
 */
export async function withTransportRetry<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  throw new Error(`withTransportRetry: unreachable (${label})`);
}

export async function getWithRetry(
  request: APIRequestContext,
  url: string,
): Promise<APIResponse> {
  return withTransportRetry(url, () => request.get(url));
}

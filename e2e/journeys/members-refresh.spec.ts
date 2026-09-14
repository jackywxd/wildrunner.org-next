import { request as playwrightRequest } from "@playwright/test";

import { apiTest as test, expect } from "../helpers/api-test";
import { TEST_ADMIN } from "../helpers/auth";
import { recordCreated } from "../helpers/created";
import { deleteCreatedRows } from "../helpers/teardown";

/**
 * M-REFRESH — reloading the post you are editing leaves you on it.
 *
 * A member wrote for a while, left the tab, came back, refreshed, and landed
 * on `/members/login` — which then found their session perfectly alive and
 * sent them to `/members`, with the article they had open nowhere in sight.
 *
 * The session was never the problem. `payload.auth()` resolves the cookie
 * through `extractJWT`, which — with a non-empty `config.csrf`, and this
 * project cannot have an empty one (sanitize.js pushes `serverURL`, which
 * payload.config.ts must set for media URLs) — judges any request carrying no
 * `Origin` by its `Sec-Fetch-Site` alone. A top-level navigation is exactly
 * that request: browsers send `Origin` on `fetch` and not on navigations.
 * Measured against the dev server with one real session cookie:
 *
 *   no Origin, no Sec-Fetch-Site            307 → /members/login
 *   no Origin, Sec-Fetch-Site: cross-site   307 → /members/login
 *   no Origin, Sec-Fetch-Site: none         200
 *
 * **This is not a browser test, and the first draft of it was.** That draft
 * set `Sec-Fetch-Site` with `page.setExtraHTTPHeaders` and passed against the
 * unfixed code — Chromium will not let a `Sec-` header be overridden, so the
 * navigation still sent `none`, the third row above, and the spec measured
 * nothing while reporting success. Only a non-browser client can put a
 * request into the shape that broke, which is why this drives the server
 * directly and asserts on the status rather than on a rendered editor.
 *
 * The `request` fixture cannot be used for it either: it sends `Origin` on
 * every call by design (helpers/request.ts — "Payload silently authenticates
 * as nobody without it"). Both tests below build their own bare context.
 */

const WRITTEN = "刷新之後這段字要還在";

/** A context that sends only what it is told to — no Origin of its own. */
async function navigationContext(baseURL: string | undefined) {
  return playwrightRequest.newContext({ baseURL });
}

test.describe("M-REFRESH a member reloads the post they are editing", () => {
  // playwright.config.ts puts `Origin` on every request in the suite, and its
  // comment says why: APIRequestContext sends neither Origin nor
  // Sec-Fetch-Site, so without it every API call authenticates as nobody.
  // That header is exactly what this spec must NOT have — a navigation does
  // not carry one, and the bug is what Payload does when it is missing. The
  // fixture context sets its own (helpers/api-test.ts), so setup still signs
  // in; only the contexts built below are left bare.
  test.use({ extraHTTPHeaders: {} });

  const created: { collection: string; id: number }[] = [];
  let postId = 0;
  let cookie = "";

  test.beforeEach(async ({ request, baseURL }) => {
    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    // The session as a browser would carry it on a navigation: the cookie,
    // and nothing else.
    const state = await request.storageState();
    const token = state.cookies.find((c) => c.name === "payload-token");
    expect(token, "signing in left no payload-token cookie to test with").toBeTruthy();
    cookie = `${token!.name}=${token!.value}`;
    void baseURL;

    const stamp = Date.now();
    const post = await request.post("/api/posts?draft=true", {
      data: {
        title: `刷新測試 ${stamp}`,
        slug: `m-refresh-${stamp}`,
        description: "刷新測試",
        _status: "draft",
        content: {
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
                children: [
                  {
                    type: "text",
                    text: WRITTEN,
                    format: 0,
                    style: "",
                    mode: "normal",
                    detail: 0,
                    version: 1,
                  },
                ],
              },
            ],
          },
        },
      },
    });
    expect(post.ok(), `post create failed: ${post.status()}`).toBeTruthy();
    postId = (await post.json()).doc.id as number;
    created.push({ collection: "posts", id: postId });
    recordCreated({ collection: "posts", id: postId, note: "M-REFRESH probe post" });
  });

  test.afterEach(async ({ request }) => {
    await deleteCreatedRows(request, created.splice(0, created.length).reverse());
  });

  test("M-REFRESH-T1: a live session survives a navigation Payload cannot vouch for by fetch metadata", async ({
    baseURL,
  }) => {
    const context = await navigationContext(baseURL);
    try {
      // Both shapes a real reload can take. `cross-site` is what the login
      // page's own comment records from a mail-client link; the absent
      // header is what a browser without fetch metadata sends. Before the
      // fix both answered 307 to /members/login with this exact cookie.
      const shapes: { what: string; headers: Record<string, string> }[] = [
        { what: "no Sec-Fetch-Site at all", headers: { Cookie: cookie } },
        {
          what: "Sec-Fetch-Site: cross-site",
          headers: { Cookie: cookie, "Sec-Fetch-Site": "cross-site" },
        },
      ];

      for (const { what, headers } of shapes) {
        const response = await context.get(`/members/posts/${postId}`, {
          headers,
          maxRedirects: 0,
        });

        expect(response.status(), `signed out on a reload with ${what}`).toBe(200);
        // The post itself, not just any page: a 200 that rendered the wrong
        // article would satisfy the status on its own.
        expect(await response.text()).toContain(WRITTEN);
      }
    } finally {
      await context.dispose();
    }
  });

  test("M-REFRESH-T2: a request that names someone else's origin is still turned away", async ({
    baseURL,
  }) => {
    const context = await navigationContext(baseURL);
    try {
      // The fix fills in a missing Origin; it must never speak over one that
      // is present, or Payload's allowlist stops being a check at all. This
      // is the assertion that stops that from becoming a tidy one-liner.
      const response = await context.get(`/members/posts/${postId}`, {
        headers: { Cookie: cookie, Origin: "https://evil.example" },
        maxRedirects: 0,
      });

      expect(response.status()).toBe(307);
      expect(response.headers()["location"]).toContain("/members/login");
    } finally {
      await context.dispose();
    }
  });
});

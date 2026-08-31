import { expect, request as playwrightRequest, test } from "@playwright/test";

import { TEST_ADMIN } from "../helpers/auth";
import { recordCreated } from "../helpers/created";

/**
 * M-PRIVATE — a file its owner marked "not on the photo wall" is not served
 * to an anonymous caller.
 *
 * Written after a security review of the branch that added the control. The
 * checkbox was landing with no server-side boundary behind it at all: `usage`
 * was consumed only by the queries in src/lib/content.ts, which decide what
 * the site *draws*, and nothing decided what the REST API *serves*. Media's
 * read rule returned `true` for any anonymous caller, so
 * `GET /api/media?where[usage][equals]=private` came back with the whole row —
 * `url` and `filename` included — and the object then downloaded from the
 * public R2 origin. Reproduced against a running server before the fix.
 *
 * Imports `test` from `@playwright/test`, not ../helpers/test: this asserts
 * about API responses and never opens a page, so the console-error fixture
 * would launch a browser for nothing.
 *
 * WHAT THIS DOES NOT CLAIM. It does not prove the file is private. R2 is
 * served from a public origin with no signing, so anyone who already holds the
 * object URL can still fetch the bytes; closing that means serving these files
 * through an authenticated route, which is separate work. What is pinned here
 * is narrower and is the part the member-facing copy now promises: the API
 * does not hand the URL out.
 */
test.describe("M-PRIVATE a private file is not served anonymously", () => {
  let mediaId: number | null = null;

  test.afterEach(async ({ request }) => {
    if (mediaId === null) return;
    const id = mediaId;
    mediaId = null;
    await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    await request.delete(`/api/media/${id}`);
  });

  test("M-PRIVATE-T1: anonymous cannot read it; its owner still can", async ({
    baseURL,
    request,
  }) => {
    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const stamp = Date.now();
    const created = await request.post("/api/media", {
      multipart: {
        file: {
          name: `m-private-${stamp}.svg`,
          mimeType: "image/svg+xml",
          buffer: Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"></svg>',
          ),
        },
        _payload: JSON.stringify({ alt: `M-PRIVATE ${stamp}`, usage: "private" }),
      },
    });
    expect(created.ok(), `media create failed: ${created.status()}`).toBeTruthy();
    const doc = (await created.json()).doc as { id: number; usage: string };
    mediaId = doc.id;
    recordCreated({ collection: "media", id: doc.id, note: "M-PRIVATE probe" });
    expect(doc.usage).toBe("private");

    // A separate context with no cookies — the `request` fixture above is
    // signed in, and reusing it would prove nothing about an anonymous caller.
    const anon = await playwrightRequest.newContext({ baseURL });
    try {
      // The exact request the review used. A filtered list is the cheap way to
      // enumerate, so it is what gets pinned.
      const listed = await anon.get(
        "/api/media?where[usage][equals]=private&depth=0&limit=100",
      );
      expect(listed.ok()).toBeTruthy();
      const body = (await listed.json()) as { docs: { id: number }[] };
      expect(
        body.docs.map((row) => row.id),
        "an anonymous caller must not be able to enumerate private media",
      ).not.toContain(doc.id);

      // And not by id either, which is the obvious way round a list filter.
      expect((await anon.get(`/api/media/${doc.id}`)).status()).toBe(404);
    } finally {
      await anon.dispose();
    }

    // The other half: narrowing anonymous reads must not lock the owner out of
    // their own library, which is where they go to change their mind.
    const own = await request.get(`/api/media/${doc.id}?depth=0`);
    expect(own.status()).toBe(200);
    expect(((await own.json()) as { usage: string }).usage).toBe("private");
  });
});

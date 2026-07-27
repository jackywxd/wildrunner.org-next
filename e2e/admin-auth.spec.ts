import { test, expect } from "@playwright/test";
import {
  TEST_ADMIN,
  ensureAdminUser,
  lexicalParagraph,
} from "./helpers/auth";

test.describe("P1 admin auth and posts", () => {
  test("P1-T1: admin can login via API", async ({ request }) => {
    const response = await ensureAdminUser(request);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.user?.email).toBe(TEST_ADMIN.email);
  });

  test("P1-T2: wrong password fails", async ({ request }) => {
    await ensureAdminUser(request);
    const response = await request.post("/api/users/login", {
      data: {
        email: TEST_ADMIN.email,
        password: "definitely-wrong-password",
      },
    });
    expect(response.ok()).toBeFalsy();
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test("P1-T3/T4: draft hidden publicly, published visible via API", async ({
    request,
  }) => {
    await ensureAdminUser(request);

    const slug = `p1-draft-${Date.now()}`;
    const createDraft = await request.post("/api/posts", {
      data: {
        title: "Phase1 Draft Post",
        slug,
        description: "draft description",
        content: lexicalParagraph("draft body"),
        _status: "draft",
      },
    });
    expect(
      createDraft.ok(),
      `create draft failed: ${createDraft.status()} ${await createDraft.text()}`,
    ).toBeTruthy();
    const draftDoc = await createDraft.json();
    const id = draftDoc.doc?.id ?? draftDoc.id;
    expect(id).toBeTruthy();

    const publicList = await request.get(
      "/api/posts?where[_status][equals]=published&limit=100",
    );
    expect(publicList.ok()).toBeTruthy();
    const publicBody = await publicList.json();
    const foundPublished = (publicBody.docs ?? []).some(
      (doc: { slug?: string }) => doc.slug === slug,
    );
    expect(foundPublished).toBeFalsy();

    const publish = await request.patch(`/api/posts/${id}`, {
      data: {
        _status: "published",
        publishedAt: new Date().toISOString(),
      },
    });
    expect(
      publish.ok(),
      `publish failed: ${publish.status()} ${await publish.text()}`,
    ).toBeTruthy();

    const publishedList = await request.get(
      `/api/posts?where[slug][equals]=${encodeURIComponent(slug)}`,
    );
    expect(publishedList.ok()).toBeTruthy();
    const publishedBody = await publishedList.json();
    expect(publishedBody.docs?.length).toBeGreaterThanOrEqual(1);
    expect(publishedBody.docs[0]._status).toBe("published");
  });

  test("P1-T8: unauthenticated cannot create media", async ({ request }) => {
    // Fresh context without cookies — use a new request context by clearing storage
    const response = await request.post("/api/media", {
      multipart: {
        file: {
          name: "x.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("nope"),
        },
        alt: "blocked",
      },
    });
    // Without auth cookie this should fail; if prior test left cookies, logout first
    if (response.ok()) {
      await request.post("/api/users/logout");
      const retry = await request.post("/api/media", {
        multipart: {
          file: {
            name: "x.txt",
            mimeType: "text/plain",
            buffer: Buffer.from("nope"),
          },
          alt: "blocked",
        },
      });
      expect(retry.status()).toBeGreaterThanOrEqual(400);
    } else {
      expect(response.status()).toBeGreaterThanOrEqual(400);
    }
  });
});

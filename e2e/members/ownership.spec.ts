import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "@playwright/test";

import { lexicalParagraph } from "@/lib/lexical-helpers";
import {
  TEST_MEMBER,
  adminContext,
  anonContext,
  ensureMemberUser,
  getAdminUser,
  loginContext,
} from "../helpers/members";

/**
 * M1 — content ownership.
 *
 * Members may create freely but may only modify what they own, and other
 * members' drafts must stay invisible to them.
 */
test.describe("M1 content ownership", () => {
  const stamp = Date.now();
  let admin: APIRequestContext;
  let member: APIRequestContext;
  let anon: APIRequestContext;
  let adminUserId: number;
  let memberUserId: number;

  const adminDraftSlug = `m1-admin-draft-${stamp}`;
  const adminPublishedSlug = `m1-admin-published-${stamp}`;
  const memberDraftSlug = `m1-member-draft-${stamp}`;

  let adminDraftId: number;
  let adminMediaId: number;
  const createdPostIds: number[] = [];

  async function createPost(
    context: APIRequestContext,
    slug: string,
    status: "draft" | "published",
    extra: Record<string, unknown> = {},
  ) {
    const response = await context.post("/api/posts", {
      data: {
        title: slug,
        slug,
        description: `${slug} description`,
        content: lexicalParagraph(`${slug} body`),
        _status: status,
        ...extra,
      },
    });
    expect(
      response.ok(),
      `create ${slug} failed: ${response.status()} ${await response.text()}`,
    ).toBeTruthy();
    const body = await response.json();
    const doc = body.doc ?? body;
    createdPostIds.push(doc.id);
    return doc;
  }

  /** Owner comes back populated at default depth; normalise to an id. */
  const ownerId = (doc: { owner?: number | { id: number } | null }) =>
    typeof doc.owner === "object" && doc.owner !== null ? doc.owner.id : doc.owner;

  test.beforeAll(async ({ baseURL }) => {
    admin = await adminContext(baseURL);
    anon = await anonContext(baseURL);
    adminUserId = (await getAdminUser(admin)).id;
    memberUserId = (await ensureMemberUser(admin)).id;
    member = await loginContext(baseURL, TEST_MEMBER);

    adminDraftId = (await createPost(admin, adminDraftSlug, "draft")).id;
    await createPost(admin, adminPublishedSlug, "published");

    const upload = await admin.post("/api/media", {
      multipart: {
        file: {
          name: `m1-owned-${stamp}.txt`,
          mimeType: "image/png",
          // 1x1 transparent PNG
          buffer: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
            "base64",
          ),
        },
        _payload: JSON.stringify({ alt: `m1 owned ${stamp}` }),
      },
    });
    expect(
      upload.ok(),
      `media upload failed: ${upload.status()} ${await upload.text()}`,
    ).toBeTruthy();
    const uploadBody = await upload.json();
    adminMediaId = (uploadBody.doc ?? uploadBody).id;
  });

  test.afterAll(async () => {
    // These run against the shared staging D1/R2 — clean up after ourselves.
    for (const id of createdPostIds) {
      await admin?.delete(`/api/posts/${id}`);
    }
    if (adminMediaId) await admin?.delete(`/api/media/${adminMediaId}`);
    await Promise.all([admin?.dispose(), member?.dispose(), anon?.dispose()]);
  });

  test("M1-T1: a member's new post is owned by that member", async () => {
    const doc = await createPost(member, memberDraftSlug, "draft");
    expect(ownerId(doc)).toBe(memberUserId);
  });

  test("M1-T2: a member cannot assign ownership to someone else on create", async () => {
    const doc = await createPost(member, `m1-forged-owner-${stamp}`, "draft", {
      owner: adminUserId,
    });
    expect(ownerId(doc)).toBe(memberUserId);
  });

  test("M1-T3: a member cannot edit another user's post", async () => {
    const response = await member.patch(`/api/posts/${adminDraftId}`, {
      data: { title: "taken over" },
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);

    const check = await admin.get(`/api/posts/${adminDraftId}?depth=0`);
    expect((await check.json()).title).toBe(adminDraftSlug);
  });

  test("M1-T4: a member cannot delete another user's media", async () => {
    const response = await member.delete(`/api/media/${adminMediaId}`);
    expect(response.status()).toBeGreaterThanOrEqual(400);

    const check = await admin.get(`/api/media/${adminMediaId}?depth=0`);
    expect(check.ok()).toBeTruthy();
  });

  test("M1-T5: a member cannot reassign ownership of its own post", async () => {
    const own = await createPost(member, `m1-reassign-${stamp}`, "draft");

    const response = await member.patch(`/api/posts/${own.id}`, {
      data: { owner: adminUserId },
    });
    // Field access strips the value rather than erroring; the owner is what
    // matters, not the status code.
    const after = await member.get(`/api/posts/${own.id}?depth=0`);
    expect(
      (await after.json()).owner,
      `ownership transferred via ${response.status()} response`,
    ).toBe(memberUserId);
  });

  test("M1-T6: a member sees own drafts and others' published, not others' drafts", async () => {
    const response = await member.get("/api/posts?limit=300&depth=0");
    expect(response.ok()).toBeTruthy();
    const slugs = (await response.json()).docs.map(
      (doc: { slug: string }) => doc.slug,
    );

    expect(slugs).toContain(memberDraftSlug);
    expect(slugs).toContain(adminPublishedSlug);
    expect(slugs).not.toContain(adminDraftSlug);
  });

  test("M1-T7: the public sees only published posts", async () => {
    const response = await anon.get("/api/posts?limit=300&depth=0");
    expect(response.ok()).toBeTruthy();
    const slugs = (await response.json()).docs.map(
      (doc: { slug: string }) => doc.slug,
    );

    expect(slugs).toContain(adminPublishedSlug);
    expect(slugs).not.toContain(adminDraftSlug);
    expect(slugs).not.toContain(memberDraftSlug);
  });

  test("M1-T8: existing content was backfilled with an owner", async () => {
    // The migration assigns pre-ownership content to the first admin; an
    // unowned row would be invisible to `isOwner` forever.
    const response = await admin.get(
      "/api/posts?limit=300&depth=0&where[owner][exists]=false",
    );
    expect(response.ok()).toBeTruthy();
    expect((await response.json()).totalDocs).toBe(0);
  });
});

import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "@playwright/test";

import { lexicalParagraph } from "@/lib/lexical-helpers";
import {
  TEST_MEMBER,
  adminContext,
  ensureMemberUser,
  getAdminUser,
  loginContext,
} from "../helpers/members";

/**
 * M3 — author identity.
 *
 * Every account publishes under an `authors` record; the member controls
 * its display name and nothing else about the byline.
 */
test.describe("M3 author alias", () => {
  const stamp = Date.now();
  let admin: APIRequestContext;
  let member: APIRequestContext;
  let memberUserId: number;
  let memberAuthorId: number;
  let adminAuthorId: number;

  const createdUserIds: number[] = [];
  const createdPostIds: number[] = [];

  const relationId = (value: number | { id: number } | null | undefined) =>
    typeof value === "object" && value !== null ? value.id : value;

  async function inviteUser(email: string, displayName?: string) {
    const response = await admin.post("/api/members/invite", {
      data: { email, displayName },
    });
    expect(
      response.status(),
      `invite ${email} failed: ${await response.text()}`,
    ).toBe(201);
    const body = await response.json();
    createdUserIds.push(body.userId);
    return body.userId as number;
  }

  async function userDoc(id: number) {
    const response = await admin.get(`/api/users/${id}?depth=0`);
    expect(response.ok()).toBeTruthy();
    return response.json();
  }

  test.beforeAll(async ({ baseURL }) => {
    admin = await adminContext(baseURL);
    const adminUser = await getAdminUser(admin);
    adminAuthorId = relationId(adminUser.author)!;

    const memberDoc = await ensureMemberUser(admin);
    memberUserId = memberDoc.id;
    member = await loginContext(baseURL, TEST_MEMBER);

    const me = await (await member.get("/api/users/me")).json();
    memberAuthorId = relationId(me.user?.author)!;
  });

  test.afterAll(async () => {
    for (const id of createdPostIds) await admin?.delete(`/api/posts/${id}`);
    for (const id of createdUserIds) await admin?.delete(`/api/users/${id}`);
    await Promise.all([admin?.dispose(), member?.dispose()]);
  });

  test("M3-T1: every account has an author of its own", async () => {
    expect(memberAuthorId, "member has no author").toBeTruthy();
    expect(adminAuthorId, "admin has no author").toBeTruthy();
    expect(memberAuthorId).not.toBe(adminAuthorId);

    const author = await (
      await admin.get(`/api/authors/${memberAuthorId}?depth=0`)
    ).json();
    expect(relationId(author.owner)).toBe(memberUserId);
  });

  test("M3-T2: colliding aliases get distinct slugs", async () => {
    const local = `dupe-${stamp}`;
    const firstId = await inviteUser(`${local}@one.test`, "同名甲");
    const secondId = await inviteUser(`${local}@two.test`, "同名乙");

    const first = await userDoc(firstId);
    const second = await userDoc(secondId);

    const firstAuthor = await (
      await admin.get(`/api/authors/${relationId(first.author)}?depth=0`)
    ).json();
    const secondAuthor = await (
      await admin.get(`/api/authors/${relationId(second.author)}?depth=0`)
    ).json();

    expect(firstAuthor.slug).toBe(local);
    expect(secondAuthor.slug).toBe(`${local}-2`);
    // The alias itself comes from the invite's display name.
    expect(firstAuthor.name).toBe("同名甲");
    expect(secondAuthor.name).toBe("同名乙");
  });

  test("M3-T3: a member renames its own alias but not anyone else's", async () => {
    const alias = `野馬跑者-${stamp}`;
    const mine = await member.patch(`/api/authors/${memberAuthorId}`, {
      data: { name: alias },
    });
    expect(
      mine.ok(),
      `rename failed: ${mine.status()} ${await mine.text()}`,
    ).toBeTruthy();

    const theirs = await member.patch(`/api/authors/${adminAuthorId}`, {
      data: { name: "hijacked alias" },
    });
    expect(theirs.status()).toBeGreaterThanOrEqual(400);

    const adminAuthor = await (
      await admin.get(`/api/authors/${adminAuthorId}?depth=0`)
    ).json();
    expect(adminAuthor.name).not.toBe("hijacked alias");
  });

  test("M3-T4: the slug survives a rename so links cannot break", async () => {
    const before = await (
      await admin.get(`/api/authors/${memberAuthorId}?depth=0`)
    ).json();

    await member.patch(`/api/authors/${memberAuthorId}`, {
      data: { name: `改名-${stamp}` },
    });

    const after = await (
      await admin.get(`/api/authors/${memberAuthorId}?depth=0`)
    ).json();
    expect(after.slug).toBe(before.slug);
  });

  test("M3-T5: a member's post is bylined to that member automatically", async () => {
    const slug = `m3-byline-${stamp}`;
    const response = await member.post("/api/posts", {
      data: {
        title: slug,
        slug,
        description: "byline test",
        content: lexicalParagraph("byline body"),
        _status: "draft",
      },
    });
    expect(response.ok()).toBeTruthy();
    const doc = (await response.json()).doc;
    createdPostIds.push(doc.id);

    expect(relationId(doc.author)).toBe(memberAuthorId);
  });

  test("M3-T6: a member cannot publish under someone else's byline", async () => {
    const slug = `m3-forged-byline-${stamp}`;
    const created = await member.post("/api/posts", {
      data: {
        title: slug,
        slug,
        description: "forged byline",
        content: lexicalParagraph("forged body"),
        _status: "draft",
        author: adminAuthorId,
      },
    });
    expect(created.ok()).toBeTruthy();
    const doc = (await created.json()).doc;
    createdPostIds.push(doc.id);
    expect(relationId(doc.author)).toBe(memberAuthorId);

    // ...nor by editing afterwards.
    await member.patch(`/api/posts/${doc.id}`, {
      data: { author: adminAuthorId },
    });
    const after = await (
      await member.get(`/api/posts/${doc.id}?depth=0`)
    ).json();
    expect(after.author).toBe(memberAuthorId);
  });

  test("M3-T7: the rendered byline follows the alias", async () => {
    const alias = `顯示名稱-${stamp}`;
    await member.patch(`/api/authors/${memberAuthorId}`, {
      data: { name: alias },
    });

    const slug = `m3-alias-render-${stamp}`;
    const created = await member.post("/api/posts", {
      data: {
        title: slug,
        slug,
        description: "alias render",
        content: lexicalParagraph("alias body"),
        _status: "published",
        publishedAt: new Date().toISOString(),
      },
    });
    expect(created.ok()).toBeTruthy();
    const doc = (await created.json()).doc;
    createdPostIds.push(doc.id);

    // Asserts the data the page reads (post -> author -> name). Rendering of
    // a freshly published page is covered by P2 and currently blocked by the
    // known revalidation issue, so it is deliberately not asserted here.
    const populated = await (
      await member.get(`/api/posts/${doc.id}?depth=1`)
    ).json();
    expect(populated.author?.name).toBe(alias);
  });
});

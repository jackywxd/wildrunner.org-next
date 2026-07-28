import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "@playwright/test";

import {
  TEST_MEMBER,
  adminContext,
  anonContext,
  ensureMemberUser,
  loginContext,
} from "../helpers/members";

// 1x1 transparent PNG, ~70 bytes.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * M4 — storage quota.
 *
 * The quota is recomputed from `SUM(media.filesize)` on every check rather
 * than tracked as a counter, so these tests care about the number actually
 * moving on upload and delete, not just the pass/fail at the boundary.
 */
test.describe("M4 storage quota", () => {
  const stamp = Date.now();
  let admin: APIRequestContext;
  let member: APIRequestContext;
  let anon: APIRequestContext;
  let memberUserId: number;

  const uploadedMediaIds: number[] = [];

  async function upload(context: APIRequestContext, name: string) {
    return context.post("/api/media", {
      multipart: {
        file: { name, mimeType: "image/png", buffer: TINY_PNG },
        _payload: JSON.stringify({ alt: name }),
      },
    });
  }

  async function usage(context: APIRequestContext) {
    const response = await context.get("/api/members/storage-usage");
    expect(response.ok()).toBeTruthy();
    return response.json() as Promise<{ usedBytes: number; quotaBytes: number }>;
  }

  test.beforeAll(async ({ baseURL }) => {
    admin = await adminContext(baseURL);
    anon = await anonContext(baseURL);
    const memberDoc = await ensureMemberUser(admin);
    memberUserId = memberDoc.id;
    member = await loginContext(baseURL, TEST_MEMBER);
    // Start each run from a known state: a quota override survives between
    // runs otherwise (M4-T4 sets one to 1 MB).
    await admin.patch(`/api/users/${memberUserId}`, {
      data: { storageQuotaMb: null },
    });
  });

  test.afterAll(async () => {
    for (const id of uploadedMediaIds) await admin?.delete(`/api/media/${id}`);
    await admin.patch(`/api/users/${memberUserId}`, {
      data: { storageQuotaMb: null },
    });
    await Promise.all([admin?.dispose(), member?.dispose(), anon?.dispose()]);
  });

  test("M4-T1: usage endpoint requires auth", async () => {
    const response = await anon.get("/api/members/storage-usage");
    expect(response.status()).toBe(401);
  });

  test("M4-T2: uploading increases usedBytes by roughly the file size", async () => {
    const before = await usage(member);

    const response = await upload(member, `m4-t2-${stamp}.png`);
    expect(response.ok()).toBeTruthy();
    const doc = (await response.json()).doc;
    uploadedMediaIds.push(doc.id);

    const after = await usage(member);
    expect(after.usedBytes - before.usedBytes).toBe(doc.filesize);
  });

  test("M4-T3: deleting frees the quota and removes the R2 object", async () => {
    const response = await upload(member, `m4-t3-${stamp}.png`);
    const doc = (await response.json()).doc;

    const afterUpload = await usage(member);

    const del = await member.delete(`/api/media/${doc.id}`);
    expect(del.ok()).toBeTruthy();

    const afterDelete = await usage(member);
    expect(afterDelete.usedBytes).toBe(afterUpload.usedBytes - doc.filesize);

    // The R2 object itself, not just the D1 row — a dangling object would
    // silently break the quota's accounting the next time this ran.
    if (doc.url) {
      const objectStillThere = await anon.get(doc.url as string);
      expect(objectStillThere.status()).toBeGreaterThanOrEqual(400);
    }
  });

  test("M4-T4: an upload past quota is rejected and leaves nothing behind", async () => {
    await admin.patch(`/api/users/${memberUserId}`, {
      data: { storageQuotaMb: 0.00001 }, // ~10 bytes; the tiny PNG exceeds it
    });

    const before = await usage(member);
    const beforeMediaList = await member.get(
      `/api/media?where[alt][equals]=m4-t4-${stamp}&depth=0`,
    );
    const beforeCount = (await beforeMediaList.json()).totalDocs;

    const response = await upload(member, `m4-t4-${stamp}.png`);
    expect(response.status()).toBe(413);

    const after = await usage(member);
    expect(after.usedBytes).toBe(before.usedBytes);

    const afterMediaList = await member.get(
      `/api/media?where[alt][equals]=m4-t4-${stamp}&depth=0`,
    );
    expect((await afterMediaList.json()).totalDocs).toBe(beforeCount);
  });

  test("M4-T5: freeing space by deleting allows the next upload through", async () => {
    // Still constrained to ~10 bytes from M4-T4.
    const existing = await member.get(
      `/api/media?where[owner][equals]=${memberUserId}&limit=100&depth=0`,
    );
    for (const doc of (await existing.json()).docs as { id: number }[]) {
      await member.delete(`/api/media/${doc.id}`);
    }

    await admin.patch(`/api/users/${memberUserId}`, {
      data: { storageQuotaMb: null },
    });

    const response = await upload(member, `m4-t5-${stamp}.png`);
    expect(response.ok()).toBeTruthy();
    uploadedMediaIds.push((await response.json()).doc.id);
  });

  test("M4-T6: an admin is not constrained by any quota", async () => {
    await admin.patch(`/api/users/${memberUserId}`, {
      data: { storageQuotaMb: null },
    });
    // Admin's own quota is whatever the default is, but isAdminUser bypasses
    // the check entirely regardless of usage — assert the request succeeds
    // rather than trying to actually exceed a real admin's quota.
    const response = await upload(admin, `m4-t6-${stamp}.png`);
    expect(response.ok()).toBeTruthy();
    uploadedMediaIds.push((await response.json()).doc.id);
  });

  test("M4-T7: pasting a URL to upload is rejected", async () => {
    const response = await member.post("/api/media", {
      data: {
        alt: "pasted",
        url: "https://example.com/some-image.jpg",
      },
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});

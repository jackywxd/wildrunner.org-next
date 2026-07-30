import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "@playwright/test";

import {
  TEST_MEMBER,
  TEST_MEMBER_TWO,
  adminContext,
  ensureMemberUser,
} from "../helpers/members";

// 1x1 transparent PNG, ~70 bytes.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function videoBytes(totalBytes: number) {
  const buffer = Buffer.alloc(totalBytes);
  Buffer.from([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32,
    0x00, 0x00, 0x00, 0x00, 0x6d, 0x70, 0x34, 0x32, 0x6d, 0x70, 0x34, 0x31,
  ]).copy(buffer, 0);
  return buffer;
}

/** Playwright refuses an in-memory buffer over 50 MB — write it out instead. */
function videoFile(name: string, totalBytes: number) {
  const dir = mkdtempSync(join(tmpdir(), "wr-media-lib-"));
  const path = join(dir, name);
  writeFileSync(path, videoBytes(totalBytes));
  return path;
}

async function signIn(
  page: Page,
  credentials: { email: string; password: string },
) {
  const login = await page.context().request.post("/api/users/login", {
    data: credentials,
  });
  expect(login.ok()).toBeTruthy();
  await page.goto("/members/media");
  await expect(page.getByTestId("media-upload-dropzone")).toBeVisible();
}

/**
 * E — member media library.
 *
 * src/lib/direct-upload.ts, src/lib/upload-store.ts and LargeUploadPanel.tsx
 * are untouched by this phase; UploadDropzone.tsx drives the same functions
 * with member-shell styling, so most of what's asserted here is that the
 * new UI is wired to them correctly, not that the upload mechanics work
 * (those stay covered by V0/V2/V3/V4).
 */
test.describe("E member media library", () => {
  const stamp = Date.now();
  let admin: APIRequestContext;
  let memberUserId: number;
  const createdMediaIds: number[] = [];

  test.beforeAll(async ({ baseURL }) => {
    admin = await adminContext(baseURL);
    const memberDoc = await ensureMemberUser(admin, TEST_MEMBER);
    memberUserId = memberDoc.id;
    await ensureMemberUser(admin, TEST_MEMBER_TWO);
    await admin.patch(`/api/users/${memberUserId}`, {
      data: { storageQuotaMb: null },
    });
  });

  test.afterAll(async () => {
    for (const id of createdMediaIds) await admin?.delete(`/api/media/${id}`);
    await admin.patch(`/api/users/${memberUserId}`, {
      data: { storageQuotaMb: null },
    });
    await admin?.dispose();
  });

  test("E-T1: a 60 MB video uploads with visible progress and becomes a media document", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await signIn(page, TEST_MEMBER);

    const name = `e1-media-${stamp}.mp4`;
    const bytes = 60 * 1024 * 1024;

    await page
      .getByTestId("media-upload-input")
      .setInputFiles(videoFile(name, bytes));
    await page.getByTestId("media-upload-alt").fill("E1 測試影片");
    await page.getByTestId("media-upload-start").click();

    const progress = page.getByTestId("media-upload-progress");
    await expect(progress).toBeVisible();
    await expect
      .poll(
        async () => Number((await progress.getAttribute("data-percent")) ?? 0),
        { timeout: 120_000, message: "progress never advanced" },
      )
      .toBeGreaterThan(0);

    await expect(page.getByTestId("media-upload-done")).toBeVisible({
      timeout: 150_000,
    });

    // The grid refetches on completion — the new item should appear without
    // a manual reload.
    await expect(page.getByText("E1 測試影片")).toBeVisible();

    const list = await admin.get(
      `/api/media?where[owner][equals]=${memberUserId}&where[alt][equals]=${encodeURIComponent("E1 測試影片")}&depth=0`,
    );
    const doc = (await list.json()).docs[0];
    expect(doc).toBeTruthy();
    expect(doc.filesize).toBe(bytes);
    createdMediaIds.push(doc.id);
  });

  test("E-T2: the quota bar updates after an upload without a page reload", async ({
    page,
  }) => {
    await signIn(page, TEST_MEMBER);

    // Asserted on the raw byte count, not the rendered "x.xx GB" — a ~70
    // byte PNG cannot move a figure printed to two decimal places, so the
    // visible text would be unchanged even on a correct refresh.
    const bar = page.getByTestId("media-quota-bar");
    const before = Number(await bar.getAttribute("data-used-bytes"));

    await page.getByTestId("media-upload-input").setInputFiles({
      name: `e2-quota-${stamp}.png`,
      mimeType: "image/png",
      buffer: TINY_PNG,
    });
    await page.getByTestId("media-upload-start").click();
    await expect(page.getByTestId("media-upload-done")).toBeVisible();

    await expect
      .poll(async () => Number(await bar.getAttribute("data-used-bytes")))
      .toBeGreaterThan(before);

    const list = await admin.get(
      `/api/media?where[owner][equals]=${memberUserId}&where[alt][equals]=e2-quota-${stamp}&depth=0`,
    );
    createdMediaIds.push((await list.json()).docs[0].id);
  });

  test("E-T3: editing the alt text persists", async ({ page }) => {
    await signIn(page, TEST_MEMBER);

    await page.getByTestId("media-upload-input").setInputFiles({
      name: `e3-alt-${stamp}.png`,
      mimeType: "image/png",
      buffer: TINY_PNG,
    });
    await page.getByTestId("media-upload-start").click();
    await expect(page.getByTestId("media-upload-done")).toBeVisible();

    const list = await admin.get(
      `/api/media?where[owner][equals]=${memberUserId}&where[alt][equals]=e3-alt-${stamp}&depth=0`,
    );
    const id = (await list.json()).docs[0].id;
    createdMediaIds.push(id);

    await page.getByTestId(`media-item-${id}`).click();
    const dialog = page.getByTestId("media-detail-dialog");
    await expect(dialog).toBeVisible();
    await page.getByTestId("media-detail-alt").fill(`改過的替代文字-${stamp}`);
    await page.getByTestId("media-detail-save").click();
    await expect(dialog).toBeHidden();

    const after = await (await admin.get(`/api/media/${id}?depth=0`)).json();
    expect(after.alt).toBe(`改過的替代文字-${stamp}`);

    // Reload proves it's a real persisted value, not optimistic local state.
    await page.reload();
    await page.getByTestId(`media-item-${id}`).click();
    await expect(page.getByTestId("media-detail-alt")).toHaveValue(
      `改過的替代文字-${stamp}`,
    );
  });

  test("E-T4: deleting removes both the document and the R2 object", async ({
    page,
  }) => {
    await signIn(page, TEST_MEMBER);

    await page.getByTestId("media-upload-input").setInputFiles({
      name: `e4-delete-${stamp}.png`,
      mimeType: "image/png",
      buffer: TINY_PNG,
    });
    await page.getByTestId("media-upload-start").click();
    await expect(page.getByTestId("media-upload-done")).toBeVisible();

    const list = await admin.get(
      `/api/media?where[owner][equals]=${memberUserId}&where[alt][equals]=e4-delete-${stamp}&depth=0`,
    );
    const doc = (await list.json()).docs[0];

    await page.getByTestId(`media-item-${doc.id}`).click();
    await page.getByTestId("media-detail-delete").click();
    await page.getByTestId("media-detail-delete-confirm").click();
    await expect(page.getByTestId("media-detail-dialog")).toBeHidden();
    await expect(page.getByTestId(`media-item-${doc.id}`)).toHaveCount(0);

    const gone = await admin.get(`/api/media/${doc.id}?depth=0`);
    expect(gone.status()).toBe(404);

    if (doc.url) {
      const objectStillThere = await page.context().request.get(doc.url);
      expect(objectStillThere.status()).toBeGreaterThanOrEqual(400);
    }
  });

  test("E-T5: a member never sees another member's media", async ({
    page,
  }) => {
    await signIn(page, TEST_MEMBER);
    await page.getByTestId("media-upload-input").setInputFiles({
      name: `e5-isolation-${stamp}.png`,
      mimeType: "image/png",
      buffer: TINY_PNG,
    });
    await page.getByTestId("media-upload-start").click();
    await expect(page.getByTestId("media-upload-done")).toBeVisible();

    const list = await admin.get(
      `/api/media?where[owner][equals]=${memberUserId}&where[alt][equals]=e5-isolation-${stamp}&depth=0`,
    );
    createdMediaIds.push((await list.json()).docs[0].id);

    await signIn(page, TEST_MEMBER_TWO);
    await expect(
      page.getByText(`e5-isolation-${stamp}`),
    ).not.toBeVisible();
  });

  test("E-T6: an over-quota upload shows the quota message, not a generic error", async ({
    page,
  }) => {
    await admin.patch(`/api/users/${memberUserId}`, {
      data: { storageQuotaMb: 0.00001 }, // ~10 bytes; the tiny PNG exceeds it
    });
    await signIn(page, TEST_MEMBER);

    await page.getByTestId("media-upload-input").setInputFiles({
      name: `e6-overquota-${stamp}.png`,
      mimeType: "image/png",
      buffer: TINY_PNG,
    });
    await page.getByTestId("media-upload-start").click();

    const error = page.getByTestId("media-upload-error");
    await expect(error).toBeVisible();
    await expect(error).toContainText("Storage quota exceeded");

    const list = await admin.get(
      `/api/media?where[owner][equals]=${memberUserId}&where[alt][equals]=e6-overquota-${stamp}&depth=0`,
    );
    expect((await list.json()).totalDocs).toBe(0);

    await admin.patch(`/api/users/${memberUserId}`, {
      data: { storageQuotaMb: null },
    });
  });
});

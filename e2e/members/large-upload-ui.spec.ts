import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "@playwright/test";

import {
  TEST_MEMBER,
  adminContext,
  ensureMemberUser,
} from "../helpers/members";

/**
 * V3 — the admin upload panel.
 *
 * The API-level contract is covered in large-upload.spec.ts; this drives the
 * component a member actually uses, because the two halves can pass
 * separately and still not work together — the panel has to reserve a
 * filename, upload the parts, complete, and only then create the document.
 */
test.describe("V3 admin upload panel", () => {
  const stamp = Date.now();
  let admin: APIRequestContext;
  const createdMediaIds: number[] = [];

  test.beforeAll(async ({ baseURL }) => {
    admin = await adminContext(baseURL);
    await ensureMemberUser(admin, TEST_MEMBER);
  });

  test.afterAll(async () => {
    for (const id of createdMediaIds) await admin?.delete(`/api/media/${id}`);
    await admin?.dispose();
  });

  function videoBytes(totalBytes: number) {
    const buffer = Buffer.alloc(totalBytes);
    Buffer.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32,
      0x00, 0x00, 0x00, 0x00, 0x6d, 0x70, 0x34, 0x32, 0x6d, 0x70, 0x34, 0x31,
    ]).copy(buffer, 0);
    return buffer;
  }

  /**
   * Playwright refuses an in-memory buffer over 50 MB, which is below the
   * size this feature exists for — write it out and pass the path.
   */
  function videoFile(name: string, totalBytes: number) {
    const dir = mkdtempSync(join(tmpdir(), "wr-upload-"));
    const path = join(dir, name);
    writeFileSync(path, videoBytes(totalBytes));
    return path;
  }

  async function signIn(page: import("@playwright/test").Page) {
    const login = await page.context().request.post("/api/users/login", {
      data: TEST_MEMBER,
    });
    expect(login.ok()).toBeTruthy();
    await page.goto("/admin/collections/media");
    await expect(page.getByTestId("large-upload")).toBeVisible();
  }

  test("V3-T1: a 60 MB video uploads from the panel and becomes a document", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await signIn(page);

    const name = `v3-ui-${stamp}.mp4`;
    const bytes = 60 * 1024 * 1024;

    await page
      .getByTestId("large-upload-input")
      .setInputFiles(videoFile(name, bytes));

    // Name defaults from the filename and stays editable.
    await expect(page.getByTestId("large-upload-alt")).toHaveValue(
      `v3-ui-${stamp}`,
    );
    await page.getByTestId("large-upload-alt").fill("六十MB 測試影片");

    await page.getByTestId("large-upload-start").click();

    // Progress has to actually move, not just appear at 0 and jump to done.
    const progress = page.getByTestId("large-upload-progress");
    await expect(progress).toBeVisible();
    await expect
      .poll(
        async () => Number((await progress.getAttribute("data-percent")) ?? 0),
        { timeout: 120_000, message: "progress never advanced" },
      )
      .toBeGreaterThan(0);

    const done = page.getByTestId("large-upload-done");
    await expect(done).toBeVisible({ timeout: 150_000 });

    const id = Number(await done.getAttribute("data-doc-id"));
    createdMediaIds.push(id);

    const doc = await (await admin.get(`/api/media/${id}?depth=0`)).json();
    expect(doc.filesize).toBe(bytes);
    expect(doc.mimeType).toBe("video/mp4");
    expect(doc.alt).toBe("六十MB 測試影片");
    expect(doc.filename).toBe(name);
  });

  test("V3-T2: a small file still goes through Payload's own path", async ({
    page,
  }) => {
    await signIn(page);

    const name = `v3-small-${stamp}.mp4`;
    const bytes = 2 * 1024 * 1024;

    await page.getByTestId("large-upload-input").setInputFiles({
      name,
      mimeType: "video/mp4",
      buffer: videoBytes(bytes),
    });
    await page.getByTestId("large-upload-start").click();

    const done = page.getByTestId("large-upload-done");
    await expect(done).toBeVisible({ timeout: 60_000 });

    const id = Number(await done.getAttribute("data-doc-id"));
    createdMediaIds.push(id);

    const doc = await (await admin.get(`/api/media/${id}?depth=0`)).json();
    expect(doc.filesize).toBe(bytes);
  });

  test("V4-T1: a cancelled upload resumes instead of restarting", async ({ page }) => {
    test.setTimeout(240_000);
    await signIn(page);

    const name = `v4-resume-${stamp}.mp4`;
    const bytes = 60 * 1024 * 1024;
    const path = videoFile(name, bytes);

    await page.getByTestId("large-upload-input").setInputFiles(path);
    await page.getByTestId("large-upload-start").click();

    // Stop once some parts are in, so resuming has something to skip and
    // something left to send.
    const progress = page.getByTestId("large-upload-progress");
    await expect
      .poll(
        async () => Number((await progress.getAttribute("data-percent")) ?? 0),
        { timeout: 120_000, message: "progress never advanced" },
      )
      .toBeGreaterThan(10);
    await page.getByTestId("large-upload-cancel").click();

    // The offer to resume proves the part list survived, and reloading first
    // proves it survived outside the component's memory.
    await expect(page.getByTestId("large-upload-resumable")).toBeVisible();
    await page.reload();
    await page.getByTestId("large-upload-input").setInputFiles(path);

    const resumable = page.getByTestId("large-upload-resumable");
    await expect(resumable).toBeVisible();
    const alreadyDone = Number(
      (await resumable.textContent())?.match(/已傳 (\d+)/)?.[1] ?? 0,
    );
    expect(alreadyDone).toBeGreaterThan(0);

    await page.getByTestId("large-upload-start").click();
    const done = page.getByTestId("large-upload-done");
    await expect(done).toBeVisible({ timeout: 200_000 });

    const id = Number(await done.getAttribute("data-doc-id"));
    createdMediaIds.push(id);

    // Exact: a resumed upload that re-sent or skipped a part would complete
    // to a different size, or fail outright at complete().
    const doc = await (await admin.get(`/api/media/${id}?depth=0`)).json();
    expect(doc.filesize).toBe(bytes);

    // And the finished upload must not be offered for resuming again.
    await page.reload();
    await page.getByTestId("large-upload-input").setInputFiles(path);
    await expect(page.getByTestId("large-upload-resumable")).toBeHidden();
  });

  test("V3-T3: two members uploading the same filename don't overwrite each other", async ({
    page,
  }) => {
    await signIn(page);

    const name = `v3-collision-${stamp}.mp4`;
    const first = 40 * 1024 * 1024;
    const second = 45 * 1024 * 1024;

    for (const bytes of [first, second]) {
      await page.reload();
      await page.getByTestId("large-upload-input").setInputFiles({
        name,
        mimeType: "video/mp4",
        buffer: videoBytes(bytes),
      });
      await page.getByTestId("large-upload-start").click();
      const done = page.getByTestId("large-upload-done");
      await expect(done).toBeVisible({ timeout: 150_000 });
      createdMediaIds.push(Number(await done.getAttribute("data-doc-id")));
    }

    const [a, b] = createdMediaIds.slice(-2);
    const docA = await (await admin.get(`/api/media/${a}?depth=0`)).json();
    const docB = await (await admin.get(`/api/media/${b}?depth=0`)).json();

    // The second upload must have been given its own key — completing a
    // multipart upload on an existing key silently replaces the object.
    expect(docA.filename).not.toBe(docB.filename);
    expect(docA.filesize).toBe(first);
    expect(docB.filesize).toBe(second);
  });
});

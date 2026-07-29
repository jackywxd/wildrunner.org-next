import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "@playwright/test";

import {
  TEST_MEMBER,
  adminContext,
  ensureMemberUser,
  loginContext,
} from "../helpers/members";

/**
 * V0 — large media uploads.
 *
 * Files over 50 MB reach R2 intact but the document create fails with
 * `File type text/plain (from extension m4v) is not allowed.` The extension
 * in that message is incidental: a 60 MB .mp4 fails identically, while the
 * same file at 6 MB succeeds. The cause is a size threshold, not a format.
 *
 * @payloadcms/storage-r2 refuses to hand a >50 MB object back to the server
 * (`new Response(null, { status: 200 })`) so the Worker doesn't run out of
 * memory, but Payload core reads that response into `req.file.data`
 * regardless. `checkFileRestrictions` then sniffs zero bytes, finds nothing,
 * and falls back to a ten-entry extension map in which every video type
 * resolves to `text/plain`.
 *
 * The fix takes large files out of that pipeline entirely rather than
 * repairing a step inside it — see PLAN-large-uploads.md.
 *
 * These tests drive the same two calls the admin UI makes, so they cover the
 * server contract without depending on the upload component that V3 adds.
 */
test.describe("V0 large media uploads", () => {
  const stamp = Date.now();
  const CHUNK = 5 * 1024 * 1024;

  // Above storage-r2's 50 MB cutoff, so this is the case that fails today.
  const LARGE_MB = 60;
  // Below the 32 MB threshold, on Payload's built-in path — the control.
  const SMALL_MB = 6;

  let admin: APIRequestContext;
  let member: APIRequestContext;

  const createdMediaIds: number[] = [];
  const uploadedKeys: string[] = [];

  test.beforeAll(async ({ baseURL }) => {
    admin = await adminContext(baseURL);
    await ensureMemberUser(admin, TEST_MEMBER);
    member = await loginContext(baseURL, TEST_MEMBER);
  });

  test.afterAll(async () => {
    for (const id of createdMediaIds) await admin?.delete(`/api/media/${id}`);
    await Promise.all([admin?.dispose(), member?.dispose()]);
  });

  /** A buffer that begins with a real mp4 `ftyp` box so content sniffing can identify it. */
  function videoBytes(totalBytes: number) {
    const buffer = Buffer.alloc(totalBytes);
    Buffer.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32,
      0x00, 0x00, 0x00, 0x00, 0x6d, 0x70, 0x34, 0x32, 0x6d, 0x70, 0x34, 0x31,
    ]).copy(buffer, 0);
    return buffer;
  }

  /**
   * The browser half of a client upload: bytes go straight to R2 in parts,
   * never through the document-create request. Mirrors
   * @payloadcms/storage-r2's R2ClientUploadHandler.
   */
  async function uploadToR2(
    context: APIRequestContext,
    fileName: string,
    buffer: Buffer,
    mimeType: string,
  ) {
    const endpoint = (extra: Record<string, string> = {}) =>
      `/api/storage-r2-multi-part-upload?${new URLSearchParams({
        collection: "media",
        fileName,
        fileType: mimeType,
        ...extra,
      })}`;

    const init = await context.post(endpoint());
    expect(
      init.ok(),
      `multipart init failed: ${init.status()} ${await init.text()}`,
    ).toBeTruthy();
    const { key, uploadId } = await init.json();
    uploadedKeys.push(key);

    const parts = [];
    const partTotal = Math.ceil(buffer.length / CHUNK);
    for (let part = 1; part <= partTotal; part++) {
      const body = buffer.subarray(
        (part - 1) * CHUNK,
        Math.min(part * CHUNK, buffer.length),
      );
      const uploaded = await context.post(
        endpoint({
          multipartId: uploadId,
          multipartKey: key,
          multipartNumber: String(part),
        }),
        { headers: { "Content-Type": "application/octet-stream" }, data: body },
      );
      expect(
        uploaded.ok(),
        `part ${part}/${partTotal} failed: ${uploaded.status()}`,
      ).toBeTruthy();
      parts.push(await uploaded.json());
    }

    const complete = await context.post(
      endpoint({ multipartId: uploadId, multipartKey: key }),
      { data: parts },
    );
    expect(
      complete.ok(),
      `multipart complete failed: ${complete.status()}`,
    ).toBeTruthy();

    return { key, uploadId, partTotal };
  }

  test("V0-T1: a >50 MB video becomes a media document", async () => {
    const fileName = `v0-large-${stamp}.mp4`;
    const bytes = LARGE_MB * 1024 * 1024;

    const { partTotal } = await uploadToR2(
      member,
      fileName,
      videoBytes(bytes),
      "video/mp4",
    );
    expect(partTotal).toBe(Math.ceil(bytes / CHUNK));

    // Metadata only: no `file`, and deliberately no `url` — with a filename
    // present that sends Payload down shouldReupload -> getExternalFile,
    // making the Worker fetch a caller-supplied URL.
    const create = await member.post("/api/media", {
      data: { filename: fileName, mimeType: "video/mp4", filesize: bytes },
    });

    expect(
      create.ok(),
      `document create failed: ${create.status()} ${await create.text()}`,
    ).toBeTruthy();

    const doc = (await create.json()).doc;
    createdMediaIds.push(doc.id);
    expect(doc.filesize).toBe(bytes);
    expect(doc.mimeType).toMatch(/^video\//);
  });

  test("V0-T2: the size is taken from R2, not from what the client claimed", async () => {
    const fileName = `v0-understated-${stamp}.mp4`;
    const bytes = LARGE_MB * 1024 * 1024;

    await uploadToR2(member, fileName, videoBytes(bytes), "video/mp4");

    // Quota is a sum of media.filesize, so a client-supplied size is a way to
    // store far more than the allowance. The server has to overwrite it.
    const create = await member.post("/api/media", {
      data: { filename: fileName, mimeType: "video/mp4", filesize: 1 },
    });
    expect(create.ok()).toBeTruthy();

    const doc = (await create.json()).doc;
    createdMediaIds.push(doc.id);
    expect(doc.filesize).toBe(bytes);
  });

  test("V0-T3: a document cannot be created for an object that isn't there", async () => {
    const create = await member.post("/api/media", {
      data: {
        filename: `v0-nonexistent-${stamp}.mp4`,
        mimeType: "video/mp4",
        filesize: 123456789,
      },
    });
    expect(create.status()).toBeGreaterThanOrEqual(400);
  });

  test("V0-T4: `url` in the payload is refused", async () => {
    const fileName = `v0-url-${stamp}.mp4`;
    await uploadToR2(member, fileName, videoBytes(SMALL_MB * 1024 * 1024), "video/mp4");

    // filename + url makes generateFileData call getExternalFile, i.e. the
    // Worker fetches whatever URL the caller supplied.
    const create = await member.post("/api/media", {
      data: {
        filename: fileName,
        mimeType: "video/mp4",
        filesize: SMALL_MB * 1024 * 1024,
        url: "https://example.invalid/anything.mp4",
      },
    });
    expect(create.status()).toBeGreaterThanOrEqual(400);
  });

  test("V0-T5: owner and alt are filled in without the client sending them", async () => {
    const fileName = `v0-defaults-${stamp}.mp4`;
    const bytes = LARGE_MB * 1024 * 1024;

    await uploadToR2(member, fileName, videoBytes(bytes), "video/mp4");

    const create = await member.post("/api/media", {
      data: { filename: fileName, mimeType: "video/mp4", filesize: bytes },
    });
    expect(create.ok()).toBeTruthy();

    const doc = (await create.json()).doc;
    createdMediaIds.push(doc.id);

    const me = await (await member.get("/api/users/me")).json();
    const ownerId = typeof doc.owner === "object" ? doc.owner?.id : doc.owner;
    expect(ownerId).toBe(me.user.id);

    // `alt` is required, so it has to default server-side too — otherwise an
    // API create without it fails while the admin UI succeeds.
    expect(doc.alt).toBe(`v0-defaults-${stamp}`);
  });

  test("V0-T6: small uploads keep the built-in path", async () => {
    const buffer = videoBytes(SMALL_MB * 1024 * 1024);
    const response = await member.post("/api/media", {
      multipart: {
        file: {
          name: `v0-small-${stamp}.mp4`,
          mimeType: "video/mp4",
          buffer,
        },
        _payload: JSON.stringify({ alt: "small control" }),
      },
    });

    expect(
      response.ok(),
      `small upload regressed: ${response.status()} ${await response.text()}`,
    ).toBeTruthy();
    const doc = (await response.json()).doc;
    createdMediaIds.push(doc.id);
    expect(doc.filesize).toBe(buffer.length);
  });
});

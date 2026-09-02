import { apiTest as test, expect } from "../helpers/api-test";

import { TEST_ADMIN } from "../helpers/auth";
import { MAX_UPLOAD_BYTES } from "@/lib/media/upload-limits";

/**
 * M-TOOBIG — the per-file ceiling is the server's, not the browser's.
 *
 * `uploadVideoFile` checks `file.size` before it does anything else, which is
 * where a member gets a message they can act on. That check is in the browser,
 * so it is the browser's to skip — and what it protects is not cosmetic: a
 * file large enough to outrun the transcode lease (15 minutes,
 * src/lib/media/transcode-state.ts) becomes a video that reports `failed`
 * after several container runs, having spent all of them.
 *
 * `directUploadInit` is the only server-side gate that can refuse before any
 * bytes move: it is the first request the direct path makes, and it already
 * held the quota check for the same reason. So this asserts there, and it
 * asserts an admin is refused too — the quota beside it deliberately exempts
 * admins, and copying that exemption here would have been the easy mistake.
 * A ceiling about what the encoder can finish is a fact about the file.
 *
 * CONTRACT LEVEL, and this is the case that argues for it best: `filesize` is
 * *declared*, so the refusal can be proven with a request body of a few dozen
 * bytes. A browser test would have to produce a gigabyte to make the same
 * claim, and the thing it would then be measuring is mostly disk.
 *
 * Imports `test` from ../helpers/api-test rather than ../helpers/test: nothing
 * here opens a page, and the console guard's fixture would launch a browser
 * for nothing.
 *
 * Creates nothing, so there is nothing to tear down — the request is refused
 * before a filename is reserved or an R2 upload is started.
 */
test.describe("M-TOOBIG a file over the ceiling is refused before it uploads", () => {
  test.beforeEach(async ({ request }) => {
    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();
  });

  test("M-TOOBIG-T1: one byte over is refused, and says how big the limit is", async ({
    request,
  }) => {
    const response = await request.post("/api/members/direct-upload-init", {
      data: {
        filename: "m-toobig.mp4",
        filesize: MAX_UPLOAD_BYTES + 1,
      },
    });

    // 413, not 400: the request is well-formed and the entity is too large,
    // which is the distinction the client's error handling reads.
    expect(response.status()).toBe(413);
    // The number a member can act on has to survive into the message. A bare
    // "too large" leaves them guessing at what would fit.
    expect(await response.text()).toContain("1 GB");
  });

  test("M-TOOBIG-T2: one byte under is not refused by the ceiling", async ({
    request,
  }) => {
    const response = await request.post("/api/members/direct-upload-init", {
      data: {
        filename: "m-toobig-ok.mp4",
        filesize: MAX_UPLOAD_BYTES,
      },
    });

    // The control that makes T1 mean anything: without it a gate that refused
    // *everything* would look identical from where T1 stands. This does not
    // assert 200 — the admin account's quota is a separate check that could
    // legitimately refuse a gigabyte — only that whatever happens is not this
    // gate. Both refusals are 413, so the message is what separates them.
    if (response.status() === 413) {
      expect(await response.text()).toContain("quota");
    }
  });
});

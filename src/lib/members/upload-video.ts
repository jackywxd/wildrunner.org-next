import {
  DIRECT_UPLOAD_THRESHOLD,
  completeSession,
  createMediaDocument,
  defaultAltFor,
  reserveFilename,
  startSession,
  uploadParts,
} from "@/lib/direct-upload";
import { findDuplicateUpload } from "@/lib/members/duplicate-upload";
import { requestTranscode } from "@/lib/members/transcode-video";
import { wouldExceedQuota } from "@/lib/members/upload-image";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/media/upload-limits";

/**
 * Upload one video from the article editor and return its media id.
 *
 * The sibling of `uploadImageFile`, and deliberately not a branch inside it:
 * almost nothing they do is shared. There is no downscale (`downscaleImage`
 * is a canvas operation on an image), no `createImageBitmap` to measure
 * dimensions with, and no `processImage` — what a video needs instead is
 * `requestTranscode`, which neither of those paths wants.
 *
 * THE SAME THRESHOLD BRANCH `UploadDropzone` USES, not a simplification of
 * it. Sending every video straight to R2 reads tidier and would have made a
 * small clip take a path nothing else in this codebase exercises for a small
 * file; the 32 MB cutoff is where Cloudflare's request-body limit actually
 * bites (`payload.config.ts`), and below it Payload's own upload route is the
 * one every image already goes through.
 *
 * `usage: 'attachment'`, exactly as the image path sets it, and stated rather
 * than left to the field default. A video dropped into an article is not
 * photo-wall content, and `media.usage` is what keeps it off /gallery.
 *
 * The errors thrown here are read by a member: `VideoInsertPlugin` prints
 * `message` straight into its panel.
 */
export async function uploadVideoFile(
  file: File,
  options: { onProgress?: (percent: number) => void; signal?: AbortSignal } = {},
): Promise<number> {
  // Before anything else, including the fingerprint — hashing a gigabyte the
  // upload is going to refuse is a minute of the member's battery for an
  // answer that was knowable from `file.size`.
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `影片太大（${(file.size / (1024 * 1024)).toFixed(0)} MB），單一檔案上限是 ${MAX_UPLOAD_LABEL}。`,
    );
  }

  if (await wouldExceedQuota(file.size)) {
    throw new Error("儲存空間不足，請先到媒體庫刪除一些檔案。");
  }

  /**
   * The same file, already uploaded, is answered without moving a byte.
   *
   * Worth far more here than on the image path: this is where somebody drops
   * the same 400 MB clip into a second article, and reusing the row costs
   * nothing, spends no quota, and skips a transcode that has already run.
   * A file that cannot be fingerprinted comes back as "no duplicate" and
   * uploads normally.
   */
  const duplicate = await findDuplicateUpload(file);
  if (duplicate.existing) return duplicate.existing.id;

  const fingerprint = duplicate.fingerprint
    ? { contentFingerprint: duplicate.fingerprint }
    : {};

  let mediaId: number;
  if (file.size <= DIRECT_UPLOAD_THRESHOLD) {
    const body = new FormData();
    body.set("file", file);
    body.set(
      "_payload",
      JSON.stringify({ alt: defaultAltFor(file.name), usage: "attachment", ...fingerprint }),
    );
    const response = await fetch("/api/media", {
      method: "POST",
      credentials: "same-origin",
      body,
    });
    if (!response.ok) throw new Error(await parseError(response));
    mediaId = ((await response.json()) as { doc: { id: number } }).doc.id;
    // Nothing to report between 0 and done on this path: the request is one
    // POST, and a progress bar that only ever shows 0% then vanishes is worse
    // than none.
    options.onProgress?.(100);
  } else {
    const session = await startSession(file, await reserveFilename(file));
    await uploadParts(session, file, {
      signal: options.signal,
      onProgress: ({ partsDone, partTotal }) =>
        options.onProgress?.(
          partTotal === 0 ? 100 : Math.round((partsDone / partTotal) * 100),
        ),
    });
    await completeSession(session);

    const doc = await createMediaDocument({
      filename: session.filename,
      mimeType: session.mimeType,
      alt: defaultAltFor(file.name),
      usage: "attachment",
      ...fingerprint,
    });
    mediaId = doc.id;
  }

  // Queued, not awaited to completion: encoding a 4K clip measures in
  // minutes and the endpoint returns as soon as the job is on the queue.
  // Never throws — the upload has already succeeded, and a transcoder that
  // is down must not make it report as failed. The row stays `queued` and
  // the scheduled sweep picks it up.
  await requestTranscode(mediaId);

  return mediaId;
}

/** The server's own message where there is one — the size and quota refusals
 *  both say something a member can act on, and "上傳失敗" throws that away. */
async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { errors?: { message?: string }[] };
    return body.errors?.[0]?.message || "上傳失敗，請再試一次。";
  } catch {
    return "上傳失敗，請再試一次。";
  }
}

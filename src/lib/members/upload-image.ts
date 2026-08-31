import { downscaleImage } from "@/lib/media/downscale";
import {
  DIRECT_UPLOAD_THRESHOLD,
  completeSession,
  createMediaDocument,
  defaultAltFor,
  reserveFilename,
  startSession,
  uploadParts,
} from "@/lib/direct-upload";

/**
 * Upload one image and return its media id.
 *
 * Consumes src/lib/direct-upload.ts unchanged — same threshold, same
 * reserve → session → parts → complete → document sequence the media
 * library and the admin panel use.
 *
 * Everything created here is `usage: 'attachment'`, and this is the seam that
 * makes that true for the whole editor: both an image pasted into an article
 * body (ImageInsertPlugin) and a post's cover (CoverImageField) come through
 * this one function. `media.usage` defaults to 'gallery', so an attachment
 * path that forgets to say so puts a screenshot on the public photo wall —
 * which is why it is sent on both branches below rather than once.
 */

type Usage = { quotaBytes: number; usedBytes: number };

/**
 * Check the quota *before* moving any bytes.
 *
 * `enforceStorageQuota` is still the authoritative check, but it runs at
 * document-creation time — for a file that went straight to R2, that is
 * after the object is already stored, leaving an orphan behind. Pasting has
 * almost no friction (one keystroke, repeatable), so the cheap pre-flight
 * matters more here than in the media library.
 */
async function wouldExceedQuota(size: number): Promise<boolean> {
  try {
    const response = await fetch("/api/members/storage-usage", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) return false;
    const usage = (await response.json()) as Usage;
    return usage.usedBytes + size > usage.quotaBytes;
  } catch {
    // A failed pre-flight must not block the upload; the server-side check
    // still stands behind it.
    return false;
  }
}

function timestampedName(file: File): string {
  // A pasted screenshot arrives as "image.png" every time; without this
  // every paste would collide on the same reserved filename.
  const dot = file.name.lastIndexOf(".");
  const ext = dot > 0 ? file.name.slice(dot) : ".png";
  return `pasted-${Date.now()}${ext}`;
}

/**
 * Best-effort: blurDataURL, real dimensions, HEIC→WebP conversion. A
 * separate request on purpose — see processMediaImage.ts's header for why
 * this can't run as a hook on the create itself. Never thrown from here:
 * the upload already succeeded by the time this runs.
 */
async function processImage(mediaId: number): Promise<void> {
  await fetch(`/api/members/media/${mediaId}/process-image`, {
    method: "POST",
    credentials: "same-origin",
  }).catch(() => {});
}

export async function uploadImageFile(file: File): Promise<number> {
  // Before the quota check, not after: the whole point of shrinking is that
  // the smaller file is what gets billed, and checking the original's size
  // would refuse an upload that comfortably fits.
  const shrunk = await downscaleImage(file);

  if (await wouldExceedQuota(shrunk.size)) {
    throw new Error("Storage quota exceeded");
  }

  const named = new File([shrunk], timestampedName(shrunk), { type: shrunk.type });
  const alt = defaultAltFor(named.name);

  if (named.size <= DIRECT_UPLOAD_THRESHOLD) {
    // Payload's own path: the server reads the file, so width/height get
    // filled in immediately. blurDataURL and HEIC conversion still need
    // processImage below — see its own comment.
    const body = new FormData();
    body.set("file", named);
    body.set("_payload", JSON.stringify({ alt, usage: "attachment" }));
    const response = await fetch("/api/media", {
      method: "POST",
      credentials: "same-origin",
      body,
    });
    if (!response.ok) {
      throw new Error((await response.text()).slice(0, 300));
    }
    const id = ((await response.json()) as { doc: { id: number } }).doc.id;
    await processImage(id);
    return id;
  }

  const session = await startSession(named, await reserveFilename(named));
  await uploadParts(session, named);
  await completeSession(session);
  const doc = await createMediaDocument({
    filename: session.filename,
    mimeType: session.mimeType,
    alt,
    usage: "attachment",
  });

  // Nothing read this file server-side, so it has no dimensions. Measuring
  // in the browser and patching them back keeps the public renderer from
  // falling back to a wrong 1200x800 aspect ratio.
  try {
    const bitmap = await createImageBitmap(named);
    await fetch(`/api/media/${doc.id}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ width: bitmap.width, height: bitmap.height }),
    });
    bitmap.close();
  } catch {
    /* dimensions are a nicety; the upload itself already succeeded */
  }

  await processImage(doc.id);
  return doc.id;
}

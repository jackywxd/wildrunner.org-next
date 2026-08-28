import { downscaleImage } from "@/lib/media/downscale";

import type { EmbeddedImageUploader } from "./resolve-embedded-images";

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * The real network-backed `EmbeddedImageUploader` for `ImportPost.tsx`.
 * Kept out of `resolve-embedded-images.ts` so that module stays a pure
 * tree walk with an injected callback — this file is the one place in the
 * importer that touches `fetch`.
 *
 * Mirrors `UploadDropzone.tsx`'s small-file path exactly (`FormData` with
 * `file` + `_payload`, then a best-effort `process-image` call for
 * blurDataURL/dimensions) rather than inventing a second way to create a
 * `media` document — this is the same collection, the same quota
 * enforcement (`enforceStorageQuota`, `Media.ts`), and the same endpoint.
 */
export const uploadEmbeddedImage: EmbeddedImageUploader = async ({ alt, bytes, mimeType }) => {
  const extension = EXTENSION_BY_MIME[mimeType] ?? "bin";
  const filename = `embedded-${Date.now()}-${Math.round(Math.random() * 1e6)}.${extension}`;
  const file = new File([new Blob([new Uint8Array(bytes)], { type: mimeType })], filename, {
    type: mimeType,
  });

  // Same cap as the other two upload paths. An imported document's images
  // are as likely to be full-size camera output as a member's own, and they
  // are billed against the same quota by the same hook.
  const shrunk = await downscaleImage(file);

  const body = new FormData();
  body.set("file", shrunk);
  body.set("_payload", JSON.stringify({ alt }));

  const response = await fetch("/api/media", {
    method: "POST",
    credentials: "same-origin",
    body,
  });
  if (!response.ok) {
    let message = "上傳失敗";
    try {
      const parsed = (await response.json()) as { errors?: { message?: string }[] };
      if (parsed.errors?.[0]?.message) message = parsed.errors[0].message;
    } catch {
      /* keep the default message */
    }
    throw new Error(message);
  }

  const created = (await response.json()) as { doc: { id: number } };

  // Best-effort, same as UploadDropzone: blurDataURL/dimensions/HEIC
  // conversion never blocks the upload from counting as done.
  fetch(`/api/members/media/${created.doc.id}/process-image`, {
    method: "POST",
    credentials: "same-origin",
  }).catch(() => {});

  return { id: created.doc.id };
};

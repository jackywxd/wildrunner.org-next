/**
 * Ask the server to transcode a freshly uploaded video.
 *
 * Called by the client right after the media document exists, exactly like
 * `processImage()` in upload-image.ts — and for the same documented reason:
 * post-upload work run inside a `media` afterChange hook reliably failed,
 * because a read of the object written moments earlier in the same request
 * came back null in both dev and production. See
 * `src/endpoints/processMediaImage.ts`'s header.
 *
 * Never throws. The upload has already succeeded by the time this runs, so a
 * transcoder that is down must not make a successful upload report as
 * failed. The row is left in whatever state the endpoint reached, and the
 * scheduled sweep picks up anything stuck.
 */
export async function requestTranscode(mediaId: number): Promise<void> {
  await fetch(`/api/members/media/${mediaId}/transcode`, {
    credentials: 'same-origin',
    method: 'POST',
  }).catch(() => {})
}

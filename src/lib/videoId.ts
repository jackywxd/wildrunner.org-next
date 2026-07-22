/** Derive a stable share-page id from a video filename. */
export function videoIdFromFilename(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, "");
  return stem
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[|/\\:_]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getVideoId(video: {
  filename: string;
  id?: string;
}): string {
  return video.id || videoIdFromFilename(video.filename);
}

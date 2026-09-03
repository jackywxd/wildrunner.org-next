/**
 * The upload queue's own arithmetic, with no browser in it.
 *
 * Extracted from the panel because these are the two things the old uploader
 * got wrong and nothing could see: what happens when a second batch arrives,
 * and what the member is told at the end.
 *
 * Everything here is pure and takes `File` objects, which Node has natively —
 * so the unit lane exercises it directly, without a server or a page.
 */

export type UploadStatus =
  | "queued"
  | "checking"
  | "uploading"
  | "saving"
  | "done"
  | "duplicate"
  | "error";

export type QueueItem = {
  file: File;
  status: UploadStatus;
  percent: number;
  message: string;
};

/**
 * What makes two picks the same file.
 *
 * Name, size and modification time — the three things a browser gives away
 * for free about a `File`. Not content: reading forty photos to hash them
 * before anything is even queued would cost more than the mistake it
 * prevents, and the real duplicate check already happens per file against the
 * library (`findDuplicateUpload`) with a proper fingerprint.
 *
 * This one is narrower on purpose: it stops the *same pick* appearing twice
 * in one queue, which is what happens when somebody drops a folder, sees it
 * land, and drops it again because they were not sure it worked.
 */
export function fileKey(file: File): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

/**
 * Add a pick to the queue.
 *
 * APPEND, NOT REPLACE, AND THAT IS THE BUG THIS FIXES. The old uploader did
 * `setItems(Array.from(files).map(...))`, so dropping a second batch silently
 * discarded the first — a member selecting from two folders lost the first
 * one with nothing on screen to say so. The file picker behaves that way
 * because a picker's value *is* the selection; a drop target is not a
 * selection, it is an addition, and the two were sharing one handler.
 *
 * Files already in the queue are dropped rather than duplicated. An item that
 * has already been uploaded stays in the list with its `done` status — the
 * summary counts it, and re-picking it does not queue a second copy.
 */
export function mergeFiles(existing: QueueItem[], picked: File[]): QueueItem[] {
  const seen = new Set(existing.map((item) => fileKey(item.file)));
  const added: QueueItem[] = [];
  for (const file of picked) {
    const key = fileKey(file);
    if (seen.has(key)) continue;
    seen.add(key);
    added.push({ file, status: "queued", percent: 0, message: "" });
  }
  return added.length === 0 ? existing : [...existing, ...added];
}

export type QueueSummary = {
  total: number;
  /** Uploaded and stored. */
  done: number;
  /** Already in the member's library; nothing was uploaded for these. */
  duplicate: number;
  /** Tried and refused — each one carries its own reason. */
  error: number;
  /** Not attempted yet, or cancelled back into the queue. */
  pending: number;
  /** Bytes of everything in the list, for the "12 files · 84 MB" line. */
  bytes: number;
  /** Whether anything is mid-flight, which is what disables the controls. */
  active: boolean;
};

/**
 * What the member is told, in one place.
 *
 * The old uploader ended with a list of rows reading 完成 and no total at all,
 * so "did that work?" had to be answered by counting. Three outcomes are
 * genuinely different and each needs its own number: stored, skipped because
 * it was already there, and refused.
 */
export function summarise(items: QueueItem[]): QueueSummary {
  const summary: QueueSummary = {
    total: items.length,
    done: 0,
    duplicate: 0,
    error: 0,
    pending: 0,
    bytes: 0,
    active: false,
  };
  for (const item of items) {
    summary.bytes += item.file.size;
    if (item.status === "done") summary.done += 1;
    else if (item.status === "duplicate") summary.duplicate += 1;
    else if (item.status === "error") summary.error += 1;
    else if (item.status === "queued") summary.pending += 1;
    else {
      // checking / uploading / saving — in flight, and therefore also not yet
      // an outcome. Counted as pending so the totals always add up to `total`.
      summary.pending += 1;
      summary.active = true;
    }
  }
  return summary;
}

/**
 * Whether the run has finished and produced something worth reporting.
 *
 * Not `!active`: a queue nobody has started is also inactive, and showing a
 * result panel over an untouched list would be a report about nothing.
 */
export function isFinished(summary: QueueSummary): boolean {
  return (
    !summary.active &&
    summary.pending === 0 &&
    summary.total > 0 &&
    summary.done + summary.duplicate + summary.error === summary.total
  );
}

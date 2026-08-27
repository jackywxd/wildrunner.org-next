/**
 * What a member is told about a video's transcode.
 *
 * The point of this feature is that nobody waits: the upload finishes as
 * soon as the file is in R2, and the H.264 1080p conversion happens minutes
 * later in a container. That is only a good trade if the state is visible
 * somewhere afterwards — otherwise "we are working on it" and "this quietly
 * failed three sweeps ago" look identical, which is the same class of
 * silence AGENTS.md keeps warning about.
 *
 * `done` and `skipped` deliberately show nothing in the grid. The result of
 * a finished transcode is that the video simply plays — `transcodeResult`
 * repoints `media.url` at the new file — so a badge on every video the
 * member has ever uploaded would be a permanent label announcing that
 * nothing is wrong. Only the states that are still moving, or that need the
 * member to do something, earn a badge.
 */
type TranscodeRow = {
  mimeType?: string | null;
  transcodeStatus?: string | null;
};

export type TranscodeTone = "pending" | "failed";

export function transcodeBadge(
  item: TranscodeRow,
): { label: string; tone: TranscodeTone } | null {
  if (!item.mimeType?.startsWith("video/")) return null;

  switch (item.transcodeStatus) {
    case "queued":
      return { label: "等待轉檔", tone: "pending" };
    case "running":
      return { label: "轉檔中", tone: "pending" };
    case "failed":
      return { label: "轉檔失敗", tone: "failed" };
    default:
      return null;
  }
}

export function TranscodeBadge({ item }: { item: TranscodeRow }) {
  const badge = transcodeBadge(item);
  if (!badge) return null;

  return (
    <span
      data-testid="transcode-badge"
      data-tone={badge.tone}
      className={`absolute left-1 top-1 px-1.5 py-0.5 text-[10px] leading-none ${
        badge.tone === "failed"
          ? "bg-destructive text-destructive-foreground"
          : "bg-foreground/70 text-background"
      }`}
    >
      {badge.label}
    </span>
  );
}

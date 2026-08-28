/**
 * The one sentence a member gets about a video's conversion.
 *
 * Lives in lib rather than inside the dialog so it can be unit-tested. That
 * is not ceremony: `skipped` shipped without a case of its own and fell
 * through to the HEVC warning, telling a member their video might not play
 * in Chrome — the exact opposite of what `skipped` means, which is that the
 * container probed the file and found it ALREADY h264/<=1080p/yuv420p.
 * Wrong copy renders exactly as confidently as right copy, so nothing on
 * screen catches it.
 *
 * Spelled out rather than reusing the grid badge because this is the screen
 * where the member has time to read: the badge answers "is something
 * happening", this answers "do I need to do anything".
 */
export function transcodeNote(status: string | null | undefined): string {
  switch (status) {
    case "queued":
    case "running":
      // The HEVC caveat is carried here rather than in a paragraph of its
      // own: before the transcode lands, the file is still exactly what the
      // phone recorded, so the warning is as true as ever — and once it
      // lands, `done` below replaces it rather than contradicting it.
      return "影片正在轉為 1080p H.264，完成後會自動替換，你不需要等待或重新上傳。在那之前，部分手機錄製的影片（HEVC 編碼）在 Chrome/Firefox 可能無法播放。";
    case "failed":
      return "影片轉檔失敗，原始檔案仍然保留。可以按下方「重新轉檔」再試一次，或重新上傳。";
    case "done":
      return "已轉為 1080p H.264，手機與桌面瀏覽器都能播放。";
    case "skipped":
      return "這支影片本來就是 1080p H.264，不需要轉檔，手機與桌面瀏覽器都能播放。";
    default:
      return "部分手機錄製的影片（HEVC 編碼）可能無法在 Chrome/Firefox 播放，Safari 或 QuickTime 不受影響。";
  }
}

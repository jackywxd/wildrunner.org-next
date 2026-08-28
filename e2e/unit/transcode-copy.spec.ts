/**
 * What a member is told about their video's conversion.
 *
 * Copy is worth a test only when it can be confidently wrong, and this can:
 * `skipped` shipped falling through to the HEVC warning, which told members
 * whose video was ALREADY h264/1080p that it might not play in Chrome. That
 * renders exactly as convincingly as the correct sentence, so no amount of
 * looking at the screen catches it — only asserting the meaning does.
 *
 * `@playwright/test` rather than `../helpers/test`: nothing here touches
 * `page`, and that helper's console-guard fixture depends on it.
 */
import { expect, test } from "@playwright/test";

import { transcodeNote } from "@/lib/media/transcode-copy";

// The caveat's marker, not a whole sentence. The two notes that carry it
// word it differently — "在 Chrome/Firefox 可能無法播放" while waiting,
// "可能無法在 Chrome/Firefox 播放" by default — and a full-sentence
// constant matched only one, so the control below went red for a wording
// difference rather than for the thing it exists to catch. This parenthetical
// appears in both and in no other note, which is exactly what is being
// asserted: is the caveat present or absent.
const HEVC_WARNING = "（HEVC 編碼）";

test.describe("U-TCOPY what a member is told about a transcode", () => {
  test("U-TCOPY-1: a skipped video is never warned about HEVC", () => {
    // The defect this exists for, stated as its opposite. `skipped` means
    // the container measured the file and found it already compliant, so
    // the warning is not merely unhelpful — it contradicts the measurement.
    const note = transcodeNote("skipped");

    expect(note).not.toContain(HEVC_WARNING);
    expect(note).toContain("本來就是 1080p H.264");
  });

  test("U-TCOPY-2: a finished transcode is not warned about HEVC either", () => {
    // Same shape: once converted, the file IS H.264, so the caveat would be
    // describing a state that no longer exists.
    expect(transcodeNote("done")).not.toContain(HEVC_WARNING);
  });

  test("U-TCOPY-3: a video still waiting DOES carry the caveat", () => {
    // The control. If every branch dropped the warning, the first two
    // assertions would pass while the note became useless for the one state
    // where the file really is whatever the phone recorded.
    expect(transcodeNote("queued")).toContain(HEVC_WARNING);
    expect(transcodeNote("running")).toContain(HEVC_WARNING);
  });

  test("U-TCOPY-4: an untouched video keeps the caveat, and failure explains itself", () => {
    // `null` is every video uploaded before this feature existed and every
    // photo — the caveat is the honest default there.
    expect(transcodeNote(null)).toContain(HEVC_WARNING);
    expect(transcodeNote(undefined)).toContain(HEVC_WARNING);

    // Failure has to point at the way out, since the retry button is the
    // only thing that resolves it without re-uploading.
    expect(transcodeNote("failed")).toContain("重新轉檔");
  });
});

import { expect, test } from "@playwright/test";

import { nextUsage } from "@/lib/media/usage";

/**
 * U-USAGE — what the media library's visibility checkbox may overwrite.
 *
 * The failure this pins is not hypothetical and was not caught by anything:
 * the first version of `MediaDetailDialog` wrote `showOnWall ? 'gallery' :
 * 'private'` unconditionally, so saving an article image after editing its
 * alt text silently reclassified it from `attachment` to `private`. Nothing
 * on screen changed, and the only visible consequence is months later —
 * `src/lib/media/unused.ts` can only sweep an `attachment`, so the file stops
 * being reclaimable forever.
 *
 * Pure, and unit-level rather than driven through the dialog, because what is
 * being asserted is the mapping itself: the dialog's job is to call this, and
 * a browser test would spend a minute proving the same three lines.
 */
test.describe("U-USAGE the visibility control's write rule", () => {
  test("U-USAGE-1: ticking the box publishes, whatever it was before", () => {
    // The one direction that may overwrite provenance. It is a member's
    // explicit click, so it is allowed to.
    expect(nextUsage("private", true)).toBe("gallery");
    expect(nextUsage("attachment", true)).toBe("gallery");
    expect(nextUsage("gallery", true)).toBe("gallery");
    expect(nextUsage(null, true)).toBe("gallery");
  });

  test("U-USAGE-2: unticking only ever takes a file off the wall", () => {
    expect(nextUsage("gallery", false)).toBe("private");
  });

  test("U-USAGE-3: unticking never rewrites a value the control does not own", () => {
    // `undefined` is "send no usage key", not "write undefined". An article
    // attachment opened for an alt-text fix has to come out the other side
    // still an attachment.
    expect(nextUsage("attachment", false)).toBeUndefined();
    expect(nextUsage("private", false)).toBeUndefined();
    // Unclassified, and a value that does not exist yet: both are left alone
    // rather than guessed at. This is what makes a fourth `usage` value safe
    // to add without auditing this control.
    expect(nextUsage(null, false)).toBeUndefined();
    expect(nextUsage("members-only" as never, false)).toBeUndefined();
  });
});

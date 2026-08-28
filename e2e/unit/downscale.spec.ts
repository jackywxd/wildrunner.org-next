import { expect, test } from "@playwright/test";

import { MAX_EDGE, targetSize } from "@/lib/media/downscale";

/**
 * U-DOWNSCALE — the arithmetic behind the upload-time image cap.
 *
 * Only `targetSize` is tested here, and that is the whole of what can be:
 * the rest of `downscale.ts` is `createImageBitmap`, a canvas and `toBlob`,
 * which are browser APIs rather than our logic. Asserting that a canvas
 * resizes an image would be testing Chromium.
 *
 * What IS ours is the decision — when to resize at all, what dimensions to
 * ask for, and the rounding. Each of those has a way to be wrong that no
 * type checks: returning dimensions for an image that needs none (which
 * re-encodes it for nothing), losing the aspect ratio, or rounding an edge
 * to zero and handing the browser a canvas it refuses.
 */

test.describe("U-DOWNSCALE image cap arithmetic", () => {
  test("U-DOWNSCALE-1: an image within the cap is left alone", () => {
    // Null, not the same dimensions. The caller treats null as "return the
    // original file untouched" — anything else spends a re-encode, and with
    // it some quality, to produce a file the same size it started.
    expect(targetSize(3000, 2000)).toBeNull();
    expect(targetSize(2000, 3000)).toBeNull();
    expect(targetSize(640, 480)).toBeNull();
    // Exactly at the cap is within it.
    expect(targetSize(MAX_EDGE, MAX_EDGE)).toBeNull();
  });

  test("U-DOWNSCALE-2: the long edge lands on the cap, whichever edge it is", () => {
    expect(targetSize(6000, 4000)).toEqual({ width: 3000, height: 2000 });
    // Portrait: height is the long edge, and the cap has to follow it
    // rather than always clamping width — a phone photo is portrait far
    // more often than not.
    expect(targetSize(4000, 6000)).toEqual({ width: 2000, height: 3000 });
  });

  test("U-DOWNSCALE-3: the aspect ratio survives an awkward ratio", () => {
    // 4032x3024 is what an iPhone's main camera produces, and 3:4 does not
    // divide evenly into 3000.
    const result = targetSize(4032, 3024);
    expect(result).not.toBeNull();
    expect(result!.width).toBe(3000);
    // 3024 * (3000/4032) = 2250 exactly; a rounding bug here shows up as a
    // stretched photo, not an error.
    expect(result!.height).toBe(2250);
  });

  test("U-DOWNSCALE-4: an extreme panorama keeps at least one pixel", () => {
    // 8000x2 scales its height to 0.75. Rounding that to 0 would produce a
    // zero-height canvas, which the browser rejects — turning a stitched
    // panorama into a failed upload.
    expect(targetSize(8000, 2)).toEqual({ width: 3000, height: 1 });
  });

  test("U-DOWNSCALE-5: dimensions that are not real numbers resize nothing", () => {
    // `createImageBitmap` should never hand these back, but the cost of
    // being wrong is asymmetric: a NaN reaching the canvas throws inside
    // the upload rather than skipping the resize.
    expect(targetSize(Number.NaN, 100)).toBeNull();
    expect(targetSize(Number.POSITIVE_INFINITY, 100)).toBeNull();
  });

  test("U-DOWNSCALE-6: the cap is a parameter, so it is the caller's number", () => {
    expect(targetSize(1000, 500, 400)).toEqual({ width: 400, height: 200 });
    expect(targetSize(1000, 500, 2000)).toBeNull();
  });
});

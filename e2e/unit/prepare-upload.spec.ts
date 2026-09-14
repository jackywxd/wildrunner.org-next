import { expect, test } from "@playwright/test";

import {
  isUnsupportedImage,
  prepareImageForUpload,
} from "@/lib/media/prepare-upload";

/**
 * U-PREP — what reaches R2, and what is turned away before it gets there.
 *
 * THE BUG THIS IS THE FIX FOR was silent in both directions. `Media.ts`
 * accepts `image/*` — every image format there is — while the site displays
 * about six. So a `.cr2` or a `.tif` uploaded successfully, consumed the
 * member's quota forever, and rendered as a broken image on every page it
 * appeared on, with nothing anywhere reporting a problem.
 *
 * `downscaleImage` is reached at the end of the happy path and needs a canvas
 * these tests do not have. That is not a gap: it returns the file untouched
 * when it cannot decode one, which is exactly what a Node run produces, so
 * what is asserted below is this module's own decisions.
 */

/** A TIFF header whose single IFD claims a JPEG at `offset` of `length`. */
function dngBytes(payload: number[]): Uint8Array<ArrayBuffer> {
  const entries = [
    [259, 3, 7], // Compression: JPEG
    [262, 3, 6], // PhotometricInterpretation: YCbCr
    [273, 4, 64], // StripOffsets
    [279, 4, payload.length], // StripByteCounts
  ] as const;

  const whole = new Uint8Array(64 + payload.length);
  const view = new DataView(whole.buffer);
  view.setUint16(0, 0x4949, false);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, entries.length, true);
  entries.forEach(([tag, type, value], index) => {
    const base = 10 + index * 12;
    view.setUint16(base, tag, true);
    view.setUint16(base + 2, type, true);
    view.setUint32(base + 4, 1, true);
    if (type === 3) view.setUint16(base + 8, value, true);
    else view.setUint32(base + 8, value, true);
  });
  whole.set(payload, 64);
  return whole;
}

test.describe("U-PREP what is allowed to become an upload", () => {
  test("U-PREP-1: a format the site cannot show is refused, and says which", async () => {
    // The member has to be able to act on this, so the message names the
    // format rather than saying the upload failed.
    await expect(
      prepareImageForUpload(new File(["x"], "a.tif", { type: "image/tiff" })),
    ).rejects.toThrow(/image\/tiff/);

    await expect(
      prepareImageForUpload(new File(["x"], "a.cr2", { type: "image/x-canon-cr2" })),
    ).rejects.toThrow(/無法顯示/);
  });

  test("U-PREP-2: a format the site can show passes through untouched", async () => {
    for (const type of [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/avif",
      "image/svg+xml",
      // Converted after upload rather than here, but still accepted.
      "image/heic",
    ]) {
      const file = new File(["x"], `a.${type.slice(6)}`, { type });
      expect((await prepareImageForUpload(file)).type, type).toBe(type);
    }
  });

  test("U-PREP-3: an unknown type is allowed through, on purpose", async () => {
    // Browsers report `""` for files they do not recognise, and which files
    // those are differs between them — iOS Safari has reported HEIC this way.
    // Refusing on "I do not know" would turn real photographs away on
    // whichever browser happens to be least informative.
    const file = new File(["x"], "mystery", { type: "" });
    expect((await prepareImageForUpload(file)).name).toBe("mystery");
  });

  test("U-PREP-4: ProRAW becomes its embedded JPEG before anything is uploaded", async () => {
    const file = new File([dngBytes([0xff, 0xd8, 0xff, 0xe0, 9, 9])], "IMG_7.dng", {
      type: "image/x-adobe-dng",
    });

    const prepared = await prepareImageForUpload(file);

    expect(prepared.type).toBe("image/jpeg");
    expect(prepared.name).toBe("IMG_7.jpg");
    // The point of doing this in the browser: what gets billed to the
    // member's quota and pushed over the network is the preview, not the raw.
    expect(prepared.size).toBeLessThan(file.size);
  });

  test("U-PREP-5: a RAW with no usable preview is refused, not stored broken", async () => {
    // The assumption this whole approach rests on is that Apple embeds a
    // full-size preview. This is what happens when that is wrong: the member
    // is told, and told what to do instead — rather than being given a file
    // that is broken on every page forever.
    const file = new File([dngBytes([0, 1, 2, 3])], "IMG_8.dng", {
      type: "image/x-adobe-dng",
    });

    await expect(prepareImageForUpload(file)).rejects.toThrow(/預覽圖/);
  });

  test("U-PREP-6: video is not this function's business", () => {
    // The gate only judges images. Video has its own path and its own
    // transcode, and a codec this cannot name is not one it should refuse.
    for (const type of ["video/quicktime", "video/mp4", "application/pdf"]) {
      expect(isUnsupportedImage(type), type).toBe(false);
    }
  });
});

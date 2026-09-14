import { expect, test } from "@playwright/test";

import {
  extractDngPreview,
  findEmbeddedJpeg,
  looksLikeDng,
} from "@/lib/media/dng-preview";

/**
 * U-DNG — finding the picture already inside a ProRAW file.
 *
 * WHY THESE ARE SYNTHETIC TIFFs AND WHAT THAT DOES NOT PROVE. This was
 * written without a real Apple ProRAW to read, so these build the structures
 * by hand. That tests the parser — given these tags at these offsets, does it
 * find the right bytes — and it does NOT prove that Apple's files are laid out
 * this way. The module's header says the same thing, and the guard that makes
 * the unproven half safe is `U-DNG-7`: bytes that are not a JPEG are refused
 * rather than uploaded.
 *
 * EVERY CASE HERE IS A WAY THE FILE CAN LIE. The offsets, lengths and counts
 * all come from the file itself, so a corrupt or hostile one can point
 * anywhere; the parser has to answer "no preview" rather than throw, hang, or
 * read past the end.
 */

const LITTLE = true;

type Entry = { tag: number; type: number; value: number | { ifd: number } };

/**
 * A TIFF with the given IFDs, laid out back to back after the header.
 *
 * Every value used here fits in the four bytes a directory entry carries, so
 * there is no out-of-line value block to model — which keeps the fixture
 * readable and is exactly how a real file stores these particular tags.
 */
function buildTiff(ifds: Entry[][], little = LITTLE): ArrayBuffer {
  const sizeOf = (entries: Entry[]) => 2 + entries.length * 12 + 4;
  const offsets: number[] = [];
  let cursor = 8;
  for (const entries of ifds) {
    offsets.push(cursor);
    cursor += sizeOf(entries);
  }

  const buffer = new ArrayBuffer(cursor);
  const view = new DataView(buffer);
  view.setUint16(0, little ? 0x4949 : 0x4d4d, false);
  view.setUint16(2, 42, little);
  view.setUint32(4, offsets[0], little);

  ifds.forEach((entries, index) => {
    const at = offsets[index];
    view.setUint16(at, entries.length, little);
    entries.forEach((entry, slot) => {
      const base = at + 2 + slot * 12;
      view.setUint16(base, entry.tag, little);
      view.setUint16(base + 2, entry.type, little);
      view.setUint32(base + 4, 1, little);
      const value =
        typeof entry.value === "number" ? entry.value : offsets[entry.value.ifd];
      if (entry.type === 3) view.setUint16(base + 8, value, little);
      else view.setUint32(base + 8, value, little);
    });
    view.setUint32(at + 2 + entries.length * 12, 0, little);
  });

  return buffer;
}

const SHORT = 3;
const LONG = 4;

/** A JPEG image directory: compression 7, YCbCr, one strip. */
const jpegIfd = (offset: number, length: number): Entry[] => [
  { tag: 259, type: SHORT, value: 7 },
  { tag: 262, type: SHORT, value: 6 },
  { tag: 273, type: LONG, value: offset },
  { tag: 279, type: LONG, value: length },
];

test.describe("U-DNG the preview inside a ProRAW file", () => {
  test("U-DNG-1: the largest embedded JPEG wins, wherever it is", () => {
    // IFD0 carries the thumbnail the DNG spec puts there, and the full-size
    // preview hangs off it in a sub-IFD. Taking the biggest is what lets this
    // work without knowing which slot a given camera used.
    const buffer = buildTiff([
      [...jpegIfd(5000, 4_000), { tag: 330, type: LONG, value: { ifd: 1 } }],
      jpegIfd(20_000, 3_000_000),
    ]);

    expect(findEmbeddedJpeg(buffer)).toEqual({ length: 3_000_000, offset: 20_000 });
  });

  test("U-DNG-2: the sensor mosaic is never mistaken for a picture", () => {
    // THE CASE THIS MODULE EXISTS TO GET RIGHT. Raw CFA data (photometric
    // 32803) is the biggest thing in the file by far, so a search that only
    // compared sizes would pick it every time — and hand a member a JPEG-named
    // file full of undemosaiced sensor readings.
    const buffer = buildTiff([
      [...jpegIfd(5000, 4_000), { tag: 330, type: LONG, value: { ifd: 1 } }],
      [
        { tag: 259, type: SHORT, value: 7 },
        { tag: 262, type: SHORT, value: 32803 },
        { tag: 273, type: LONG, value: 20_000 },
        { tag: 279, type: LONG, value: 40_000_000 },
      ],
    ]);

    expect(findEmbeddedJpeg(buffer)).toEqual({ length: 4_000, offset: 5000 });
  });

  test("U-DNG-3: an uncompressed preview is not a JPEG either", () => {
    // Compression 1 is raw bytes. Slicing them out and calling the result a
    // .jpg would produce a file nothing can open.
    const buffer = buildTiff([
      [
        { tag: 259, type: SHORT, value: 1 },
        { tag: 262, type: SHORT, value: 2 },
        { tag: 273, type: LONG, value: 900 },
        { tag: 279, type: LONG, value: 60_000 },
      ],
    ]);

    expect(findEmbeddedJpeg(buffer)).toBeNull();
  });

  test("U-DNG-4: big-endian files are read too", () => {
    // `MM` is legal TIFF and costs one branch to support. Getting it wrong
    // would not fail loudly — it would read plausible nonsense.
    const buffer = buildTiff([jpegIfd(7_000, 250_000)], false);

    expect(findEmbeddedJpeg(buffer)).toEqual({ length: 250_000, offset: 7_000 });
  });

  test("U-DNG-5: anything that is not a TIFF is simply not one", () => {
    for (const [what, bytes] of [
      ["empty", new ArrayBuffer(0)],
      ["too short to hold a header", new ArrayBuffer(4)],
      ["a JPEG, not a container", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]).buffer],
    ] as const) {
      expect(findEmbeddedJpeg(bytes), what).toBeNull();
    }
  });

  test("U-DNG-6: a file that points into nowhere does not crash the upload", () => {
    // Offsets and counts are numbers the file supplies about itself, so they
    // can point past the end — by corruption or on purpose. A member's upload
    // must not turn into an exception because of it.
    const buffer = buildTiff([jpegIfd(10, 100)]);
    const view = new DataView(buffer);
    view.setUint32(4, 0xffff_fff0, LITTLE); // IFD0 well past the end

    expect(findEmbeddedJpeg(buffer)).toBeNull();

    // And an IFD that points at itself must terminate rather than spin.
    const looping = buildTiff([
      [...jpegIfd(5000, 4_000), { tag: 330, type: LONG, value: { ifd: 0 } }],
    ]);
    expect(findEmbeddedJpeg(looping)).toEqual({ length: 4_000, offset: 5000 });
  });

  test("U-DNG-7: bytes that are not a JPEG are refused, not uploaded", async () => {
    // THE GUARD THAT MAKES THE UNVERIFIED HALF SAFE. Everything above is
    // arithmetic over what the file claims; this is the only step that asks
    // the bytes themselves. A layout this parser reads wrongly ends here, as
    // a refused upload, rather than as a corrupt file stored under a member's
    // name and rendered broken forever.
    const header = buildTiff([jpegIfd(64, 8)]);
    const whole = new Uint8Array(128);
    whole.set(new Uint8Array(header), 0);
    whole.set(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]), 64); // not a JPEG

    const file = new File([whole], "IMG_0042.dng", { type: "image/x-adobe-dng" });
    expect(await extractDngPreview(file)).toBeNull();
  });

  test("U-DNG-8: a real preview comes back as a named JPEG file", async () => {
    const header = buildTiff([jpegIfd(64, 8)]);
    const whole = new Uint8Array(128);
    whole.set(new Uint8Array(header), 0);
    whole.set(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]), 64);

    const preview = await extractDngPreview(
      new File([whole], "IMG_0042.DNG", { type: "" }),
    );

    expect(preview).not.toBeNull();
    // The name matters: it is what the member sees in their library, and what
    // `timestampedName` and the alt text are derived from downstream.
    expect(preview?.name).toBe("IMG_0042.jpg");
    expect(preview?.type).toBe("image/jpeg");
    expect(preview?.size).toBe(8);
  });

  test("U-DNG-9: .dng is recognised whatever the browser calls it", () => {
    // Chrome says image/x-adobe-dng, other browsers say nothing at all, and
    // some say image/tiff — so the type a File carries cannot be the test.
    for (const type of ["image/x-adobe-dng", "", "image/tiff"]) {
      expect(looksLikeDng(new File([], "IMG_1.dng", { type })), type).toBe(true);
    }
    expect(looksLikeDng(new File([], "IMG_1.DNG"))).toBe(true);
    expect(looksLikeDng(new File([], "photo.jpg"))).toBe(false);
    // Not a `.dng` merely because the name mentions one.
    expect(looksLikeDng(new File([], "dng-notes.txt"))).toBe(false);
  });
});

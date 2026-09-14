/**
 * Pull the full-size JPEG that an Apple ProRAW `.dng` already carries inside
 * it, in the browser, before a byte is uploaded.
 *
 * WHY NOT DECODE THE RAW. A `.dng` is a TIFF container holding sensor data —
 * a colour-filter-array mosaic that has to be demosaiced, white-balanced and
 * tone-mapped before it is a picture. No browser does that, and the library
 * that would (LibRaw, as WASM) is megabytes of decoder to produce an image
 * this site then immediately downscales to 3000px. But a DNG is required to
 * carry a rendered preview alongside the mosaic, and Apple's are full
 * resolution — so the picture is already in the file, as ordinary JPEG bytes.
 * Finding it is TIFF tag arithmetic, not image processing.
 *
 * WHY THE BROWSER AND NOT THE WORKER. Three independent reasons, each of
 * which alone would decide it:
 *
 *   - `Media.ts` says it outright: no sharp on Workers, which is why `crop`
 *     and `focalPoint` are off there.
 *   - `processMediaImage.ts` caps its input at 20 MB. A ProRAW frame is
 *     25-75 MB, so the conversion would refuse the very files it is for.
 *   - A file over `DIRECT_UPLOAD_THRESHOLD` (32 MB) never reaches the Worker
 *     at all — the browser writes it straight to R2.
 *
 * Doing it here also means a member uploads the ~3 MB preview instead of the
 * ~40 MB original, so ProRAW stops costing them thirteen times the quota of
 * the same photograph shot as JPEG.
 *
 * WHAT IS NOT VERIFIED, stated plainly because it decides how this fails.
 * This was written without a real ProRAW file to read — the sandbox could
 * not fetch one — so "Apple embeds a full-resolution preview, in this tag
 * layout" is an assumption, not a measurement. Two things contain it:
 *
 *   - the search takes the LARGEST JPEG in any IFD rather than looking in
 *     the one place a spec says it should be, so a different-but-reasonable
 *     layout still works;
 *   - the bytes are checked for a JPEG start-of-image marker before they are
 *     handed on, so a wrong guess produces `null` — a refused upload with a
 *     reason — and never a corrupt file stored under a member's name.
 */

/** TIFF tags this reads. Everything else in the file is ignored. */
const TAG_COMPRESSION = 259;
const TAG_PHOTOMETRIC = 262;
const TAG_STRIP_OFFSETS = 273;
const TAG_STRIP_BYTE_COUNTS = 279;
const TAG_SUB_IFDS = 330;
const TAG_JPEG_OFFSET = 513;
const TAG_JPEG_LENGTH = 514;

/** `Compression`: 6 is the retired JPEG code, 7 the one in use. */
const JPEG_COMPRESSIONS = new Set([6, 7]);

/**
 * `PhotometricInterpretation` values that mean "a picture".
 *
 * This is the check that keeps the sensor mosaic out: raw CFA data is 32803
 * and linear raw is 34892, and neither is something a browser can show. A
 * preview is RGB (2) or YCbCr (6).
 */
const RENDERED_PHOTOMETRICS = new Set([2, 6]);

/**
 * How much of the file is read to find the offsets.
 *
 * The IFD chain of a DNG sits in its first pages; the *image* data is what
 * makes the file large. Reading a megabyte to learn where the preview starts,
 * then reading only the preview, keeps a 40 MB file from being pulled into a
 * phone's memory in one piece. An IFD that points beyond this is treated as
 * not found rather than chased — see the header on failing safe.
 */
const HEAD_BYTES = 1024 * 1024;

/** Enough IFDs for any real file; a cap so a malformed one cannot spin. */
const MAX_IFDS = 64;

type Candidate = { length: number; offset: number };

function readValues(
  view: DataView,
  type: number,
  count: number,
  valueOffset: number,
  little: boolean,
): number[] {
  const width = type === 3 ? 2 : type === 4 ? 4 : type === 1 ? 1 : 0;
  if (width === 0) return [];

  // Values up to four bytes live in the entry itself; longer ones are stored
  // elsewhere and the entry holds their offset.
  const inline = width * count <= 4;
  const base = inline ? valueOffset : view.getUint32(valueOffset, little);

  const out: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const at = base + index * width;
    if (at + width > view.byteLength) return [];
    out.push(
      width === 1
        ? view.getUint8(at)
        : width === 2
          ? view.getUint16(at, little)
          : view.getUint32(at, little),
    );
  }
  return out;
}

/**
 * The largest embedded JPEG this file claims to contain, as a byte range.
 *
 * Pure, and separate from any `File`, so every branch below can be tested
 * without a browser: the offsets it returns are absolute positions in the
 * whole file, which is what lets the caller read just that slice.
 *
 * Returns null for anything it cannot make sense of. There is no error path
 * on purpose — a file that is not a DNG, is truncated, or is laid out in a
 * way this does not understand is all one answer to the caller: no preview.
 */
export function findEmbeddedJpeg(head: ArrayBuffer): Candidate | null {
  if (head.byteLength < 8) return null;
  const view = new DataView(head);

  const byteOrder = view.getUint16(0, false);
  if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return null;
  const little = byteOrder === 0x4949;

  if (view.getUint16(2, little) !== 42) return null;

  const candidates: Candidate[] = [];
  const queue: number[] = [view.getUint32(4, little)];
  const seen = new Set<number>();

  while (queue.length > 0 && seen.size < MAX_IFDS) {
    const ifdOffset = queue.shift();
    if (ifdOffset === undefined || seen.has(ifdOffset)) continue;
    seen.add(ifdOffset);
    if (ifdOffset + 2 > view.byteLength) continue;

    const entries = view.getUint16(ifdOffset, little);
    const end = ifdOffset + 2 + entries * 12;
    if (entries === 0 || end + 4 > view.byteLength) continue;

    let compression = 0;
    let photometric = -1;
    let stripOffsets: number[] = [];
    let stripCounts: number[] = [];
    let jpegOffset = 0;
    let jpegLength = 0;

    for (let index = 0; index < entries; index += 1) {
      const entry = ifdOffset + 2 + index * 12;
      const tag = view.getUint16(entry, little);
      const type = view.getUint16(entry + 2, little);
      const count = view.getUint32(entry + 4, little);
      const valueAt = entry + 8;

      switch (tag) {
        case TAG_COMPRESSION:
          compression = readValues(view, type, count, valueAt, little)[0] ?? 0;
          break;
        case TAG_PHOTOMETRIC:
          photometric = readValues(view, type, count, valueAt, little)[0] ?? -1;
          break;
        case TAG_STRIP_OFFSETS:
          stripOffsets = readValues(view, type, count, valueAt, little);
          break;
        case TAG_STRIP_BYTE_COUNTS:
          stripCounts = readValues(view, type, count, valueAt, little);
          break;
        case TAG_JPEG_OFFSET:
          jpegOffset = readValues(view, type, count, valueAt, little)[0] ?? 0;
          break;
        case TAG_JPEG_LENGTH:
          jpegLength = readValues(view, type, count, valueAt, little)[0] ?? 0;
          break;
        case TAG_SUB_IFDS:
          // Where the full-size images live: the DNG spec puts a thumbnail in
          // IFD0 and everything else — the mosaic, and the preview this is
          // looking for — in sub-IFDs hanging off it.
          for (const sub of readValues(view, type, count, valueAt, little)) {
            queue.push(sub);
          }
          break;
        default:
          break;
      }
    }

    // The next IFD in the chain. DNG uses sub-IFDs rather than this, but a
    // file is free to use both and following it costs one read.
    const next = view.getUint32(end, little);
    if (next !== 0) queue.push(next);

    if (!JPEG_COMPRESSIONS.has(compression)) continue;
    if (!RENDERED_PHOTOMETRICS.has(photometric)) continue;

    // A preview is written as one strip. Anything tiled or split is not the
    // contiguous JPEG this needs and is skipped rather than stitched.
    if (jpegOffset > 0 && jpegLength > 0) {
      candidates.push({ length: jpegLength, offset: jpegOffset });
    } else if (stripOffsets.length === 1 && stripCounts.length === 1) {
      candidates.push({ length: stripCounts[0], offset: stripOffsets[0] });
    }
  }

  if (candidates.length === 0) return null;

  // Largest wins. IFD0's thumbnail is a few kilobytes and the full-size
  // preview is megabytes, so this picks the one worth uploading without
  // needing to know which IFD a given camera put it in.
  return candidates.reduce((best, one) => (one.length > best.length ? one : best));
}

/** `IMG_0042.dng` -> `IMG_0042.jpg`. */
function asJpegName(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return `${dot > 0 ? filename.slice(0, dot) : filename}.jpg`;
}

/**
 * Whether this file is worth looking inside.
 *
 * BY EXTENSION, NOT BY MIME TYPE. Browsers disagree about what a `.dng` is —
 * Chrome reports `image/x-adobe-dng`, others an empty string, and some
 * `image/tiff` — so the type a `File` carries cannot be the test. The
 * extension is what the member's camera wrote and what every one of them
 * agrees on; `findEmbeddedJpeg` then rejects anything that is not actually a
 * TIFF, which is the real check.
 */
export function looksLikeDng(file: File): boolean {
  return /\.dng$/i.test(file.name);
}

/**
 * The embedded preview as a JPEG `File`, or null if there is not one.
 *
 * Null is a real answer and callers must handle it: it means this file cannot
 * become something the site can display, and the upload should be refused
 * with that reason rather than stored.
 */
export async function extractDngPreview(file: File): Promise<File | null> {
  try {
    const found = findEmbeddedJpeg(await file.slice(0, HEAD_BYTES).arrayBuffer());
    if (!found || found.length <= 0) return null;
    if (found.offset + found.length > file.size) return null;

    const bytes = await file.slice(found.offset, found.offset + found.length).arrayBuffer();

    // The one check that makes a wrong guess safe. Everything above is
    // arithmetic over numbers the file supplied about itself; this asks the
    // bytes whether they are in fact a JPEG.
    const marker = new Uint8Array(bytes, 0, Math.min(3, bytes.byteLength));
    if (marker[0] !== 0xff || marker[1] !== 0xd8 || marker[2] !== 0xff) return null;

    return new File([bytes], asJpegName(file.name), {
      lastModified: file.lastModified,
      type: "image/jpeg",
    });
  } catch {
    return null;
  }
}

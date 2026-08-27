/**
 * How a repeat upload is recognised.
 *
 * Worth unit tests because the failure is silent in both directions: a
 * fingerprint that collides too easily refuses a member's genuinely new
 * video, and one that never matches lets the duplicates through while
 * looking like it works. Neither shows up on screen.
 *
 * `@playwright/test` rather than `../helpers/test`: nothing here touches
 * `page`, and that helper's console-guard fixture depends on it.
 */
import { expect, test } from "@playwright/test";

import {
  FINGERPRINT_EDGE_BYTES,
  edgeRanges,
  fingerprintFile,
  fingerprintFrom,
  hex,
} from "@/lib/media/fingerprint";

/** Stands in for a File: the module only ever calls `.size` and `.slice`. */
function fakeFile(bytes: Uint8Array) {
  return {
    size: bytes.byteLength,
    slice: (start: number, end: number) =>
      new Blob([bytes.slice(start, end) as unknown as BlobPart]),
  };
}

function filled(size: number, seed: number) {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = (i * 31 + seed) % 251;
  return bytes;
}

test.describe("U-FINGERPRINT recognising a repeat upload", () => {
  test("U-FINGERPRINT-1: a small file is read whole, a large one only at its edges", () => {
    // The reason this feature is usable from a phone at all. The corpus's
    // largest video is 1.17 GB; reading it whole to hash it is exactly what
    // mobile Safari will not do.
    expect(edgeRanges(1000)).toEqual([{ start: 0, end: 1000 }]);

    const huge = 2 * 1024 * 1024 * 1024;
    const ranges = edgeRanges(huge);
    expect(ranges).toEqual([
      { start: 0, end: FINGERPRINT_EDGE_BYTES },
      { start: huge - FINGERPRINT_EDGE_BYTES, end: huge },
    ]);
    const read = ranges.reduce((sum, r) => sum + (r.end - r.start), 0);
    expect(read).toBe(2 * FINGERPRINT_EDGE_BYTES);
  });

  test("U-FINGERPRINT-2: the boundary does not read the same bytes twice", () => {
    // At exactly two edges the ranges would meet; one byte more and they
    // must not overlap, or a file would be hashed with a duplicated middle.
    expect(edgeRanges(FINGERPRINT_EDGE_BYTES * 2)).toHaveLength(1);

    const justOver = FINGERPRINT_EDGE_BYTES * 2 + 1;
    const ranges = edgeRanges(justOver);
    expect(ranges).toHaveLength(2);
    expect(ranges[0].end).toBeLessThanOrEqual(ranges[1].start);
  });

  test("U-FINGERPRINT-3: size is part of the value", () => {
    // Two files can share an edge digest — a truncated copy shares its whole
    // head. Size is what separates them, and it is in the string rather than
    // a second column so one equality check answers the question.
    expect(fingerprintFrom(100, "abc")).not.toBe(fingerprintFrom(200, "abc"));
    expect(fingerprintFrom(100, "abc")).toBe(fingerprintFrom(100, "abc"));
  });

  test("U-FINGERPRINT-4: the same bytes fingerprint the same, different bytes differ", async () => {
    // The whole feature in one assertion: picking the same file twice has to
    // produce the same value, and two different videos must not collide.
    const a = filled(4096, 1);
    const b = filled(4096, 2);

    const first = await fingerprintFile(fakeFile(a));
    const again = await fingerprintFile(fakeFile(a));
    const other = await fingerprintFile(fakeFile(b));

    expect(first).not.toBeNull();
    expect(again).toBe(first);
    expect(other).not.toBe(first);
  });

  test("U-FINGERPRINT-5: a file that cannot be read yields null, never a throw", async () => {
    // Null means "upload without the check". Losing duplicate detection is a
    // much smaller failure than a member being unable to add media, so every
    // path that can go wrong has to return rather than raise.
    const unreadable = {
      size: 10,
      slice: () => {
        throw new Error("read failed");
      },
    };
    await expect(fingerprintFile(unreadable)).resolves.toBeNull();
  });

  test("U-FINGERPRINT-6: hex renders every byte as two characters", () => {
    // A byte below 0x10 losing its leading zero would shift every character
    // after it, so two different files could render the same string.
    expect(hex(new Uint8Array([0, 1, 15, 16, 255]).buffer)).toBe("00010f10ff");
  });
});

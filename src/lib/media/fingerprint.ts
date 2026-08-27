/**
 * Recognising a file the member has already uploaded.
 *
 * NOT a hash of the whole file, deliberately. `crypto.subtle.digest` needs
 * the entire contents in memory as one ArrayBuffer, and this feature exists
 * to be used from a phone — the corpus's largest video is 1.17 GB, which
 * mobile Safari will not hand out as a single buffer. Reading a fixed 1 MB
 * from each end costs the same 2 MB whether the file is 20 MB or 2 GB.
 *
 * Size is part of the value rather than a separate column so a single
 * equality check answers the question. Two *different* videos that share a
 * byte-exact size AND a byte-exact first and last megabyte is not a case
 * worth engineering around: container metadata, timestamps and the final
 * frames all live in those regions.
 *
 * What this does NOT claim to be is a content hash. A re-encode of the same
 * footage produces a different fingerprint, correctly — it is a different
 * file. The question being answered is "have I uploaded this exact file
 * before", which is what a member picking the same thing twice does.
 */

/** How much is read from each end. Both ends, because some formats put the
 *  moov atom at the front and others at the back — reading only the head
 *  would call two different exports of the same clip identical. */
export const FINGERPRINT_EDGE_BYTES = 1024 * 1024;

export function fingerprintFrom(size: number, edgeDigestHex: string): string {
  return `${size}-${edgeDigestHex}`;
}

/** Byte ranges to read for a file of this size: both ends, or the whole
 *  file when it is smaller than two edges and slicing twice would overlap. */
export function edgeRanges(size: number): { start: number; end: number }[] {
  if (size <= FINGERPRINT_EDGE_BYTES * 2) return [{ start: 0, end: size }];
  return [
    { start: 0, end: FINGERPRINT_EDGE_BYTES },
    { start: size - FINGERPRINT_EDGE_BYTES, end: size },
  ];
}

export function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Never throws. A browser without `crypto.subtle` (or a page not in a secure
 * context) returns null, and the caller uploads without the check rather
 * than refusing to upload at all — losing duplicate detection is a much
 * smaller failure than losing the ability to add media.
 */
export async function fingerprintFile(file: {
  size: number;
  slice: (start: number, end: number) => Blob;
}): Promise<string | null> {
  try {
    if (!globalThis.crypto?.subtle) return null;

    const parts = await Promise.all(
      edgeRanges(file.size).map(async (range) =>
        new Uint8Array(await file.slice(range.start, range.end).arrayBuffer()),
      ),
    );

    const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
    const joined = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      joined.set(part, offset);
      offset += part.byteLength;
    }

    const digest = await globalThis.crypto.subtle.digest("SHA-256", joined);
    return fingerprintFrom(file.size, hex(digest));
  } catch {
    return null;
  }
}

import { fingerprintFile } from "@/lib/media/fingerprint";

export type DuplicateMatch = {
  /** The fingerprint of the file that was checked, so the caller can store
   *  it on the document it is about to create rather than computing twice. */
  fingerprint: string | null;
  /** The media already holding that fingerprint, if any. */
  existing: { alt: string; id: number } | null;
};

/**
 * Ask whether this member has already uploaded this exact file.
 *
 * Runs BEFORE any bytes are sent, which is the whole point — a member who
 * picked the same 400 MB clip twice should not have to wait for it to
 * upload before being told.
 *
 * Access control does the scoping for free: `ownedOnlyPublicRead` on media
 * limits a signed-in member's reads to their own rows, so this never reports
 * a collision with somebody else's upload. (An admin sees everything, and
 * for an admin that is the useful answer.)
 *
 * Never throws, and a failure means "no duplicate". Every branch that can go
 * wrong here — no `crypto.subtle`, an offline moment, a slow query — is a
 * reason to let the upload proceed unchecked, not to block a member from
 * adding media at all.
 */
export async function findDuplicateUpload(file: File): Promise<DuplicateMatch> {
  const fingerprint = await fingerprintFile(file);
  if (!fingerprint) return { existing: null, fingerprint: null };

  try {
    const query = new URLSearchParams({
      depth: "0",
      limit: "1",
      "where[contentFingerprint][equals]": fingerprint,
    });
    const response = await fetch(`/api/media?${query}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) return { existing: null, fingerprint };

    const body = (await response.json()) as {
      docs?: { alt?: string; id: number }[];
    };
    const hit = body.docs?.[0];
    return {
      existing: hit ? { alt: hit.alt ?? `媒體 ${hit.id}`, id: hit.id } : null,
      fingerprint,
    };
  } catch {
    return { existing: null, fingerprint };
  }
}

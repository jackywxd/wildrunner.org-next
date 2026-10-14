/**
 * The only comparison UltraSignup names and catalogue names share.
 *
 * Exact after this function, never "close". A near miss has already been
 * the wrong race often enough (see docs/race-data-sources.md) that a score
 * would import finishes the member did not run. `Western States Endurance
 * Run` and `Western States 100` stay different on purpose; an admin alias
 * is how those two meet.
 *
 * Accents go. UltraSignup prints "Tor des Geants" and "Quebec" where the
 * catalogue has "Tor des Géants" and "Québec"; a letter with its mark and
 * without it are one name to every runner who typed either.
 *
 * The marks go BEFORE `NFKD`: compatibility decomposition rewrites `™` as
 * the two letters `TM`, which no later step can tell from a word, and
 * "Western States™" would come out as "western statestm".
 */
export function normalizeRaceName(input: string): string {
  return input
    .replace(/[®™]/g, "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ by utmb$/, "");
}

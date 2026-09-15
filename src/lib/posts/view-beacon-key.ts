/**
 * Which articles this browser session has already reported.
 *
 * SEPARATE FROM THE COMPONENT so the rule can be asserted without a browser.
 * The component is four lines of `useEffect` around these two functions; what
 * is worth testing is that a second visit to the same article is recognised
 * and a visit to a different one is not, and that a browser refusing storage
 * degrades to "report it" rather than to a thrown error on a public page.
 */

const PREFIX = "wr:viewed:";

export function viewedKey(postId: number): string {
  return `${PREFIX}${postId}`;
}

/**
 * Whether this session has already reported `postId`, and mark it if not.
 *
 * Returns true when the caller should send the beacon.
 *
 * EVERY ACCESS IS WRAPPED, and not defensively-in-general: `sessionStorage`
 * does not merely return null when a browser refuses it, it *throws* on the
 * property access — a Safari private window and a "block all site data"
 * setting both do. This runs on a public article page, and the console guard
 * in `e2e/helpers/test.ts` fails any spec whose page logs an error, so an
 * unguarded read here would be a red suite on the pages that matter most.
 *
 * THE FALLBACK IS "REPORT IT", deliberately. A browser that cannot remember
 * will report on every page load, which over-counts a reader who refreshes.
 * The alternative — treating a storage failure as "already reported" — would
 * silently count nothing at all for those readers, and a number that is quietly
 * too low is worse than one that is visibly a little high, because nothing
 * about it looks wrong.
 */
export function shouldReportView(
  storage: Pick<Storage, "getItem" | "setItem"> | null,
  postId: number,
): boolean {
  if (!storage) return true;

  const key = viewedKey(postId);
  try {
    if (storage.getItem(key) !== null) return false;
    storage.setItem(key, "1");
    return true;
  } catch {
    // Reading succeeded and writing failed (a full quota), or neither worked.
    // Either way this session cannot remember, so it reports.
    return true;
  }
}

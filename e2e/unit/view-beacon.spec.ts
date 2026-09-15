import { expect, test } from "@playwright/test";

import { shouldReportView, viewedKey } from "@/lib/posts/view-beacon-key";

/**
 * U-VIEWS — which page loads count as a read.
 *
 * The de-duplication lives in the browser because the endpoint is anonymous:
 * limiting an anonymous caller server-side means storing something that
 * identifies them, and a per-viewer identifier is the one thing this feature
 * has no other reason to collect. So this rule is the whole of the accuracy
 * story, and it is worth asserting where it costs milliseconds.
 *
 * `sessionStorage` IS NOT A SAFE OBJECT. It does not return null when a
 * browser refuses it — the property access throws, in a Safari private window
 * and under "block all site data". This runs on a public article page, and
 * `e2e/helpers/test.ts` fails any spec whose page logs an error, so an
 * unguarded access would be a red suite on the most-visited pages rather than
 * a missing number.
 */

/** A storage that works. */
function workingStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    size: () => map.size,
  };
}

test.describe("U-VIEWS reporting a read", () => {
  test("U-VIEWS-1: the first load of an article reports, the second does not", () => {
    const storage = workingStorage();
    expect(shouldReportView(storage, 42)).toBe(true);
    expect(shouldReportView(storage, 42)).toBe(false);
    expect(shouldReportView(storage, 42)).toBe(false);
  });

  test("U-VIEWS-2: each article is remembered separately", () => {
    // The bug a single "seen" flag would cause: reading one article would
    // silence the count for every other one in the same session.
    const storage = workingStorage();
    expect(shouldReportView(storage, 1)).toBe(true);
    expect(shouldReportView(storage, 2)).toBe(true);
    expect(shouldReportView(storage, 1)).toBe(false);
    expect(shouldReportView(storage, 2)).toBe(false);
    expect(shouldReportView(storage, 3)).toBe(true);
  });

  test("U-VIEWS-3: keys are namespaced, so nothing else in storage collides", () => {
    // sessionStorage is one flat namespace shared with everything else the
    // origin stores. A bare `"42"` key would be a collision waiting for the
    // next feature that stores something by id.
    expect(viewedKey(42)).toBe("wr:viewed:42");
    expect(viewedKey(42)).not.toBe(String(42));
  });

  test("U-VIEWS-4: a browser with no storage reports rather than throwing", () => {
    // `null` is what the component passes when the property access itself
    // threw. Reporting every load over-counts a reader who refreshes; the
    // alternative — treating it as already-reported — would count nothing at
    // all for those readers, and a number quietly too low is worse than one
    // visibly a little high.
    expect(shouldReportView(null, 42)).toBe(true);
    expect(shouldReportView(null, 42)).toBe(true);
  });

  test("U-VIEWS-5: storage that throws on read or write does not propagate", () => {
    const throwsOnRead = {
      getItem: () => {
        throw new DOMException("denied");
      },
      setItem: () => {},
    };
    const throwsOnWrite = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("quota");
      },
    };
    // Neither throws out, and both fall back to reporting.
    expect(shouldReportView(throwsOnRead, 42)).toBe(true);
    expect(shouldReportView(throwsOnWrite, 42)).toBe(true);
  });

  test("U-VIEWS-6: a reported article is written exactly once", () => {
    // Not a size check for its own sake: it pins that the mark is written on
    // the reporting path only. Writing on every call would be invisible here
    // except through the count, and would grow the session's storage with
    // every refresh of every article.
    const storage = workingStorage();
    shouldReportView(storage, 7);
    shouldReportView(storage, 7);
    shouldReportView(storage, 7);
    expect(storage.size()).toBe(1);
  });
});

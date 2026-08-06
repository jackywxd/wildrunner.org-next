import { expect, test } from "@playwright/test";

import { resolveBadgeDistance, resolveBadgeEvent } from "@/lib/races/badge-source";

/**
 * U-BADGE — the seam between a stored race record and a rendered badge.
 *
 * The four tests `docs/testing-plan.md` §2 lists against `badge-source.ts`.
 * They were deferred from #33 because the module arrives with this branch.
 *
 * What makes them worth having is the failure mode. A badge is rendered from
 * an `eventId` and a `distanceId` that a member's record carries, and the
 * catalogue those ids resolve against is data — reviewed CSV that changes
 * between releases. So an id that resolves today may not tomorrow, and the
 * badge is drawn server-side into an image: a throw here is not a missing
 * badge, it is a 500 on a rider's whole page.
 *
 * That is the property being pinned. Not "the label is pretty" — "an unknown
 * id degrades and never throws".
 */
test.describe("U-BADGE badge source", () => {
  test("U-BADGE-1: a known event resolves to its own name and series", () => {
    const event = resolveBadgeEvent("utmb-mont-blanc");
    expect(event.id).toBe("utmb-mont-blanc");
    expect(event.name).toBeTruthy();
    expect(event.name).not.toBe("utmb-mont-blanc");
    // A real series, which is what decides the badge's colour family.
    expect(event.series).not.toBeNull();
  });

  test("U-BADGE-2: an unknown event degrades instead of throwing", () => {
    // The case that matters: this runs inside server-side image generation for
    // a rider page, so throwing would take out the page, not the badge.
    const event = resolveBadgeEvent("an-event-that-left-the-catalogue");
    expect(event.id).toBe("an-event-that-left-the-catalogue");
    expect(event.name).toBe("an-event-that-left-the-catalogue");
    // `null` is the documented signal for "resolved to nothing" and is what
    // the placeholder styling keys on — not a made-up series.
    expect(event.series).toBeNull();
  });

  test("U-BADGE-3: a known distance resolves to its label", () => {
    const distance = resolveBadgeDistance("other-hardrock", "100m");
    expect(distance.id).toBe("100m");
    expect(distance.label).toBeTruthy();
  });

  test("U-BADGE-4: an unresolvable distance is upper-cased, not left raw", () => {
    // Distance ids are lowercase by convention; a raw one sitting next to
    // properly-cased labels reads as a rendering bug rather than as missing
    // data. Both halves — unknown event, and known event with an unknown
    // distance — take the same path.
    expect(resolveBadgeDistance("nope", "100k").label).toBe("100K");
    expect(resolveBadgeDistance("other-hardrock", "50k").label).toBe("50K");
  });
});

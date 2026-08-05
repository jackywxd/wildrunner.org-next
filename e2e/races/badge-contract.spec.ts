import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { resolveBadgeEvent } from "@/lib/races/badge-source";
import { badgeToken } from "@/lib/races/design-tokens";
import {
  RACE_EVENTS,
  RACE_SERIES,
  findRaceDistance,
  findRaceEvent,
  raceEventsBySeries,
  raceYearOptions,
} from "@/lib/races/catalogue";
import type { RaceSeries } from "@/lib/races/catalogue";

/**
 * Phase A — the race catalogue and the badge contract.
 *
 * Plain Node/Playwright test code, no browser, like editor-fidelity.spec.ts.
 *
 * WHY THIS DOES NOT RENDER THE COMPONENT. The obvious version of A-T2 calls
 * `renderToStaticMarkup(<RaceBadge …/>)` for all 65 events. It cannot:
 * Playwright compiles every `.tsx` it loads with its own JSX pragma (for
 * component testing), so `badge.tsx`'s JSX becomes `{__pw_type, …}` objects
 * and React refuses them as children. That applies to the source file, not
 * just the spec, so writing `createElement` in the spec does not avoid it.
 *
 * The split that works: everything per-event is pure TS and asserted here
 * for all 65 events — which is where a bad entry would actually hide. The
 * SVG assembly is one code path shared by every event, so proving it once in
 * a real browser is enough, and the Phase C/D specs do exactly that against
 * `data-testid="race-badge"` on the pages that ship it.
 *
 * READ THIS BEFORE ADDING A TEST HERE. Badge artwork is being produced on a
 * separate branch and will replace design-tokens.ts, motifs.tsx and
 * badge-art.tsx wholesale. These tests assert the CONTRACT only. Never
 * assert a colour, a path, or a terrain: the day the artwork lands, such a
 * test fails, and "finish the art" becomes "finish the art and rewrite the
 * suite". A-T5 enforces this mechanically.
 */
test.describe("A race catalogue and badge contract", () => {
  test("A-T1: the catalogue is internally consistent", () => {
    expect(RACE_EVENTS.length).toBeGreaterThan(0);

    const ids = RACE_EVENTS.map((event) => event.id);
    expect(new Set(ids).size, "duplicate event id").toBe(ids.length);

    for (const event of RACE_EVENTS) {
      expect(event.distances.length, `${event.id} has no distances`).toBeGreaterThan(0);
      expect(event.name.trim().length, `${event.id} has no name`).toBeGreaterThan(0);

      const distanceIds = event.distances.map((distance) => distance.id);
      expect(
        new Set(distanceIds).size,
        `${event.id} has a duplicate distance id`,
      ).toBe(distanceIds.length);

      for (const distance of event.distances) {
        expect(
          distance.label.trim().length,
          `${event.id}/${distance.id} has no label`,
        ).toBeGreaterThan(0);
        expect(findRaceDistance(event, distance.id)).toBeDefined();
      }

      // These ids are written to the database and appear in query strings,
      // so they have to survive both without escaping.
      expect(event.id, `${event.id} is not a clean key`).toMatch(/^[a-z0-9-]+$/);
      expect(event.country, `${event.id} country`).toMatch(/^[A-Z]{3}$/);
    }

    // A mistake in a series tag would quietly empty one of the pickers.
    // Summed over RACE_SERIES rather than over a list written out here, so
    // adding a fourth series does not silently stop being covered.
    let tagged = 0;
    for (const series of RACE_SERIES) {
      const count = raceEventsBySeries(series).length;
      expect(count, `series "${series}" is empty`).toBeGreaterThan(0);
      tagged += count;
    }
    expect(tagged).toBe(RACE_EVENTS.length);

    // The id prefix is not decoration: it is what keeps a race that changes
    // series from being renamed in place, which would orphan every member
    // record pointing at it. Pinning it here makes that convention fail
    // loudly rather than drift.
    const SERIES_PREFIX: Record<RaceSeries, string> = {
      utmb: "utmb-",
      wtm: "wtm-",
      others: "other-",
    };
    for (const event of RACE_EVENTS) {
      expect(event.id, `${event.id} does not match its series prefix`).toMatch(
        new RegExp(`^${SERIES_PREFIX[event.series]}`),
      );
    }
  });

  test("A-T2: every event resolves to a complete badge token", () => {
    for (const event of RACE_EVENTS) {
      // Through resolveBadgeEvent rather than passing the event straight
      // in: the resolver is what the rendering path actually uses, so
      // asserting on its output is asserting on what ships.
      const token = badgeToken(resolveBadgeEvent(event.id));

      expect(token.eventId, `${event.id} token points elsewhere`).toBe(event.id);
      // An empty abbreviation renders a blank badge — the failure mode this
      // test exists to catch, since it would only show for one race.
      expect(token.abbr.trim().length, `${event.id} has no abbr`).toBeGreaterThan(0);
      expect(
        token.abbr.length,
        `${event.id} abbr too long to fit`,
      ).toBeLessThanOrEqual(4);

      // Presence only. What these are set to is the artwork track's call.
      for (const key of ["ink", "primary", "secondary"] as const) {
        expect(token[key].length, `${event.id} has no ${key}`).toBeGreaterThan(0);
      }
    }
  });

  test("A-T3: tokens are deterministic", () => {
    // Pages are cached, so a badge that differed between renders would read
    // as a bug and break any future snapshot of a profile.
    for (const event of RACE_EVENTS) {
      expect(badgeToken(resolveBadgeEvent(event.id))).toEqual(
        badgeToken(resolveBadgeEvent(event.id)),
      );
    }
  });

  test("A-T4: an unknown event still resolves", () => {
    // Records outlive catalogue edits. Renaming an id must not take down
    // every profile holding a record that points at the old one.
    expect(findRaceEvent("utmb-not-a-real-race")).toBeUndefined();

    // The resolver is where the fallback now lives, so this asserts it
    // produces the shape the token's placeholder branch keys on.
    const unknown = resolveBadgeEvent("utmb-not-a-real-race");
    expect(unknown.series, "an unresolved id must report no series").toBeNull();

    const token = badgeToken(unknown);
    expect(token.eventId).toBe("utmb-not-a-real-race");
    expect(token.abbr.length).toBeGreaterThan(0);
    expect(token.primary.length).toBeGreaterThan(0);
  });

  test("A-T5: race specs assert the contract, never the artwork", () => {
    // The guard that keeps the artwork track unblocked. If this fails, the
    // fix is to delete the offending assertion — not to update it to match
    // whatever the artwork now looks like.
    const dir = join(process.cwd(), "e2e", "races");
    const specs = readdirSync(dir).filter((name) => name.endsWith(".spec.ts"));
    expect(specs.length).toBeGreaterThan(0);

    for (const name of specs) {
      const source = readFileSync(join(dir, name), "utf8");
      // Strip comments: this file discusses colours in prose.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

      // Assertion messages must avoid the very tokens they ban — this guard
      // reads its own source, and the first draft failed on the word it was
      // searching for.
      expect(code, `${name} pins a hex colour`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(code, `${name} pins a colour function`).not.toMatch(/hsl\(/);
      expect(code, `${name} pins SVG path data`).not.toMatch(/\bd="M/);
      expect(code, `${name} pins terrain art`).not.toMatch(/\bmotif\b/);
    }
  });

  test("A-T6: year options run from the earliest year to next year", () => {
    const years = raceYearOptions(new Date(Date.UTC(2026, 6, 31)));

    // Next year is offered: entries open, and members register before they
    // run. Newest first, because that is what gets picked.
    expect(years[0]).toBe(2027);
    expect(years[years.length - 1]).toBe(2010);
    expect(new Set(years).size).toBe(years.length);
  });
});

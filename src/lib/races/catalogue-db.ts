import { cache } from "react";

import { getPayloadClient } from "@/lib/payload";
import type { RaceCategory, RaceEvent as RaceEventDoc } from "@/payload-types";

import type { CatalogueDistance, CatalogueEvent } from "./catalogue-shape";

export type {
  CatalogueDistance,
  CatalogueEvent,
  RaceCatalogueMap,
} from "./catalogue-shape";
export { catalogueMap, eventsBySeries } from "./catalogue-shape";

/**
 * The runtime catalogue, read from `race-events` / `race-categories` instead
 * of `src/lib/races/catalogue.ts`.
 *
 * SERVER-ONLY. This file imports `getPayloadClient`, which imports
 * `@payload-config` — the whole Payload config. Pure consumers (client
 * components, unit tests) want `catalogue-shape.ts` instead; see that file's
 * header for what importing this one by mistake actually costs.
 *
 * THIS REPLACES THE SEAM `badge-source.ts` DESCRIBED. That file's header has
 * said since it was written that "when the catalogue becomes rows, only this
 * file changes" — this is that change. `badge-source.ts`, `report-options.ts`
 * and `RaceRecords.ts`'s validation now resolve against these rows, not
 * against the in-code array.
 *
 * WHY IT HAD TO HAPPEN NOW, NOT LATER. Two real member records in production
 * named categories the reviewed catalogue does not have —
 * `utmb-puerto-vallarta/100m` (that race has never run a 100M; the in-code
 * catalogue gave it the *assumed* UTMB default) and `wtm-mt-fuji/ultra`
 * (`ultra` is a World Trail Majors ranking tier, not an entry). Neither was a
 * member's mistake — the picker offered a fabricated option, and the writing
 * path accepted it, because both read from `catalogue.ts` while the reviewed
 * data disagreed. A category that is a foreign key cannot point at something
 * that does not exist. A category that is a string can, and did, twice.
 * (docs/testing-plan.md, "The catalogue and the database disagree".)
 */

/**
 * Every event with its categories, sorted the way the pages that list them
 * need — events by name, categories within an event by the `order` a person
 * set when reviewing the CSV.
 *
 * `React.cache`'d: 100 events and 394 categories is two queries, not two per
 * component. Depth 0 throughout — neither collection has an `owner` or any
 * relation to `users`, so there is no PII path here to guard against the way
 * `content.ts` must for posts and race-records.
 */
export const getRaceCatalogueEvents = cache(
  async (): Promise<CatalogueEvent[]> => {
    const payload = await getPayloadClient();

    const [eventsResult, categoriesResult] = await Promise.all([
      payload.find({
        collection: "race-events",
        depth: 0,
        limit: 0,
        pagination: false,
        sort: "name",
      }),
      payload.find({
        collection: "race-categories",
        depth: 0,
        limit: 0,
        pagination: false,
        sort: "order",
      }),
    ]);

    const events = eventsResult.docs as RaceEventDoc[];
    const categories = categoriesResult.docs as RaceCategory[];

    const distancesByEventId = new Map<number, CatalogueDistance[]>();
    for (const category of categories) {
      // `depth: 0` leaves `event` as the numeric id, not a populated
      // document — which is the point: no need to walk into race-events a
      // second time to find out which one a category belongs to.
      const eventId =
        typeof category.event === "number" ? category.event : category.event.id;
      const list = distancesByEventId.get(eventId) ?? [];
      list.push({ id: category.key, label: category.label });
      distancesByEventId.set(eventId, list);
    }

    return events.map((event) => ({
      id: event.key,
      name: event.name,
      nameZh: event.nameZh ?? undefined,
      series: event.series,
      country: event.country ?? undefined,
      distances: distancesByEventId.get(event.id) ?? [],
    }));
  },
);

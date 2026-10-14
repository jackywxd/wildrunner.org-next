import type { PayloadRequest } from "payload";
import { APIError } from "payload";

import type { RaceCategory, RaceEvent, User } from "@/payload-types";

import { cachedFetch, fetchPeople } from "./fetch";
import { aliasList, type MatchDistance, type MatchEvent } from "./match";
import { MAX_NAME_WORDS, nameSplits } from "./name";

/**
 * What both UltraSignup endpoints need from the server, and must agree on:
 * the import endpoint re-derives one row the results endpoint derived for
 * the whole list, so the name, the catalogue and the fetch are one code path.
 *
 * Messages are Traditional Chinese because the client shows them as they
 * are; a non-500 `APIError` reaches the member verbatim (`isErrorPublic`).
 */

export async function storedName(req: PayloadRequest): Promise<string> {
  if (!req.user) throw new APIError("請先登入。", 401);
  const account = (await req.payload.findByID({
    collection: "users",
    id: req.user.id,
    depth: 0,
    overrideAccess: false,
    user: req.user,
  })) as User;
  const name = account.ultrasignupName?.trim() ?? "";
  if (!nameSplits(name)) {
    throw new APIError(
      `請填 UltraSignup 成績頁上的姓名，姓放在最後，2 到 ${MAX_NAME_WORDS} 個詞。`,
      400,
    );
  }
  return name;
}

/**
 * Every catalogue event in the shape the matcher wants, plus the numeric
 * row id each event key maps to. Historical categories are included: once
 * one member's import has created QMT's 110K, the next member's 110K is a
 * plain match against it, not a second entry.
 */
export async function matchCatalogue(
  req: PayloadRequest,
): Promise<{ eventRowIds: Map<string, number>; events: MatchEvent[] }> {
  const [eventsResult, categoriesResult] = await Promise.all([
    req.payload.find({
      collection: "race-events",
      depth: 0,
      limit: 0,
      pagination: false,
      select: { id: true, key: true, name: true, ultrasignupAliases: true },
    }),
    req.payload.find({
      collection: "race-categories",
      depth: 0,
      limit: 0,
      pagination: false,
      select: { distanceKm: true, event: true, key: true, label: true },
    }),
  ]);
  const events = eventsResult.docs as Pick<RaceEvent, "id" | "key" | "name" | "ultrasignupAliases">[];
  const categories = categoriesResult.docs as Pick<
    RaceCategory,
    "distanceKm" | "event" | "key" | "label"
  >[];
  const distancesByEvent = new Map<number, MatchDistance[]>();
  for (const category of categories) {
    const eventId = typeof category.event === "number" ? category.event : category.event.id;
    const list = distancesByEvent.get(eventId) ?? [];
    list.push({ distanceKm: category.distanceKm, id: category.key, label: category.label });
    distancesByEvent.set(eventId, list);
  }
  return {
    eventRowIds: new Map(events.map((event) => [event.key, event.id])),
    events: events.map((event) => ({
      aliases: aliasList(event.ultrasignupAliases),
      distances: distancesByEvent.get(event.id) ?? [],
      id: event.key,
      name: event.name,
    })),
  };
}

/**
 * The Workers edge cache, where there is one. `next dev` runs in Node,
 * which has no `caches`, so there every request goes to UltraSignup.
 */
function edgeCache(): Cache | undefined {
  // The DOM lib's CacheStorage wins the merge with workers-types and has no
  // `default`, so it is read through the Workers shape.
  if (typeof caches === "undefined") return undefined;
  return (caches as unknown as { default?: Cache }).default;
}

export async function fetchOrFail(
  req: PayloadRequest,
  name: string,
): Promise<Awaited<ReturnType<typeof fetchPeople>>> {
  try {
    const fetched = await fetchPeople(name, cachedFetch(edgeCache()));
    if (fetched.failures.length > 0) {
      req.payload.logger.warn(
        `ultrasignup: partial — ${fetched.failures.map((failure) => failure.reason).join(", ")}`,
      );
    }
    return fetched;
  } catch (error) {
    req.payload.logger.error(
      `ultrasignup: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw new APIError("無法讀取 UltraSignup，請稍後再試。", 502);
  }
}

import { historyUrl, nameSplits, type NameSplit } from "./name";
import { mergePeople, parseHistory, type ParsedPerson } from "./parse";

/**
 * Every person UltraSignup has under this name.
 *
 * One split failing does not hide the others: "Xu Dong / Wu" and
 * "Xu / Dong Wu" are independent records, and losing one of them is how a
 * finish disappears. So a split that times out, errors or answers in a shape
 * we do not recognise is reported in `failures`, and the rest still return.
 * All of them failing is a failure, and it throws.
 *
 * "Not recognised" is kept apart from "nobody". `historybyname` is not a
 * published API; `[]` is its answer for an unknown name, and anything else
 * that yields no person means the shape changed. Treating that as an empty
 * list would tell every member they have no results the day it happens.
 *
 * THE DEPENDENCY. `historybyname` is what UltraSignup's own results page
 * calls; nothing promises it will keep its path, its shape or its welcome
 * for a server that is not that page. So every request names us in its
 * User-Agent — if it is unwelcome, they can tell whom to ask rather than
 * blocking a Cloudflare egress range — and answers are cached for a few
 * minutes, because a member pressing 讀取成績 and then importing a new
 * distance asks the same question twice in a minute.
 */
export type SplitFailure = {
  reason: "unreachable" | "status" | "format";
  split: NameSplit;
};

export async function fetchPeople(
  name: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ failures: SplitFailure[]; people: ParsedPerson[] }> {
  const splits = nameSplits(name);
  if (!splits) return { failures: [], people: [] };

  const outcomes = await Promise.all(splits.map((split) => loadSplit(split, fetchImpl)));
  const failures = outcomes.filter((outcome): outcome is SplitFailure => "reason" in outcome);
  if (failures.length === splits.length) {
    // Reasons only: this lands in the Worker log, and the name is the member's.
    throw new Error(
      `UltraSignup did not answer: ${failures.map((failure) => failure.reason).join(", ")}`,
    );
  }
  return {
    failures,
    people: mergePeople(
      outcomes.map((outcome) => ("people" in outcome ? outcome.people : [])),
    ),
  };
}

export const USER_AGENT = "wildrunner.org results import (+https://wildrunner.org)";

/** Seconds an UltraSignup answer is reused for. Results change on race weekends, not by the minute. */
export const CACHE_SECONDS = 300;

/**
 * `fetch`, answering from `cache` when it can.
 *
 * Only an `ok` answer is stored: a 5xx kept for five minutes would turn one
 * bad moment into five minutes of "UltraSignup is down". The stored copy
 * carries only its content type — UltraSignup's own headers (a Set-Cookie,
 * a `no-store`) would decide whether the Cache API keeps it at all. A cache
 * that throws is skipped, never surfaced: it is an optimisation.
 */
export function cachedFetch(
  cache: Pick<Cache, "match" | "put"> | undefined,
  fetchImpl: typeof fetch = fetch,
): typeof fetch {
  if (!cache) return fetchImpl;
  return async (input, init) => {
    const key = new Request(input instanceof Request ? input.url : String(input));
    const hit = await cache.match(key).catch(() => undefined);
    if (hit) return hit;
    const response = await fetchImpl(input, init);
    if (!response.ok) return response;
    const body = await response.text();
    const headers = {
      "cache-control": `max-age=${CACHE_SECONDS}`,
      "content-type": response.headers.get("content-type") ?? "application/json",
    };
    await cache.put(key, new Response(body, { headers })).catch(() => undefined);
    return new Response(body, { headers, status: response.status });
  };
}

async function loadSplit(
  split: NameSplit,
  fetchImpl: typeof fetch,
): Promise<{ people: ParsedPerson[] } | SplitFailure> {
  let response: Response;
  try {
    response = await fetchImpl(historyUrl(split), {
      headers: { accept: "application/json", "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { reason: "unreachable", split };
  }
  if (!response.ok) return { reason: "status", split };
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { reason: "format", split };
  }
  if (!Array.isArray(json)) return { reason: "format", split };
  const people = parseHistory(json, split);
  if (json.length > 0 && people.length === 0) return { reason: "format", split };
  return { people };
}

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

async function loadSplit(
  split: NameSplit,
  fetchImpl: typeof fetch,
): Promise<{ people: ParsedPerson[] } | SplitFailure> {
  let response: Response;
  try {
    response = await fetchImpl(historyUrl(split), {
      headers: { accept: "application/json" },
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

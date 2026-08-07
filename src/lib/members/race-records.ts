/**
 * Getting the member a race record to point a report at.
 *
 * A race report is a post joined to a `race-records` document, and that
 * record is what the badge renders from. The member may already hold the
 * record — they logged the finish on /members/races weeks ago — or this may
 * be the first time they claim it. Either way the report needs *the* record
 * for (event, distance, year), never a second copy of it.
 *
 * That constraint is already enforced server-side: `uniqueRaceRecord`
 * rejects a duplicate for the same owner. So this is a find-then-create,
 * with the create's failure treated as "somebody won the race, look again"
 * rather than as an error — see `ensureRaceRecord`.
 */

export type RaceRecordRef = {
  distanceId: string;
  eventId: string;
  id: number;
  year: number;
};

type Found = { docs: RaceRecordRef[] };

/**
 * `owner` is part of the query, not an afterthought.
 *
 * `race-records` read access is deliberately public (a badge exists to be
 * seen), so an unscoped lookup would happily return another member's record
 * and this function would then attach their finish to this member's post.
 */
async function findOwn(
  ownerId: number,
  eventId: string,
  distanceId: string,
  year: number,
): Promise<RaceRecordRef | null> {
  const query = new URLSearchParams({
    depth: "0",
    limit: "1",
    "where[and][0][owner][equals]": String(ownerId),
    "where[and][1][eventId][equals]": eventId,
    "where[and][2][distanceId][equals]": distanceId,
    "where[and][3][year][equals]": String(year),
  });
  const response = await fetch(`/api/race-records?${query}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) return null;
  const body = (await response.json()) as Found;
  return body.docs?.[0] ?? null;
}

export type EnsureResult =
  | { id: number; ok: true }
  | { message: string; ok: false };

/**
 * The member's record for this finish, creating it if they have not claimed
 * it before.
 *
 * The second lookup after a failed create is not defensive padding. Two
 * things reach this path — the 「紀錄比賽」 button and the picker inside the
 * editor — and a member who uses both for the same race, or double-clicks
 * once, hits `uniqueRaceRecord` on the second attempt. That is the guard
 * doing its job, and the right response is to use the record that now
 * exists, not to show an error about a duplicate the member never meant to
 * make. A create that fails for any other reason finds nothing on the
 * retry and reports honestly.
 */
export async function ensureRaceRecord(input: {
  distanceId: string;
  eventId: string;
  ownerId: number;
  year: number;
}): Promise<EnsureResult> {
  const { distanceId, eventId, ownerId, year } = input;

  const existing = await findOwn(ownerId, eventId, distanceId, year);
  if (existing) return { id: existing.id, ok: true };

  const response = await fetch("/api/race-records", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ distanceId, eventId, year }),
  });

  if (response.ok) {
    const body = (await response.json()) as { doc: { id: number } };
    return { id: body.doc.id, ok: true };
  }

  const raced = await findOwn(ownerId, eventId, distanceId, year);
  if (raced) return { id: raced.id, ok: true };

  return { message: await readError(response), ok: false };
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      errors?: {
        data?: { errors?: { message?: string }[] };
        message?: string;
      }[];
    };
    const first = body.errors?.[0];
    // Payload nests field-level messages one level down — the catalogue
    // validators and the duplicate guard both land there.
    return (
      first?.data?.errors?.[0]?.message ?? first?.message ?? "無法建立比賽紀錄"
    );
  } catch {
    return "無法建立比賽紀錄";
  }
}

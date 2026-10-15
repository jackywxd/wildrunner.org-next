import { normalizeRaceName } from "./normalize";

/**
 * Which catalogue race an UltraSignup row is, if exactly one.
 *
 * The event is the part before " - ". It matches a catalogue name or an
 * admin alias, after `normalizeRaceName`, and only when that string belongs
 * to one event. The distance is the part after. A category label equal to
 * it wins (`TDS`, `CCC`, `50/50`). A label inside longer text counts only
 * when everything else in the text is a distance that agrees with that
 * category (`TDS 145K`): "Half Marathon" contains the token `marathon` and
 * is not the Marathon, so a bare token is never enough. Otherwise the
 * kilometres parsed out of "100 Miler" or "50K" have to land on one
 * category within max(3 km, 5%). Two categories in range means the member
 * picks. A distance is never used to search the whole catalogue.
 *
 * A category with no `distanceKm` is read from its label. The catalogue
 * leaves the number empty rather than derive it (Squamish "50M" has none),
 * and without this "50 Miler" could never land on it. `M` after a number is
 * miles: no trail race is measured in metres.
 *
 * A distance the event does not list is "new-distance" — importable, with
 * UltraSignup's label becoming a historical category — only when it is
 * provably new: the text reads as a distance, every category of the event
 * has a known distance, and none is in range. One category of unknown
 * length (Mt. FUJI's "Mt.FUJI 100") means "100 Miler" might be it, and
 * creating a second entry for the same race is worse than refusing.
 */

export type MatchDistance = {
  distanceKm?: number | null;
  id: string;
  label: string;
};

export type MatchEvent = {
  aliases: string[];
  distances: MatchDistance[];
  id: string;
  name: string;
};

export type DistanceChoice = {
  id: string;
  label: string;
};

export type RowMatch =
  | {
      distanceId: string;
      distanceLabel: string;
      eventId: string;
      eventName: string;
      kind: "ready";
    }
  | {
      eventId: string;
      eventName: string;
      kind: "choose-distance";
      options: DistanceChoice[];
    }
  | {
      distanceLabel: string;
      eventId: string;
      eventName: string;
      kind: "new-distance";
    }
  | {
      kind: "unsupported";
      /**
       * event: no catalogue event. distance: the event, but the text is not
       * a distance we can compare. unverifiable: a distance, but some
       * category's length is unknown. year/status: set by the assembler.
       */
      reason: "event" | "distance" | "unverifiable" | "year" | "status";
    };

const KILOMETRES = /^(\d+(?:\.\d+)?)\s*(k|km)$/i;
const MILES = /^(\d+(?:\.\d+)?)\s*(miler|miles|mile|mi|m)$/i;
const MILES_TO_KM = 1.609344;

export function parseDistanceKm(text: string): number | null {
  const trimmed = text.trim();
  const km = KILOMETRES.exec(trimmed);
  if (km) return Number(km[1]);
  const miles = MILES.exec(trimmed);
  if (miles) return Number(miles[1]) * MILES_TO_KM;
  return null;
}

function aliasLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * The `race-categories.key` a historical entry is created under: "110K"
 * becomes "110k", the shape the reviewed keys already have. Stable, so two
 * members importing the same distance land on one row through the
 * `(event, key)` unique index rather than creating two.
 */
export function historicalKey(label: string): string {
  return label
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The catalogue rows an admin's 導入比賽 writes for a row whose race the
 * catalogue lacks: the event named exactly as UltraSignup prints it, and its
 * distance as the first category. Exact so that `matchRow` meets the next
 * member's row with the same title by name, with no alias. Null when either
 * part has no usable key.
 */
export function raceFromRow(
  eventName: string,
  distanceText: string,
): { category: MatchDistance; event: { key: string; name: string } } | null {
  const name = eventName.trim();
  const label = distanceText.trim();
  const key = historicalKey(name);
  const distanceKey = historicalKey(label);
  if (!key || !distanceKey) return null;
  return {
    category: { distanceKm: parseDistanceKm(label), id: distanceKey, label },
    event: { key, name },
  };
}

export function aliasList(value: string | null | undefined): string[] {
  if (!value) return [];
  return aliasLines(value);
}

type Indexed = {
  distances: MatchDistance[];
  id: string;
  name: string;
};

function indexEvents(events: MatchEvent[]): Map<string, Indexed[]> {
  const index = new Map<string, Indexed[]>();
  for (const event of events) {
    const names = [event.name, ...event.aliases];
    const indexed = { distances: event.distances, id: event.id, name: event.name };
    for (const name of names) {
      const key = normalizeRaceName(name);
      if (!key) continue;
      const list = index.get(key) ?? [];
      if (!list.some((item) => item.id === event.id)) list.push(indexed);
      index.set(key, list);
    }
  }
  return index;
}

/**
 * Every event an UltraSignup event name resolves to, by name or alias. One
 * id is a match; two are an ambiguity `matchRow` refuses; none is unknown.
 */
export function eventsNamed(events: MatchEvent[], eventName: string): string[] {
  return (indexEvents(events).get(normalizeRaceName(eventName)) ?? []).map((event) => event.id);
}

function labelEquals(text: string, label: string): boolean {
  const name = normalizeRaceName(label);
  return text !== "" && name !== "" && text === name;
}

/**
 * The label appears as a run of whole tokens and the rest of the text is a
 * distance within range of this category's known length. A category of
 * unknown length cannot be confirmed this way, so it is not a hit.
 */
function labelWithDistance(
  text: string,
  label: string,
  lengthKm: number | null | undefined,
): boolean {
  const name = normalizeRaceName(label);
  if (!text || !name || typeof lengthKm !== "number") return false;
  const tokens = text.split(" ");
  const wanted = name.split(" ");
  for (let start = 0; start + wanted.length <= tokens.length; start += 1) {
    if (!wanted.every((token, offset) => tokens[start + offset] === token)) continue;
    const rest = [...tokens.slice(0, start), ...tokens.slice(start + wanted.length)].join(" ");
    if (rest === "") return false;
    const restKm = parseDistanceKm(rest);
    return restKm !== null && within(restKm, lengthKm);
  }
  return false;
}

function within(actualKm: number, candidateKm: number): boolean {
  return Math.abs(actualKm - candidateKm) <= Math.max(3, candidateKm * 0.05);
}

export function matchRow(
  events: MatchEvent[],
  eventName: string,
  distanceText: string,
): RowMatch {
  const found = indexEvents(events).get(normalizeRaceName(eventName));
  if (!found || found.length !== 1) return { kind: "unsupported", reason: "event" };
  const event = found[0];

  const text = normalizeRaceName(distanceText);
  const lengths = event.distances.map(
    (distance) => distance.distanceKm ?? parseDistanceKm(distance.label),
  );
  const exact = event.distances.filter((distance) => labelEquals(text, distance.label));
  const byLabel =
    exact.length > 0
      ? exact
      : event.distances.filter((distance, index) =>
          labelWithDistance(text, distance.label, lengths[index]),
        );
  if (byLabel.length === 1) {
    return {
      distanceId: byLabel[0].id,
      distanceLabel: byLabel[0].label,
      eventId: event.id,
      eventName: event.name,
      kind: "ready",
    };
  }

  const kilometres = parseDistanceKm(distanceText);
  const byDistance =
    kilometres === null
      ? []
      : event.distances.filter((_, index) => {
          const candidate = lengths[index];
          return typeof candidate === "number" && within(kilometres, candidate);
        });

  const options = (byLabel.length > 1 ? byLabel : byDistance).map((distance) => ({
    id: distance.id,
    label: distance.label,
  }));
  if (options.length === 1) {
    return {
      distanceId: options[0].id,
      distanceLabel: options[0].label,
      eventId: event.id,
      eventName: event.name,
      kind: "ready",
    };
  }
  if (options.length > 1) {
    return {
      eventId: event.id,
      eventName: event.name,
      kind: "choose-distance",
      options,
    };
  }
  if (kilometres === null) {
    return { kind: "unsupported", reason: "distance" };
  }
  if (lengths.some((length) => length === null)) {
    return { kind: "unsupported", reason: "unverifiable" };
  }
  return {
    distanceLabel: distanceText.trim(),
    eventId: event.id,
    eventName: event.name,
    kind: "new-distance",
  };
}

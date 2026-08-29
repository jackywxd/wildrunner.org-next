/**
 * The race catalogue: UTMB World Series, World Trail Majors, and the
 * independent races that belong to neither.
 *
 * Reference data, not user content — so it lives in code rather than a
 * collection. It is version-controlled, deploys atomically with the badge
 * that renders it, and needs no seeding step on a fresh database.
 *
 * This file holds FACTS ONLY (id, series, name, country, distances). Every
 * visual decision lives in design-tokens.ts, which the badge artwork track
 * owns — see the file-ownership split in the plan. Keeping them apart is
 * what lets the artwork land later without touching anything here.
 *
 * DATES ARE NOT HERE. A race's identity is stable; the day it runs is not.
 * Dated editions — with registration windows, and editable by an admin —
 * live in the `race-schedule` collection, which points back at these ids
 * through an optional `eventId`. See src/collections/RaceSchedule.ts.
 *
 * Sources, the first two read 2026-07-30, the third 2026-08-01:
 *   - UTMB World Series 2026 calendar (theultrarunner.com, from utmb.world)
 *   - World Trail Majors 2026 calendar (worldtrailmajors.com)
 *   - Independent races: each event's own site (see the section below)
 *
 * KNOWN INCOMPLETE: UTMB's own announcement puts the 2026 season at 64
 * events; 55 are listed below.
 *
 * Additions of 2026-08-04 (Whistler, Sinister 7, Canadian Death Race,
 * Squamish 50, Ticino Wildlands) came in through the other direction: they
 * were already dated rows in `race-schedule` with no `eventId`, so they
 * appeared on /races but could carry no badge and no race record. Line-ups
 * are from each event's own site, read that day. The missing entries are new additions the
 * published calendar had not yet broken out. Adding one is a two-line change
 * here plus a token in design-tokens.ts — nothing else in the app enumerates
 * races.
 */

export type RaceSeries = "utmb" | "wtm" | "marathon" | "others";

/**
 * The series, in display order.
 *
 * Exported so nothing else has to keep its own copy — `RaceRecordManager`
 * used to hold a hand-written `["utmb", "wtm"]`, which meant adding a series
 * here left it invisible in the member picker. One list, one place.
 *
 * `marathon` is the six Abbott World Marathon Majors, and it is a group of
 * its own rather than a corner of `others` because it is a different kind of
 * race, not an unaffiliated one: road, not trail. Filing the Berlin Marathon
 * under 「其他獨立賽事」 next to the Barkley describes neither.
 */
export const RACE_SERIES: readonly RaceSeries[] = [
  "utmb",
  "wtm",
  "marathon",
  "others",
];

/**
 * The series `/races` offers as filter chips — every series EXCEPT
 * `marathon`.
 *
 * The schedule lists editions that carry a `startDate`, and the marathon
 * events deliberately have none dated — that is what keeps six road races
 * off a trail calendar. A chip for them would therefore always land on
 * 「這個條件下沒有賽事」 — a control whose only outcome is an empty page.
 *
 * A hand-typed copy of the other three would rot the moment a fourth trail
 * series is added, which is the exact bug the comment above records. So it
 * is derived, and the exclusion is the thing stated.
 */
export type ScheduleSeries = Exclude<RaceSeries, "marathon">;

export const SCHEDULE_SERIES: readonly ScheduleSeries[] = RACE_SERIES.filter(
  (series): series is ScheduleSeries => series !== "marathon",
);

/**
 * UTMB standardises every event into four categories — this is the official
 * UTMB Index classification, not a simplification on our part, and it is why
 * recording "which distance" is a small enum rather than free text.
 *
 * Mont-Blanc (the Finals) runs named races instead, and World Trail Majors
 * splits into an Ultra and a Short series.
 */
export type RaceDistance = {
  /** Stored in the database. Stable, lowercase, never renamed. */
  id: string;
  /** Shown on the badge band. */
  label: string;
};

export type RaceEvent = {
  /**
   * Stored in the database, so it is immutable. Renaming an event changes
   * `name`, never this — the same guarantee `author-alias.ts` makes for
   * author slugs, for the same reason: a rename must not orphan existing
   * records.
   */
  id: string;
  series: RaceSeries;
  name: string;
  /** ISO 3166-1 alpha-3. */
  country: string;
  distances: RaceDistance[];
};

const K20: RaceDistance = { id: "20k", label: "20K" };
const K50: RaceDistance = { id: "50k", label: "50K" };
const K100: RaceDistance = { id: "100k", label: "100K" };
const M100: RaceDistance = { id: "100m", label: "100M" };

/**
 * The default offering for a UTMB World Series event.
 *
 * Which categories an individual event actually runs is not something the
 * published calendar states, and it shifts between seasons. Rather than
 * guess per event, every event offers all four unless it is in the override
 * list below, where the line-up is documented and stable.
 *
 * The cost of being wrong is a member picking a category that event did not
 * run — a data-quality wrinkle in their own profile, not a failure: nothing
 * downstream validates a record against the real start list.
 */
const UTMB_STANDARD: RaceDistance[] = [K20, K50, K100, M100];

/** Mont-Blanc's named races, which is what runners actually call them. */
const MONT_BLANC: RaceDistance[] = [
  { id: "utmb", label: "UTMB" },
  { id: "ccc", label: "CCC" },
  { id: "occ", label: "OCC" },
  { id: "tds", label: "TDS" },
  { id: "mcc", label: "MCC" },
  { id: "ptl", label: "PTL" },
  { id: "etc", label: "ETC" },
  { id: "ycc", label: "YCC" },
];

/** World Trail Majors runs two parallel series. */
const WTM_SERIES: RaceDistance[] = [
  { id: "ultra", label: "Ultra" },
  { id: "short", label: "Short" },
];

function utmb(
  id: string,
  name: string,
  country: string,
  distances: RaceDistance[] = UTMB_STANDARD,
): RaceEvent {
  return { country, distances, id, name, series: "utmb" };
}

function wtm(id: string, name: string, country: string): RaceEvent {
  return { country, distances: WTM_SERIES, id, name, series: "wtm" };
}

/**
 * Note what this factory does NOT have: a default distance list.
 *
 * `utmb()` can default to UTMB_STANDARD because UTMB standardises its
 * categories across the series. Independent races share nothing — Barkley
 * has loops, Badwater has one road-adjacent 135, Sierre-Zinal is 31K. There
 * is no defensible default, so every caller states the line-up.
 */
function other(
  id: string,
  name: string,
  country: string,
  distances: RaceDistance[],
): RaceEvent {
  return { country, distances, id, name, series: "others" };
}

/** Reused below where an independent race runs a single flagship distance. */
const M135: RaceDistance = { id: "135m", label: "135M" };

export const RACE_EVENTS: RaceEvent[] = [
  // --- UTMB World Series: Europe -------------------------------------
  utmb("utmb-arc-of-attrition", "Arc of Attrition", "GBR"),
  utmb("utmb-chianti", "Chianti Ultra Trail", "ITA"),
  utmb("utmb-tenerife", "Tenerife Bluetrail", "ESP"),
  utmb("utmb-istria", "Istria 100", "HRV"),
  utmb("utmb-ventoux", "Trail du Ventoux", "FRA"),
  utmb("utmb-oh-my-deus", "Oh My Deus", "FRA"),
  utmb("utmb-alsace", "Alsace Grand Est", "FRA"),
  utmb("utmb-snowdonia", "Ultra-Trail Snowdonia", "GBR"),
  utmb("utmb-mozart", "Mozart 100", "AUT"),
  utmb("utmb-andorra", "Andorra Trail 100", "AND"),
  utmb("utmb-saint-jacques", "Saint-Jacques", "FRA"),
  utmb("utmb-zugspitz", "Zugspitz Ultratrail", "DEU"),
  utmb("utmb-lavaredo", "Lavaredo Ultra Trail", "ITA"),
  utmb("utmb-val-daran", "Val d'Aran", "ESP"),
  utmb("utmb-restonica", "Restonica Trail", "FRA"),
  utmb("utmb-verbier", "Verbier Saint-Bernard", "CHE"),
  utmb("utmb-eiger", "Eiger Ultra Trail", "CHE"),
  utmb("utmb-mrww", "Mountain Race Weekend", "CHE"),
  utmb("utmb-bucovina", "Bucovina Ultra Rocks", "ROU"),
  utmb("utmb-gauja", "Gauja Trail", "LVA"),
  utmb("utmb-kat100", "KAT100", "AUT"),
  // The Finals. Named races rather than the standard four categories.
  utmb("utmb-mont-blanc", "UTMB Mont-Blanc", "FRA", MONT_BLANC),
  utmb("utmb-wildstrubel", "Wildstrubel", "CHE"),
  utmb("utmb-kackar", "Kaçkar by UTMB", "TUR"),
  utmb("utmb-julian-alps", "Julian Alps Trail Run", "SVN"),
  utmb("utmb-nice", "Nice Côte d'Azur", "FRA"),
  utmb("utmb-kullamannen", "Kullamannen", "SWE"),
  utmb("utmb-mallorca", "Mallorca Serra de Tramuntana", "ESP"),

  // --- UTMB World Series: Oceania ------------------------------------
  utmb("utmb-tarawera", "Tarawera Ultra-Trail", "NZL"),
  utmb("utmb-australia", "Ultra-Trail Australia", "AUS"),
  utmb("utmb-kosciuszko", "Kosciuszko by UTMB", "AUS"),

  // --- UTMB World Series: Americas -----------------------------------
  utmb("utmb-puerto-vallarta", "Puerto Vallarta México", "MEX"),
  utmb("utmb-desert-rats", "Desert RATS", "USA"),
  utmb("utmb-canyons", "Canyons Endurance Runs", "USA"),
  utmb("utmb-rothrock", "Rothrock Trail Challenge", "USA"),
  // Western States is a 100-mile race and only a 100-mile race.
  utmb("utmb-western-states", "Western States 100", "USA", [M100]),
  utmb("utmb-speedgoat", "Speedgoat Mountain Races", "USA"),
  utmb("utmb-borealys", "Boréalys Mont-Tremblant", "CAN"),
  utmb("utmb-whistler", "Ultra Trail Whistler", "CAN"),
  utmb("utmb-grindstone", "Grindstone Trail Running Festival", "USA"),
  utmb("utmb-kodiak", "Kodiak Ultra Marathons", "USA"),
  utmb("utmb-pacific-trails", "Pacific Trails Ultra", "USA"),
  utmb("utmb-valholl", "Valhöll Fin del Mundo", "ARG"),
  utmb("utmb-torrencial", "Torrencial Trail", "BRA"),
  utmb("utmb-quito", "Quito Trail", "ECU"),
  utmb("utmb-paraty", "Paraty Brazil", "BRA"),
  utmb("utmb-bariloche", "Bariloche by UTMB", "ARG"),

  // --- UTMB World Series: Asia ---------------------------------------
  utmb("utmb-kenting", "Xtrail Kenting", "TWN"),
  utmb("utmb-xiamen", "Xiamen by UTMB", "CHN"),
  utmb("utmb-mogan", "Ultra-Trail Mogan", "CHN"),
  utmb("utmb-amazean", "Amazean Jungle Thailand", "THA"),
  utmb("utmb-kagaspa", "Kagaspa by UTMB", "CHN"),
  utmb("utmb-malaysia", "Malaysia Ultra-Trail", "MYS"),
  utmb("utmb-oman", "Oman by UTMB", "OMN"),

  // --- UTMB World Series: Africa -------------------------------------
  utmb("utmb-mauritius", "Mauritius Ultra-Trail", "MUS"),

  // --- World Trail Majors --------------------------------------------
  wtm("wtm-hk100", "Anta Guanjun Hong Kong 100", "HKG"),
  wtm("wtm-black-canyon", "Black Canyon Ultras", "USA"),
  wtm("wtm-transgrancanaria", "The North Face Transgrancanaria", "ESP"),
  wtm("wtm-mt-fuji", "Mt. FUJI 100", "JPN"),
  wtm("wtm-miut", "Madeira Island Ultra-Trail", "PRT"),
  wtm("wtm-south-downs", "South Downs Way 100", "GBR"),
  wtm("wtm-quebec-mega-trail", "Québec Mega Trail", "CAN"),
  wtm("wtm-vietnam-mountain", "Vietnam Mountain Marathon", "VNM"),
  wtm("wtm-grampians", "Grampians Peaks Trail", "AUS"),
  wtm("wtm-cape-town", "RMB Ultra-Trail Cape Town", "ZAF"),

  // --- Other independent races ----------------------------------------
  //
  // What belongs here: a race that is not part of UTMB World Series or
  // World Trail Majors. Nothing else. Series membership moves between
  // seasons, so when a race joins one of the two series it gets a new entry
  // under that series' prefix rather than being renamed — an id is written
  // into `race_records.event_id` and must never change (see RaceEvent.id).
  //
  // That rule is why Western States stays as `utmb-western-states` above
  // even though runners think of it as an independent classic: it really is
  // a UTMB World Series event, and renaming it would orphan every member
  // record that already claims it, degrading their badge to the neutral
  // placeholder and making the record un-editable.
  //
  // Sierre-Zinal, Zegama and Trofeo Kima are short mountain races rather
  // than ultras, and belong to the Golden Trail World Series. They are in
  // anyway: members run them, and this file has always been a list of races
  // rather than a list of series memberships — the same reasoning the
  // EARLIEST_RACE_YEAR comment records.
  //
  // Distances are stated per race because independent events share no
  // standard line-up. Where a line-up could not be confirmed from the
  // event's own site, the race was left out entirely rather than guessed —
  // a wrong distance shows up on a member's profile as a claim they never
  // made. Asia is thin here for exactly that reason; additions welcome.
  //
  // Sources, all read 2026-08-01: each event's official site.

  // North America
  other("other-hardrock", "Hardrock 100", "USA", [M100]),
  other("other-leadville", "Leadville Trail 100", "USA", [M100]),
  other("other-badwater", "Badwater 135", "USA", [M135]),
  other("other-wasatch", "Wasatch Front 100", "USA", [M100]),
  other("other-angeles-crest", "Angeles Crest 100", "USA", [M100]),
  other("other-vermont", "Vermont 100", "USA", [M100, K100]),
  other("other-barkley", "Barkley Marathons", "USA", [
    { id: "fun-run", label: "Fun Run" },
    { id: "full", label: "Full" },
  ]),
  other("other-cocodona", "Cocodona 250", "USA", [
    { id: "250m", label: "250M" },
  ]),
  other("other-moab-240", "Moab 240", "USA", [{ id: "240m", label: "240M" }]),
  other("other-bigfoot-200", "Bigfoot 200", "USA", [
    { id: "200m", label: "200M" },
  ]),
  // The three Canadian races below run a relay alongside the solo
  // categories. A relay leg is a real finish and members do claim it, so it
  // is a distance like any other rather than a special case — the badge
  // band reads "接力" and the record is as valid as a solo one.
  other("other-sinister-7", "Sinister 7 Ultra", "CAN", [
    M100,
    { id: "50m", label: "50M" },
    K50,
    { id: "half", label: "半馬" },
    { id: "relay", label: "接力" },
  ]),
  other("other-canadian-death-race", "Canadian Death Race", "CAN", [
    { id: "118k", label: "118K" },
    { id: "42k", label: "42K" },
    { id: "relay", label: "接力" },
  ]),
  other("other-squamish-50", "Squamish 50", "CAN", [
    { id: "50m", label: "50M" },
    K50,
    // Both races on consecutive days, scored as one finish — the event's
    // own name for it, not a combination we invented.
    { id: "50-50", label: "50/50" },
    { id: "23k", label: "23K" },
  ]),

  // Europe
  other("other-tor-des-geants", "Tor des Géants", "ITA", [
    { id: "330k", label: "330K" },
    { id: "450k", label: "450K" },
  ]),
  other("other-templiers", "Grand Trail des Templiers", "FRA", [
    { id: "76k", label: "76K" },
  ]),
  other("other-transvulcania", "Transvulcania", "ESP", [
    { id: "73k", label: "73K" },
  ]),
  other("other-sierre-zinal", "Sierre-Zinal", "CHE", [
    { id: "31k", label: "31K" },
  ]),
  other("other-zegama", "Zegama-Aizkorri", "ESP", [{ id: "42k", label: "42K" }]),
  other("other-trofeo-kima", "Trofeo Kima", "ITA", [
    { id: "50k", label: "50K" },
  ]),
  other("other-ticino-wildlands", "Ticino Wildlands", "CHE", [
    { id: "500k", label: "500K" },
    { id: "250k", label: "250K" },
    K50,
  ]),

  // Asia
  other("other-translantau", "Translantau", "HKG", [K20, K50, K100]),
  other("other-hk4tuc", "Hong Kong Four Trails Ultra Challenge", "HKG", [
    { id: "298k", label: "298K" },
  ]),

  // Africa and the Indian Ocean
  other("other-diagonale-des-fous", "Grand Raid de la Réunion", "REU", [
    { id: "diagonale", label: "Diagonale" },
    { id: "bourbon", label: "Bourbon" },
    { id: "mascareignes", label: "Mascareignes" },
  ]),
  other("other-marathon-des-sables", "Marathon des Sables", "MAR", [
    { id: "250k", label: "250K" },
  ]),
];

const BY_ID = new Map(RACE_EVENTS.map((event) => [event.id, event]));

export function findRaceEvent(id: string): RaceEvent | undefined {
  return BY_ID.get(id);
}

export function findRaceDistance(
  event: RaceEvent,
  distanceId: string,
): RaceDistance | undefined {
  return event.distances.find((distance) => distance.id === distanceId);
}

export function raceEventsBySeries(series: RaceSeries): RaceEvent[] {
  return RACE_EVENTS.filter((event) => event.series === series).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export const RACE_SERIES_LABELS: Record<RaceSeries, string> = {
  utmb: "UTMB World Series",
  wtm: "World Trail Majors",
  marathon: "Marathon Majors",
  others: "Independent Races",
};

/** The same four, for the Chinese-language UI. */
export const RACE_SERIES_LABELS_ZH: Record<RaceSeries, string> = {
  utmb: "UTMB 世界系列賽",
  wtm: "World Trail Majors",
  marathon: "馬拉松",
  others: "其他獨立賽事",
};

/**
 * Selectable years. The lower bound predates UTMB World Series (2022) on
 * purpose: members ran these races before the series existed, and the
 * catalogue is a list of races, not of series memberships.
 */
export const EARLIEST_RACE_YEAR = 2010;

export function raceYearOptions(now: Date): number[] {
  const latest = now.getUTCFullYear() + 1;
  const years: number[] = [];
  for (let year = latest; year >= EARLIEST_RACE_YEAR; year -= 1) {
    years.push(year);
  }
  return years;
}

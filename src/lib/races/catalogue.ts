/**
 * The race catalogue: UTMB World Series and World Trail Majors.
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
 * Sources, both read 2026-07-30:
 *   - UTMB World Series 2026 calendar (theultrarunner.com, from utmb.world)
 *   - World Trail Majors 2026 calendar (worldtrailmajors.com)
 *
 * KNOWN INCOMPLETE: UTMB's own announcement puts the 2026 season at 64
 * events; 55 are listed below. The missing entries are new additions the
 * published calendar had not yet broken out. Adding one is a two-line change
 * here plus a token in design-tokens.ts — nothing else in the app enumerates
 * races.
 */

export type RaceSeries = "utmb" | "wtm";

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

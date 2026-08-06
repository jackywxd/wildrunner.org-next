/**
 * Turn the reviewed CSVs into a module the migration can import.
 *
 * WHY A GENERATED FILE AND NOT JUST READING THE CSV. Payload migrations are
 * listed in `prodMigrations`, which means they are bundled into the Worker
 * and run there. A Worker has no filesystem, so a migration that called
 * `readFileSync` would work from the CLI and fail in production — the worst
 * possible split.
 *
 * So the CSVs stay what they are: the artefact a human reviews, diffs and
 * corrects. This turns them into `src/lib/races/seed-data.ts`, which is
 * committed alongside them and imported like any other module. Regenerating
 * is a script, and the diff of the generated file is reviewable too — if it
 * changes and the CSVs did not, something is wrong.
 *
 *   pnpm tsx scripts/csv-to-seed.ts
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA = path.join(ROOT, "data");
const OUT = path.join(ROOT, "src", "lib", "races", "seed-data.ts");

/** Same minimal reader as validate-catalogue.ts, for the same reason. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows.filter((r) => r.some((c) => c !== ""));
  return body.map((cells) =>
    Object.fromEntries(header.map((key, i) => [key, (cells[i] ?? "").trim()])),
  );
}

const read = (file: string) =>
  parseCsv(fs.readFileSync(path.join(DATA, file), "utf8"));

const events = read("race-events.csv");
const categories = read("race-categories.csv");

/** Empty stays undefined rather than "": a blank cell means "not recorded". */
const opt = (value: string) => (value === "" ? undefined : value);
const num = (value: string) => (value === "" ? undefined : Number(value));

const seedEvents = events.map((e) => ({
  country: opt(e.country),
  itraUrl: opt(e.itra_url),
  key: e.key,
  name: e.name,
  nameZh: opt(e.name_zh),
  series: e.series,
  source: opt(e.source),
  verifiedAt: opt(e.verified_at),
  website: opt(e.website),
}));

const seedCategories = categories.map((c) => ({
  distanceKm: num(c.distance_km),
  elevationGainM: num(c.elevation_gain_m),
  eventKey: c.event_key,
  key: c.key,
  label: c.label,
  order: Number(c.order),
  source: opt(c.source),
  verified: c.verified === "yes",
  verifiedAt: opt(c.verified_at),
}));

const banner = `/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Produced from data/race-events.csv and data/race-categories.csv by
 * \`pnpm tsx scripts/csv-to-seed.ts\`. Edit the CSVs, which are the artefact
 * a human reviews, and regenerate.
 *
 * It exists because migrations are bundled into the Worker, where there is
 * no filesystem to read a CSV from — see that script's header.
 *
 * ${seedEvents.length} events, ${seedCategories.length} categories.
 */
`;

const body = `${banner}
export type SeedEvent = {
  country?: string;
  itraUrl?: string;
  key: string;
  name: string;
  nameZh?: string;
  series: string;
  source?: string;
  verifiedAt?: string;
  website?: string;
};

export type SeedCategory = {
  distanceKm?: number;
  elevationGainM?: number;
  eventKey: string;
  key: string;
  label: string;
  order: number;
  source?: string;
  verified: boolean;
  verifiedAt?: string;
};

export const SEED_EVENTS: SeedEvent[] = ${JSON.stringify(seedEvents, null, 2)};

export const SEED_CATEGORIES: SeedCategory[] = ${JSON.stringify(seedCategories, null, 2)};
`;

fs.writeFileSync(OUT, body, "utf8");
console.log(
  `${OUT}\n${seedEvents.length} events, ${seedCategories.length} categories`,
);

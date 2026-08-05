/**
 * Gate the reviewed catalogue CSVs before anything imports them.
 *
 * These two files are about to become the database's source of truth for
 * every race and every category a member can claim. Once imported, a wrong
 * row is a foreign key somebody's badge points at. So the checks here run
 * *before* the import, and a failure stops it — the alternative is finding
 * out from a member's profile.
 *
 * Deliberately not a test file. It runs as a precondition of the migration,
 * not as part of a suite somebody might skip, and it has to be runnable
 * against an edited CSV in the middle of a review pass.
 *
 *   pnpm tsx scripts/validate-catalogue.ts
 *   pnpm tsx scripts/validate-catalogue.ts --require-verified
 */
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(import.meta.dirname, "..", "data");
const requireVerified = process.argv.includes("--require-verified");

const SERIES = new Set(["utmb", "wtm", "others"]);

/**
 * Minimal RFC 4180 reader — enough for these two files, which are written by
 * `export-catalogue.ts` and then hand-edited in a spreadsheet.
 *
 * Hand-written rather than pulled in as a dependency because a spreadsheet
 * round-trip is the only thing that touches these files, and quoted commas
 * inside a race name ("Puerto Vallarta, México") is the whole of the
 * complexity. Anything a parser would add here would be unused.
 */
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

const problems: string[] = [];
const warnings: string[] = [];
const fail = (message: string) => problems.push(message);
const warn = (message: string) => warnings.push(message);

function read(file: string): Record<string, string>[] {
  const target = path.join(DATA_DIR, file);
  if (!fs.existsSync(target)) {
    console.error(`missing ${target} — run \`pnpm tsx scripts/export-catalogue.ts\` first.`);
    process.exit(1);
  }
  return parseCsv(fs.readFileSync(target, "utf8"));
}

const events = read("race-events.csv");
const categories = read("race-categories.csv");

// --- events -----------------------------------------------------------
const eventKeys = new Set<string>();
for (const event of events) {
  const key = event.key;
  if (!key) fail(`events: a row has no key (${event.name || "unnamed"})`);
  else if (eventKeys.has(key)) fail(`events: duplicate key "${key}"`);
  else eventKeys.add(key);

  if (!event.name) fail(`events: ${key} has no name`);
  if (!SERIES.has(event.series)) {
    fail(`events: ${key} has series "${event.series}", expected utmb|wtm|others`);
  }
  // Country is ISO 3166-1 alpha-3 everywhere else in this codebase
  // (RaceSchedule validates the same shape); a two-letter code here would
  // render as a wrong flag rather than fail loudly.
  if (event.country && !/^[A-Z]{3}$/.test(event.country)) {
    fail(`events: ${key} country "${event.country}" is not ISO alpha-3`);
  }
  if (event.website && !/^https?:\/\//.test(event.website)) {
    fail(`events: ${key} website "${event.website}" must start with http(s)://`);
  }
  // A missing website is only acceptable when `source` explains it. Three
  // events genuinely have none: the Barkley (entry is by email to a secret
  // address), Huangshan 168 (rotating sponsor names, third-party
  // registration), and Mauritius (its UTMB site redirects away). Silence
  // would be indistinguishable from nobody having looked.
  if (!event.website && !event.source) {
    fail(`events: ${key} has no website and no source explaining why`);
  }
}

// --- categories -------------------------------------------------------
const seenCategory = new Set<string>();
const byEvent = new Map<string, Record<string, string>[]>();

for (const category of categories) {
  const event = category.event_key;
  const key = category.key;

  if (!eventKeys.has(event)) {
    fail(`categories: "${event}" is not an event key (${key})`);
    continue;
  }
  if (!key) fail(`categories: ${event} has a row with no key`);
  if (!category.label) fail(`categories: ${event}/${key} has no label`);

  const pair = `${event}/${key}`;
  if (seenCategory.has(pair)) fail(`categories: duplicate ${event}/${key}`);
  seenCategory.add(pair);

  for (const field of ["distance_km", "elevation_gain_m", "order"] as const) {
    const value = category[field];
    if (value && !Number.isFinite(Number(value))) {
      fail(`categories: ${event}/${key} ${field} "${value}" is not a number`);
    }
  }
  if (category.verified !== "yes" && category.verified !== "no") {
    fail(`categories: ${event}/${key} verified must be yes or no`);
  }
  // A claim needs a source. Not required for `no` — that is the point of
  // `no`: nobody has looked yet.
  if (category.verified === "yes" && !category.source) {
    warn(`categories: ${event}/${key} is verified but names no source`);
  }

  const list = byEvent.get(event) ?? [];
  list.push(category);
  byEvent.set(event, list);
}

// Every event needs at least one category: an event nobody can claim a
// finish in is a row that can never be used.
for (const key of eventKeys) {
  if (!byEvent.has(key)) fail(`categories: event "${key}" has none`);
}

// --- cross-check against the live schedule ----------------------------
//
// THE CHECK THAT MATTERS. `race_schedule.distance_summary` is free text an
// editor typed off the event's own site — so where it disagrees with the
// catalogue, the catalogue is usually the one that is wrong. That is how
// `utmb-whistler` ended up offering 20K/50K/100K/100M while its schedule row
// reads "100K / 50K / 25K / 10K": the schedule was researched, the catalogue
// was defaulted.
//
// Read from the seed rather than from a database so this runs offline and
// during review, before any import has happened.
const { ROWS: scheduleRows } = await import("./seed-race-schedule");

if (scheduleRows) {
  for (const row of scheduleRows) {
    const summary = row.distanceSummary;
    const list = byEvent.get(row.eventId);
    if (!summary || !list) continue;

    // Compare on the numbers only: "100K / 50K / 25K / 10K" vs labels
    // "20K","50K","100K","100M". Loose on purpose — this is a prompt for a
    // human to look, not an assertion about formatting.
    const inSummary = new Set(summary.match(/\d+\s*[KkMm]/g)?.map((s) => s.replace(/\s/g, "").toUpperCase()) ?? []);
    const labels = list.map((c) => c.label.replace(/\s/g, "").toUpperCase());
    // Substring, not equality: a properly-named category reads "Lavaredo
    // 120K" or "T102", while the schedule's free text says "120K". Once an
    // event's categories come from its own site they carry the event's
    // naming, and an equality test would flag every one of them.
    const missing = [...inSummary].filter(
      (d) => !labels.some((label) => label.includes(d)),
    );
    if (missing.length > 0) {
      warn(
        `${row.eventId}: schedule offers ${missing.join(", ")} but the catalogue has ` +
          `${labels.join(", ")} — "${row.name}"`,
      );
    }
  }
}

// --- verified gate ----------------------------------------------------
const unverified = categories.filter((c) => c.verified === "no");
const unverifiedEvents = new Set(unverified.map((c) => c.event_key));

if (requireVerified && unverified.length > 0) {
  fail(
    `${unverified.length} categories across ${unverifiedEvents.size} events are still ` +
      `verified=no. Import refuses to run with --require-verified.`,
  );
}

// --- report -----------------------------------------------------------
console.log(`${events.length} events, ${categories.length} categories.`);
if (unverified.length > 0) {
  console.log(
    `${unverified.length} categories across ${unverifiedEvents.size} events are unverified.`,
  );
}

for (const message of warnings) console.warn(`warn  ${message}`);
for (const message of problems) console.error(`FAIL  ${message}`);

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s). Not safe to import.`);
  process.exit(1);
}
console.log(warnings.length > 0 ? `\nOK, with ${warnings.length} warning(s).` : "\nOK.");

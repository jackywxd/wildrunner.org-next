/**
 * Snapshot every badge the site renders, as data rather than pixels.
 *
 * WHAT THIS IS FOR. The race catalogue is moving out of code and into the
 * database, in steps. Each step is supposed to change how a badge is
 * *built* and nothing about what it *says* — and the only trustworthy proof
 * of that is comparing what a visitor actually sees before and after.
 *
 * Assertions cannot do this job. A test asserts what we believe should be
 * true; this records what is true, and the diff is the evidence. A wrong
 * category silently mapped to the right event would pass every referential
 * check and show up here as a changed line.
 *
 * `data-event-id` / `data-distance-id` / `data-year` are exactly the three
 * values a badge claims, and `RaceBadge` has emitted them since it was
 * written — see the `data-testid="race-badge"` element there.
 *
 *   npx tsx scripts/capture-badges.ts > before.json
 *   # ...change something...
 *   npx tsx scripts/capture-badges.ts > after.json
 *   diff before.json after.json
 *
 * Set BASE_URL to point at staging or production; it defaults to the local
 * dev server. Output carries no PII — three ids and a year per badge — so
 * a captured baseline is safe to keep around, unlike a database export.
 */
// Top-level await needs this file to be a module, and it imports nothing.
export {};

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

type Badge = { distanceId: string; eventId: string; page: string; year: string };

/**
 * A page that fails is recorded, not thrown on.
 *
 * Aborting on the first non-200 would leave no output at all, and a capture
 * that produced nothing is indistinguishable from a capture that found no
 * badges. Recording the failure keeps the two comparable — and a page that
 * 500s on one side of the diff is itself the finding.
 */
const failures: { page: string; status: number }[] = [];

async function html(path: string): Promise<string> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { Accept: "text/html" },
  });
  if (!response.ok) {
    failures.push({ page: path, status: response.status });
    return "";
  }
  return response.text();
}

/**
 * Read the attributes off every `race-badge` element.
 *
 * A regex rather than a DOM parser because the target is a self-closing
 * `<svg>` opening tag with a fixed attribute set that this repo emits
 * itself. Pulling in a parser to read four attributes off our own markup
 * would be more moving parts than the thing being verified.
 */
function badges(markup: string, page: string): Badge[] {
  const found: Badge[] = [];
  const tag = /<svg\b[^>]*data-testid="race-badge"[^>]*>/g;
  const attr = (source: string, name: string): string =>
    new RegExp(`${name}="([^"]*)"`).exec(source)?.[1] ?? "";

  for (const match of markup.matchAll(tag)) {
    found.push({
      distanceId: attr(match[0], "data-distance-id"),
      eventId: attr(match[0], "data-event-id"),
      page,
      year: attr(match[0], "data-year"),
    });
  }
  return found;
}

/** Every rider page, discovered from the directory rather than hard-coded. */
function riderPaths(directory: string): string[] {
  const hrefs = new Set<string>();
  for (const match of directory.matchAll(/href="(\/riders\/[^"#?]+)"/g)) {
    hrefs.add(match[1]);
  }
  return [...hrefs].sort();
}

const pages = ["/riders"];
const directory = await html("/riders");
pages.push(...riderPaths(directory));

const all: Badge[] = [];
for (const page of pages) {
  all.push(...badges(page === "/riders" ? directory : await html(page), page));
}

// Sorted so the diff shows real changes rather than render order, which is
// not something this is trying to pin down.
all.sort(
  (a, b) =>
    a.page.localeCompare(b.page) ||
    a.eventId.localeCompare(b.eventId) ||
    a.distanceId.localeCompare(b.distanceId) ||
    a.year.localeCompare(b.year),
);

console.log(
  JSON.stringify(
    { badges: all, count: all.length, failures, pages: pages.length },
    null,
    2,
  ),
);

// Non-zero on any failed page, so a capture run inside a script cannot
// quietly produce a shorter baseline than the one it is compared against.
if (failures.length > 0) process.exitCode = 1;

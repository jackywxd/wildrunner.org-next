/**
 * Seed the race schedule with a starting set of dated editions.
 *
 * Usage:
 *   pnpm seed:races:dry          # validate + print, write nothing
 *   pnpm seed:races              # local D1
 *   pnpm seed:races:staging      # remote staging D1
 *   pnpm seed:races:prod         # remote production D1
 *
 * THIS DATA IS A DRAFT, NOT AN AUTHORITY.
 *
 * There is no official API for race dates — UTMB, World Trail Majors and
 * the independent organisers all publish web pages only — so every row below
 * was read off a published calendar by hand and carries the URL it came
 * from. Race dates move; registration windows move far more often. The run
 * ends by printing every row for the site owner to check against the
 * official site, and `verifiedAt` records when that last happened so the
 * daily maintenance job can nag about rows nobody has looked at in months.
 *
 * The rule this file follows, and which anyone adding to it should keep:
 * A FIELD NOBODY COULD CONFIRM IS LEFT EMPTY. An empty registration window
 * renders as "報名資訊待公布", which is true. A guessed one sends somebody
 * to an entry form that closed, which is the worst thing this feature can
 * do.
 *
 * EVERY ROW NEEDS AN eventId. It is the key into src/lib/races/catalogue.ts,
 * and without it the race carries no badge and no member can write a report
 * about it — see the header of src/collections/RaceSchedule.ts. Adding a
 * race here therefore starts by adding it to the catalogue.
 *
 * Idempotent on (eventId, startDate): re-running skips rows that
 * already exist rather than duplicating them, so it is safe to run after
 * adding entries here.
 *
 * THAT PAIR IS ALSO THE ANNUAL-REFRESH KEY, and the reason it is a pair.
 * A race's identity does not change between seasons; its dates do. So next
 * year's Hardrock is the same `other-hardrock` with a new `startDate`, and
 * this script sees an eventId it knows at a date it does not — a create,
 * not a skip. Last year's row stays exactly where it is, which is required:
 * a member's race report points at the edition they ran.
 *
 * Refreshing a season is therefore just editing the dates here and running
 * the script again. Nothing needs deleting, and no row is ever rewritten in
 * place — a row that has to *change* (a date moved after publication) is an
 * admin-panel edit, because that is a correction rather than a new edition.
 */
import { pathToFileURL } from "node:url";

import { getPayload } from "payload";
import type { Where } from "payload";
import { z } from "zod";

import { findRaceEvent } from "../src/lib/races/catalogue";
import type { ScheduleSeries } from "../src/lib/races/catalogue";

const dryRun = process.argv.includes("--dry-run");
const remote = process.argv.includes("--remote");

/**
 * The day the original rows below were read off their sources. A row added
 * later carries its own `verifiedAt` instead — bumping this constant would
 * claim every row was re-checked on that day, and the maintenance job's
 * "nobody has verified this in 90 days" report is only worth anything if
 * that date is true.
 */
const VERIFIED_AT = "2026-08-01";

type SeedRow = {
  name: string;
  nameZh?: string;
  series: ScheduleSeries;
  eventId: string;
  startDate: string;
  endDate?: string;
  country?: string;
  location?: string;
  distanceSummary?: string;
  url?: string;
  registrationOpensAt?: string;
  registrationClosesAt?: string;
  registrationUrl?: string;
  registrationType?: "first-come" | "lottery" | "qualifier" | "invitational";
  /**
   * Only for what dates cannot express — a sold-out or cancelled edition.
   * Checked before the dates, so it wins over the derived status; the daily
   * maintenance job clears it once the race has run.
   */
  registrationStatusOverride?: "full" | "waitlist" | "cancelled" | "tba";
  notes?: string;
  /** Where this row was read from. Required — see the file header. */
  sourceUrl: string;
  /** The day this row was read off its source, when that is not VERIFIED_AT. */
  verifiedAt?: string;
};

/**
 * Covers roughly 2026-08 through 2027-07, with all three series
 * represented. Nowhere near every race that runs in that window: the point
 * is a schedule that is useful on day one and a shape for the owner to
 * extend, not a complete calendar nobody can maintain.
 */
/**
 * Exported so other tooling can read the seed rows without running the
 * seed. `validate-catalogue.ts` cross-checks `distanceSummary` against the
 * catalogue's categories, and that check has to work offline, mid-review,
 * before anything has been imported.
 */
export const ROWS: SeedRow[] = [
  {
    name: "Sierre-Zinal",
    series: "others",
    eventId: "other-sierre-zinal",
    startDate: "2026-08-08",
    country: "CHE",
    location: "Sierre → Zinal, Valais",
    distanceSummary: "31K",
    url: "https://www.sierre-zinal.com/",
    sourceUrl: "https://www.sierre-zinal.com/en/sierre-zinal-2026-dates-2840.html",
  },
  {
    name: "HOKA UTMB Mont-Blanc",
    nameZh: "UTMB 白朗峰",
    series: "utmb",
    eventId: "utmb-mont-blanc",
    startDate: "2026-08-24",
    endDate: "2026-08-30",
    country: "FRA",
    location: "Chamonix",
    distanceSummary: "UTMB / CCC / OCC / TDS / MCC / PTL / ETC / YCC",
    url: "https://montblanc.utmb.world/",
    registrationType: "lottery",
    notes: "賽事週；各分項起跑日不同。2026 年報名早已結束。",
    sourceUrl: "https://www.ahotu.com/event/hoka-ultra-trail-du-mont-blanc",
  },
  {
    name: "Tor des Géants",
    series: "others",
    eventId: "other-tor-des-geants",
    startDate: "2026-09-13",
    endDate: "2026-09-19",
    country: "ITA",
    location: "Courmayeur, Valle d'Aosta",
    distanceSummary: "330K",
    url: "https://torxtrail.com/",
    sourceUrl: "https://torxtrail.com/tor330-tor-des-geants/",
  },
  {
    name: "Grand Raid de la Réunion",
    nameZh: "瘋人對角線",
    series: "others",
    eventId: "other-diagonale-des-fous",
    startDate: "2026-10-15",
    endDate: "2026-10-18",
    country: "REU",
    location: "Saint-Pierre, La Réunion",
    distanceSummary: "Diagonale des Fous 180K / Trail de Bourbon / Mascareignes",
    url: "https://www.grandraid-reunion.com/",
    notes: "第 34 屆；2026 年路線改經 Salazie，Diagonale 距離延長為 180K。",
    sourceUrl:
      "https://la1ere.franceinfo.fr/reunion/grand-raid-2026-decouvrez-les-traces-des-cinq-courses-1682019.html",
  },
  {
    name: "RMB Ultra-Trail Cape Town",
    series: "wtm",
    eventId: "wtm-cape-town",
    startDate: "2026-11-20",
    endDate: "2026-11-22",
    country: "ZAF",
    location: "Cape Town",
    distanceSummary: "100M / 100K / 65K / 35K / 21K",
    url: "https://www.ultratrailcapetown.com/",
    registrationUrl: "https://www.ultratrailcapetown.com/enter",
    sourceUrl: "https://www.ahotu.com/event/ultra-trail-cape-town",
  },
  {
    name: "Anta Guanjun Hong Kong 100",
    nameZh: "香港 100",
    series: "wtm",
    eventId: "wtm-hk100",
    startDate: "2027-01-23",
    country: "HKG",
    location: "Sai Kung, New Territories",
    distanceSummary: "100K",
    url: "https://hk100ultra.com/",
    registrationType: "lottery",
    notes: "報名採抽籤；2027 年抽籤日期待官方公布。",
    sourceUrl: "https://ultraracecalendar.com/events/6165/hong-kong-100/",
  },
  {
    name: "Tarawera Ultra-Trail",
    series: "utmb",
    eventId: "utmb-tarawera",
    startDate: "2027-02-13",
    endDate: "2027-02-14",
    country: "NZL",
    location: "Rotorua",
    distanceSummary: "100M / 102K / 50K / 21K / 14K",
    url: "https://tarawera.utmb.world/",
    registrationUrl: "https://tarawera.utmb.world/runners/entry-info",
    sourceUrl: "https://www.ahotu.com/event/tarawera-ultramarathon-by-utmb",
  },
  {
    name: "The North Face Transgrancanaria",
    series: "wtm",
    eventId: "wtm-transgrancanaria",
    startDate: "2027-02-24",
    endDate: "2027-02-28",
    country: "ESP",
    location: "Gran Canaria",
    distanceSummary: "Classic 128K / Advanced / Marathon / Starter",
    url: "https://transgrancanaria.net/",
    // The only row here with a confirmed open window: the organiser
    // announced registration opening on 1 July 2026. No closing date was
    // published, so none is claimed.
    registrationOpensAt: "2026-07-01",
    notes: "Classic 屬 World Trail Majors，Marathon 屬 Short Series。",
    sourceUrl:
      "https://transgrancanaria.net/en/the-north-face-transgrancanaria-2027-opens-registrations-on-1-july/",
  },
  {
    name: "Mt. FUJI 100",
    nameZh: "富士山 100",
    series: "wtm",
    eventId: "wtm-mt-fuji",
    startDate: "2027-04-23",
    endDate: "2027-04-24",
    country: "JPN",
    location: "Yamanashi / Shizuoka",
    distanceSummary: "100M / Kai 70K",
    url: "https://en.mtfuji100.com/",
    notes: "2027 年日期尚未經官方最終確認，請以官網公告為準。",
    sourceUrl: "https://www.finishers.com/en/event/mt-fuji-100",
  },
  {
    name: "La Sportiva Lavaredo Ultra Trail",
    series: "utmb",
    eventId: "utmb-lavaredo",
    startDate: "2027-06-25",
    endDate: "2027-06-26",
    country: "ITA",
    location: "Cortina d'Ampezzo",
    distanceSummary: "120K / 80K / 50K / 20K",
    url: "https://lavaredo.utmb.world/",
    sourceUrl: "https://ultraracecalendar.com/events/3923/lavaredo-ultra-trail-by-utmb/",
  },
  {
    name: "Western States 100",
    nameZh: "西部 100",
    series: "utmb",
    eventId: "utmb-western-states",
    startDate: "2027-06-26",
    country: "USA",
    location: "Olympic Valley → Auburn, California",
    distanceSummary: "100M",
    url: "https://www.wser.org/",
    registrationOpensAt: "2026-11-01",
    registrationType: "lottery",
    notes:
      "賽事日期依「六月最後一個週六」慣例推算，尚待官方確認。抽籤報名 2026 年 11 月開放，抽籤日待公布。",
    sourceUrl: "https://www.wser.org/lottery/",
  },
  {
    name: "Hardrock 100",
    series: "others",
    eventId: "other-hardrock",
    startDate: "2027-07-09",
    country: "USA",
    location: "Silverton, Colorado",
    distanceSummary: "100M",
    url: "https://hardrock100.com/",
    registrationOpensAt: "2026-10-01",
    registrationClosesAt: "2026-10-14",
    registrationType: "lottery",
    notes: "抽籤結果 2026-12-05 公布；需完成指定資格賽。",
    sourceUrl: "https://hardrock100.com/hardrock-lottery.php",
  },
  {
    name: "Ticino Wildlands 500",
    series: "others",
    eventId: "other-ticino-wildlands",
    startDate: "2026-08-08",
    endDate: "2026-08-18",
    country: "CHE",
    location: "Ticino",
    // The 500 is confirmed at 500K / 40,000m D+ / 250h. The 250 and 50 are
    // published as category names only — their distances are not stated
    // anywhere I could read, and the site's /en/ pages 404 to automated
    // fetches, so the numbers are not claimed here.
    distanceSummary: "Ticino 500 / Ticino 250 / Ticino 50",
    url: "https://www.ticino500.ch/",
    registrationUrl: "https://join.endu.net/entry?edition=102363",
    notes: "主賽事 500K，累積爬升 40,000 公尺，關門 250 小時。",
    sourceUrl: "https://www.ticino500.ch/",
    verifiedAt: "2026-08-04",
  },
  {
    name: "Squamish 50",
    series: "others",
    eventId: "other-squamish-50",
    startDate: "2026-08-15",
    endDate: "2026-08-16",
    country: "CAN",
    location: "Squamish, British Columbia",
    distanceSummary: "50M / 50K / 50-50 / 23K",
    url: "https://squamish50.com/",
    registrationUrl:
      "https://raceroster.com/events/2026/111341/nesters-market-squamish-50",
    // Every distance hit its cap (23K at 600, 50K at 625, 50M at 350, 50/50
    // at 200) and the organiser states there is no waitlist and no
    // transfers. "full" rather than a closing date because no closing date
    // was published — it sold out, which is not the same thing.
    registrationStatusOverride: "full",
    notes: "2026 各分項皆已額滿，官方明言不設候補、不接受轉讓。",
    sourceUrl: "https://squamish50.com/registration/",
    verifiedAt: "2026-08-04",
  },
  // The four below were added once /races began showing past races. Three
  // of them had already been run when they were entered, which is the point:
  // a schedule that only ever looked forward had no way to be wrong about
  // one, so they are also the first real test of the finished state.
  {
    name: "Québec Mega Trail",
    series: "wtm",
    eventId: "wtm-quebec-mega-trail",
    startDate: "2026-07-03",
    endDate: "2026-07-04",
    country: "CAN",
    location: "Charlevoix / Côte-de-Beaupré, Québec",
    // The live site had already rolled over to promoting 2027 by the time
    // this was checked — the 2026 edition is finished — so the schedule page
    // shown is 2027's, not 2026's. Taken as still representative of what a
    // QMT weekend offers: it lists TransQMT (18km) as its own timed start
    // alongside the numbered QMT categories, which the original entry missed.
    distanceSummary: "QMT135 / 80 / 50 / 32 / 25 / 15 / 6 / 1 / TransQMT18",
    url: "https://ultratrailcanada.com/en/",
    sourceUrl: "https://ultratrailcanada.com/en/",
    verifiedAt: "2026-08-06",
  },
  {
    name: "Sinister 7 Ultra",
    series: "others",
    eventId: "other-sinister-7",
    startDate: "2026-07-11",
    endDate: "2026-07-12",
    country: "CAN",
    location: "Crowsnest Pass, Alberta",
    distanceSummary: "100M / 50M / 50K / 半馬 / 接力",
    url: "https://www.sinistersports.ca/sinister7/",
    sourceUrl: "https://www.sinistersports.ca/sinister7/",
    verifiedAt: "2026-08-06",
  },
  {
    name: "Canadian Death Race",
    series: "others",
    eventId: "other-canadian-death-race",
    startDate: "2026-08-01",
    endDate: "2026-08-02",
    country: "CAN",
    location: "Grande Cache, Alberta",
    distanceSummary: "118K / 42K / 接力",
    url: "https://www.sinistersports.ca/deathrace/",
    // The page carries both "registration opens 2026-10-10" and "deadline
    // 2026-07-18", which cannot both describe one edition — it is mixing the
    // finished 2026 race with the 2027 opening. Neither is claimed here.
    sourceUrl: "https://www.sinistersports.ca/deathrace/",
    verifiedAt: "2026-08-06",
  },
  {
    name: "Ultra Trail Whistler by UTMB",
    nameZh: "威士拿 UTMB",
    series: "utmb",
    eventId: "utmb-whistler",
    // The original entry started this a day early. The site's own copy says
    // "two days of racing", and every category confirms it: 100K and 50K
    // both start the 22nd, 25K and 10K both start the 23rd — nothing runs on
    // the 21st.
    startDate: "2026-08-22",
    endDate: "2026-08-23",
    country: "CAN",
    location: "Whistler, British Columbia",
    distanceSummary: "100K / 50K / 25K / 10K",
    url: "https://whistler.utmb.world/",
    // The site lists registration opening 8/22–8/23, inside this race's own
    // dates. That is the 2027 edition opening as the 2026 one is run, which
    // is the usual UTMB pattern — but it is not stated as such, so it is
    // left off rather than attached to the wrong year.
    sourceUrl: "https://whistler.utmb.world/",
    verifiedAt: "2026-08-06",
  },
];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

const rowSchema = z
  .object({
    country: z.string().regex(/^[A-Z]{3}$/).optional(),
    distanceSummary: z.string().optional(),
    endDate: isoDate.optional(),
    eventId: z.string(),
    location: z.string().optional(),
    name: z.string().min(1),
    nameZh: z.string().optional(),
    notes: z.string().optional(),
    registrationClosesAt: isoDate.optional(),
    registrationOpensAt: isoDate.optional(),
    registrationStatusOverride: z
      .enum(["full", "waitlist", "cancelled", "tba"])
      .optional(),
    registrationType: z
      .enum(["first-come", "lottery", "qualifier", "invitational"])
      .optional(),
    registrationUrl: z.string().url().optional(),
    series: z.enum(["utmb", "wtm", "others"]),
    sourceUrl: z.string().url(),
    startDate: isoDate,
    url: z.string().url().optional(),
    verifiedAt: isoDate.optional(),
  })
  // The same invariants the collection validators enforce, checked here so
  // a bad row is reported with its name rather than surfacing as a Payload
  // error halfway through the run.
  .refine((row) => !row.endDate || row.endDate >= row.startDate, {
    message: "endDate is before startDate",
  })
  .refine(
    (row) =>
      !row.registrationClosesAt ||
      !row.registrationOpensAt ||
      row.registrationClosesAt >= row.registrationOpensAt,
    { message: "registration closes before it opens" },
  )
  .refine(
    (row) => !row.registrationClosesAt || row.registrationClosesAt <= row.startDate,
    { message: "registration closes after the race has run" },
  )
  .refine((row) => Boolean(findRaceEvent(row.eventId)), {
    message: "eventId is not in the race catalogue",
  })
  .refine(
    (row) => findRaceEvent(row.eventId)?.series === row.series,
    {
      // Not fatal in the collection — a schedule row is allowed to present a
      // race under a different series than its badge uses — but in seed data
      // it is almost always a typo, so it is worth surfacing.
      message: "series does not match the catalogue entry for this eventId",
    },
  );

/** Payload wants a full ISO timestamp; midnight UTC keeps the calendar day intact. */
const at = (date: string | undefined): string | undefined =>
  date ? `${date}T00:00:00.000Z` : undefined;

async function main(): Promise<void> {
  const valid: SeedRow[] = [];
  const invalid: { row: string; problems: string[] }[] = [];

  for (const row of ROWS) {
    const parsed = rowSchema.safeParse(row);
    if (parsed.success) valid.push(row);
    else {
      invalid.push({
        problems: parsed.error.issues.map(
          (issue) => `${issue.path.join(".") || "row"}: ${issue.message}`,
        ),
        row: `${row.name} (${row.startDate})`,
      });
    }
  }

  for (const bad of invalid) {
    console.error(`invalid: ${bad.row}`);
    for (const problem of bad.problems) console.error(`    ${problem}`);
  }

  console.log(`${valid.length} valid rows, ${invalid.length} rejected.`);

  if (dryRun) {
    printChecklist(valid);
    // A rejected row is a mistake in this file, not a data condition — fail
    // so it cannot be missed in CI output.
    if (invalid.length > 0) process.exit(1);
    return;
  }

  if (remote) {
    // payload.config picks bindings via getPlatformProxy({ environment:
    // CLOUDFLARE_ENV }), so without NODE_ENV=production --remote would
    // happily write every row to the local D1 and report success.
    //
    // The target is named, never defaulted. This used to fall back to
    // `?? "staging"`, which made `seed:races:prod` — no CLOUDFLARE_ENV in
    // its package.json line, by the same convention the media:backfill-size
    // pair uses — write to staging and report success under a name that
    // promised production. A wrong destination that prints "created 24" is
    // undetectable from the output; refusing to guess is the only version
    // of this that cannot lie. Defaulting the other way is worse still: a
    // bare `--remote` would then reach production.
    const target = process.env.CLOUDFLARE_ENV;
    if (target !== "staging" && target !== "production") {
      console.error(
        "--remote needs an explicit target: CLOUDFLARE_ENV=staging or " +
          "CLOUDFLARE_ENV=production (use pnpm seed:races:staging / " +
          "seed:races:prod).",
      );
      process.exit(1);
    }

    Object.assign(process.env, {
      NODE_ENV: "production",
      // wrangler names the top-level environment by its absence, so
      // "production" has to become undefined rather than be passed through
      // — an environment literally named "production" does not exist in
      // wrangler.jsonc and would fail to resolve.
      CLOUDFLARE_ENV: target === "production" ? undefined : target,
    });
    if (target === "production") delete process.env.CLOUDFLARE_ENV;

    console.log(`target: ${target} (remote D1)`);
  }

  const { default: config } = await import("@payload-config");
  const payload = await getPayload({ config });

  let created = 0;
  let skipped = 0;

  for (const row of valid) {
    // `eventId` alone, never the name: a race gets renamed (Squamish 50/50
    // → Squamish 50 happened here) and matching on the name would then
    // insert a second row for the same edition. The catalogue id cannot
    // change — that is the guarantee RaceEvent.id makes.
    const identity: Where = { eventId: { equals: row.eventId } };

    const existing = await payload.find({
      collection: "race-schedule",
      depth: 0,
      limit: 1,
      pagination: false,
      overrideAccess: true,
      where: {
        and: [
          identity,
          { startDate: { greater_than_equal: `${row.startDate}T00:00:00.000Z` } },
          { startDate: { less_than_equal: `${row.startDate}T23:59:59.999Z` } },
        ],
      },
    });

    if (existing.docs.length > 0) {
      skipped += 1;
      console.log(`skip   ${row.startDate}  ${row.name}`);
      continue;
    }

    await payload.create({
      collection: "race-schedule",
      overrideAccess: true,
      data: {
        country: row.country,
        distanceSummary: row.distanceSummary,
        endDate: at(row.endDate),
        eventId: row.eventId,
        location: row.location,
        name: row.name,
        nameZh: row.nameZh,
        notes: row.notes,
        registrationClosesAt: at(row.registrationClosesAt),
        registrationOpensAt: at(row.registrationOpensAt),
        registrationStatusOverride: row.registrationStatusOverride,
        registrationType: row.registrationType ?? "first-come",
        registrationUrl: row.registrationUrl,
        series: row.series,
        sourceUrl: row.sourceUrl,
        startDate: at(row.startDate)!,
        url: row.url,
        verifiedAt: at(row.verifiedAt ?? VERIFIED_AT),
      },
    });

    created += 1;
    console.log(`create ${row.startDate}  ${row.name}`);
  }

  console.log(`\ncreated ${created}, skipped ${skipped}.`);
  printChecklist(valid);
}

/**
 * The point of the run, as far as the site owner is concerned: a list to
 * tick off against the official sites. Printing it on every run — not just
 * the dry one — because the rows are just as unverified after they land.
 */
function printChecklist(rows: SeedRow[]): void {
  console.log("\n--- 請逐筆對照官網確認 ---");
  console.log("日期與報名時間都可能異動，尤其是報名開放／截止日。");
  for (const row of rows) {
    const window =
      row.registrationOpensAt || row.registrationClosesAt
        ? `報名 ${row.registrationOpensAt ?? "?"} → ${row.registrationClosesAt ?? "?"}`
        : "報名資訊未填";
    console.log(
      `[ ] ${row.startDate}${row.endDate ? `–${row.endDate}` : ""}  ${row.name}`,
    );
    console.log(`      ${window}`);
    console.log(`      ${row.sourceUrl}`);
  }
}

// Only when run as a script. Importing this module used to seed a database
// as a side effect of the import, which is what stopped `ROWS` from being
// reusable — and would have made a stray import in a test connect to
// whatever CLOUDFLARE_ENV happened to be set to.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then(() => {
      // Booting Payload from the CLI leaves something on the event loop, so a
      // script that has finished its work still never returns — it prints its
      // success line and sits there, which looks exactly like a hang. AGENTS.md
      // records the ten minutes that cost. Now that CI runs this as a step, a
      // missing exit would burn the job's whole timeout instead.
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

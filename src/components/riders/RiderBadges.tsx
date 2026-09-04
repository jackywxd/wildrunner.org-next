import type { SiteRaceRecord } from "@/lib/content-types";
import { RaceBadge, SixMajorsBadge } from "@/lib/races/badge";
import { groupRecordsBySeries, resolveBadge } from "@/lib/races/badge-source";
import { catalogueMap, getRaceCatalogueEvents } from "@/lib/races/catalogue-db";
import type { RaceCatalogueMap } from "@/lib/races/catalogue-shape";
import { RACE_SERIES_LABELS } from "@/lib/races/catalogue";
import { getDictionary } from "@/lib/i18n/dictionary";
import {
  SIX_MAJORS,
  SIX_MAJORS_LABEL_ZH,
  sixMajorsProgress,
} from "@/lib/races/six-majors";

/**
 * Badge size on a directory card.
 *
 * 36 rather than the 32 this drew while the badges lived inside the card's
 * text column: the band is 20 of the badge's 64 user units, so at 32px the
 * distance label rendered at about 6px and every one of them was a smudge.
 *
 * THE CEILING IS MEASURED, NOT CHOSEN, and it is set by one card: the
 * narrowest the grid is ever two-up on. That is the 1024px viewport, where
 * a card is 472px and its inside 430 — measured, because the arithmetic was
 * wrong here once before (it put the 768px card at 360/320 when it was
 * 344/304, having guessed the container's padding) and a 40px badge shipped
 * on that guess and wrapped.
 *
 * The widest shelf is eight tiles — a Six Star, `limit` races, and the
 * overflow — so a tile may cost at most (430 - 7 gaps × 6px) / 8 = 48.5px.
 * 44 measures 394 against 430: 36px of slack, and no wrap at any width the
 * grid is two-up.
 *
 * WHAT ACTUALLY RAISED IT was moving the grid to two-up at `lg` rather than
 * `md`. Widening the page to max-w-6xl on its own did nothing for this —
 * that width only takes effect from 1152px up, while this number is decided
 * at the bottom of the two-up range, which was 768px and is now 1024.
 *
 * Still deliberately short of BADGE_YEAR_MIN_SIZE (56): crossing it would
 * put a year into the same band as the distance, and this page's question is
 * "who has run what", not "when" — the year is on the profile, at 72.
 *
 */
const ROW_BADGE_SIZE = 44;

/**
 * The shelf: a band across the bottom of the card, not a fourth line of text.
 *
 * The badges used to be the last block inside the card's identity column —
 * indented under the name and sharing that column's ~330px with it, which is
 * the crowding this redesign was asked to fix. Here they get the card's full
 * width and a rule of their own, because a strip of graphics directly under
 * a line of type reads as part of the same block otherwise.
 *
 * `mt-auto` is what makes a grid of these look deliberate: the card is
 * stretched to its row's height, so without it the shelf sits wherever the
 * text above it happens to end and no two cards in a row agree. Pinned to
 * the bottom, the rules line up across the row whatever is above them.
 *
 * `flex-wrap` is graceful degradation, and it is scoped: ROW_BADGE_SIZE is
 * set so a full shelf stays on one line at every width the grid is two-up,
 * because that is where a wrap would cost a row its alignment. Below 1024
 * the grid is one column, there is no neighbour to line up with, and the
 * card is far wider than the shelf until the screen is a phone — measured,
 * 394px of tiles against 662px of card at 768 and 284px at 390. A phone
 * gets a second line, which is a better answer than badges sized for the
 * smallest screen anyone might use.
 */
const SHELF_CLASS =
  "mt-auto flex flex-wrap items-center gap-1.5 border-t border-border pt-4";

/**
 * One badge per event, showing the most recent year.
 *
 * A directory row has room for a handful of badges, and somebody who has
 * run the same race eight times would otherwise fill the row with eight
 * near-identical squares and crowd out every other race they have done. The
 * profile page shows the full history.
 */
function latestPerEvent(records: SiteRaceRecord[]): SiteRaceRecord[] {
  const best = new Map<string, SiteRaceRecord>();
  for (const record of records) {
    const current = best.get(record.eventId);
    if (!current || record.year > current.year) best.set(record.eventId, record);
  }
  return [...best.values()].sort(
    (a, b) => b.year - a.year || a.eventId.localeCompare(b.eventId),
  );
}

/**
 * One badge per completed set, newest first.
 *
 * Newest first because that is the order every other badge list on this page
 * uses, and because a second Six Star is the news — burying it behind the
 * first would make the rarer achievement the harder one to see.
 *
 * The set number is the key rather than the year: two sets sharing a year is
 * not something a real calendar can produce (each major runs once), but a
 * duplicate record is, and React must not be handed two identical keys
 * because somebody logged Boston twice.
 */
function sixMajorsBadges(completions: readonly number[]) {
  return completions.map((year, index) => ({ set: index + 1, year })).reverse();
}

/**
 * Async, and deliberately so: it fetches the catalogue itself rather than
 * taking it as a prop. `getRaceCatalogueEvents()` is `React.cache`'d, so a
 * directory page rendering one of these per rider card still issues the
 * query once per request — the same guarantee `React.cache` already gives
 * `getCurrentUser()` elsewhere in this codebase.
 */

/**
 * "六大馬拉松 5/6 · 還差 紐約馬拉松", under the 馬拉松 heading.
 *
 * ONLY ON A PROFILE, not on a directory card. A card has room for a row of
 * badges and nothing else, and somebody else's unfinished set is not what a
 * directory is for.
 *
 * IT NAMES THE ROUND ONCE THERE IS ONE. Somebody on their second set reads a
 * bare "1/6" as a bug — they are wearing a badge that says they finished all
 * six. 「第 2 輪 1/6」 is the same number saying something true.
 *
 * Names come from the catalogue, so a race renamed in /admin renames here
 * too; `nameZh` first, matching every other place the site shows a race to a
 * Chinese-reading visitor. Falling back to the key rather than dropping the
 * entry keeps the count and the list agreeing — a "5/6" listing four races
 * would be a worse bug than an ugly one listing five.
 */
async function SixMajorsProgressLine({
  catalogue,
  missing,
  sets,
}: {
  catalogue: RaceCatalogueMap;
  missing: readonly string[];
  sets: number;
}) {
  const t = await getDictionary();
  const names = missing.map((key) => {
    const event = catalogue.get(key);
    return event?.nameZh ?? event?.name ?? key;
  });

  return (
    <p
      className="mt-1 text-xs text-muted-foreground"
      data-testid="six-majors-progress"
    >
      {SIX_MAJORS_LABEL_ZH} {sets > 0 ? t.badges.round.replace("{n}", String(sets + 1)) : ""}
      {SIX_MAJORS.length - missing.length}/{SIX_MAJORS.length} · {t.badges.missing}{" "}
      {names.join("、")}
    </p>
  );
}

/**
 * The badge shelf on a directory card.
 *
 * SIX RACES, WHICH IS EIGHT TILES. The count that has to fit is not this
 * number: `limit` bounds the races, and a Six Star badge is drawn outside it
 * (see `sixMajorsBadges` below) with the overflow tile after them both. So
 * the shelf's width is set by 6 + 1 + 1, and both this and ROW_BADGE_SIZE
 * are spending the same 430px — the page got wider and the two-up range
 * started later, and the room that bought went to a bigger badge *and* one
 * more race rather than all to either.
 *
 * A per-breakpoint limit is not available here and must not be faked with a
 * second copy of the shelf: `/riders` shipping two nodes per rider is a bug
 * this project has already had once, at length (PageTransitionEffect.tsx).
 */
export async function RiderBadgeRow({
  limit = 6,
  records,
}: {
  limit?: number;
  records: SiteRaceRecord[];
}) {
  // No empty container when there is nothing to show — an unexplained gap
  // under half the cards reads as a broken layout (D-T6).
  if (records.length === 0) return null;

  const catalogue = catalogueMap(await getRaceCatalogueEvents());
  const collapsed = latestPerEvent(records);
  const shown = collapsed.slice(0, limit);
  const overflow = collapsed.length - shown.length;
  // Outside `limit` on purpose. Six Star is the rarest thing a card can say,
  // and letting it consume one of five slots would push a race off the row
  // to show it — paying for the headline with the story. Two of them is two
  // squares, not two rows: a second set costs six more marathons, so the
  // count that could crowd a card here is bounded by something far scarcer
  // than the layout.
  const badges = sixMajorsBadges(sixMajorsProgress(records).completions);

  return (
    <div className={SHELF_CLASS} data-testid="rider-badge-row">
      {badges.map((badge) => (
        <SixMajorsBadge key={badge.set} size={ROW_BADGE_SIZE} year={badge.year} />
      ))}
      {shown.map((record) => (
        <RaceBadge
          key={record.id}
          {...resolveBadge(catalogue, record.eventId, record.distanceId)}
          size={ROW_BADGE_SIZE}
          year={record.year}
        />
      ))}
      {/* A tile of the same size, not a line of small type trailing the
          row. "+6" set at 12px beside 40px squares read as a caption that
          had lost its badge; drawn as the seventh tile it reads as what it
          is — the rest of the collection, one click away. */}
      {overflow > 0 && (
        <span
          className="flex shrink-0 items-center justify-center border border-border text-xs font-semibold tabular-nums text-muted-foreground"
          data-testid="rider-badge-overflow"
          style={{ height: ROW_BADGE_SIZE, width: ROW_BADGE_SIZE }}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}

/** Full history for a profile page, grouped by series. */
export async function RiderBadgeWall({ records }: { records: SiteRaceRecord[] }) {
  if (records.length === 0) return null;

  const catalogue = catalogueMap(await getRaceCatalogueEvents());

  // The grouping lives in badge-source.ts so it can be checked without a
  // browser — see U-GROUP in e2e/unit/badge-source.spec.ts.
  const { groups, unknown } = groupRecordsBySeries(catalogue, records);
  const { completions, missing } = sixMajorsProgress(records);
  const badges = sixMajorsBadges(completions);
  // How many majors count toward the *next* set — 0 for somebody who has just
  // finished one. `missing` is never empty (it is every major sitting at the
  // minimum), so this, not its length, is what decides whether the line shows:
  // "0/6 · 還差 東京、波士頓…" under a fresh Six Star would read as a mistake.
  const towardNextSet = SIX_MAJORS.length - missing.length;

  return (
    <section className="space-y-6" data-testid="rider-badge-wall">
      {/* Above the series groups, not inside one. The six majors sit in
          `others` in the catalogue, but the achievement is not a series —
          filing it under 「其他獨立賽事」 would bury the rarest badge on the
          page under the most ordinary heading. */}
      {badges.length > 0 && (
        <div data-testid="rider-badge-six-majors">
          <h2 className="font-heading text-sm font-semibold text-foreground/70">
            {SIX_MAJORS_LABEL_ZH}
          </h2>
          <div className="mt-3 flex flex-wrap gap-3">
            {badges.map((badge) => (
              <SixMajorsBadge key={badge.set} size={72} year={badge.year} />
            ))}
          </div>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.series}>
          <h2 className="font-heading text-sm font-semibold text-foreground/70">
            {RACE_SERIES_LABELS[group.series]}
          </h2>
          {/* Under the 馬拉松 heading rather than beside the achievement
              badge, because what it describes is the set that has no badge
              yet — the one in progress. */}
          {group.series === "marathon" && towardNextSet > 0 && (
            <SixMajorsProgressLine
              catalogue={catalogue}
              missing={missing}
              sets={completions.length}
            />
          )}
          <div
            className="mt-3 flex flex-wrap gap-3"
            data-series={group.series}
            data-testid="rider-badge-group"
          >
            {group.records.map((record) => (
              <RaceBadge
                key={record.id}
                {...resolveBadge(catalogue, record.eventId, record.distanceId)}
                size={72}
                year={record.year}
              />
            ))}
          </div>
        </div>
      ))}

      {unknown.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3" data-testid="rider-badge-unknown">
          {unknown.map((record) => (
            <RaceBadge
              key={record.id}
              {...resolveBadge(catalogue, record.eventId, record.distanceId)}
              size={72}
              year={record.year}
            />
          ))}
        </div>
      )}
    </section>
  );
}

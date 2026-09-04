import Link from "next/link";

import type { RiderBadgeOption } from "@/lib/riders/badge-filter";
import { riderBadgesHref, toggleRiderBadge } from "@/lib/riders/badge-filter";
import { cn } from "@/lib/utils";
import { getDictionary } from "@/lib/i18n/dictionary";

/**
 * Badge filter for the directory, as links rather than client state.
 *
 * The same shape as `RaceScheduleFilters`, and for the reasons its header
 * gives: the filtered directory is fully server-rendered, shareable and
 * bookmarkable, nothing hydrates, and an e2e assertion is a plain `goto`.
 * `/riders` is already `force-dynamic`, so the round-trip per click costs
 * nothing it was not already paying.
 */

function Chip({
  active,
  badge,
  count,
  href,
  label,
  // Named for the attribute rather than `testId` so it appears literally at
  // the call site, which is what scripts/assert-schema-screen.mjs greps for
  // — the same reasoning RaceScheduleFilters' Chip records.
  //
  // WHICH chip is a separate attribute rather than part of the id. The
  // first version built `rider-filter-shortcut-${id}` per chip, and no
  // literal of that ever existed in src/ for the checker to find — it
  // failed, correctly: a test naming a selector nothing renders is a test
  // whose green means nothing. The testid says what kind of control this
  // is, `data-badge` says which one, and both are literal somewhere.
  "data-testid": testId,
}: {
  active: boolean;
  badge?: string;
  count: number;
  href: string;
  label: string;
  "data-testid"?: string;
}) {
  return (
    <Link
      aria-current={active ? "true" : undefined}
      className={cn(
        "border px-3 py-1 text-xs leading-tight transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:text-foreground",
      )}
      // The number as an attribute as well as on screen. A test that read
      // it out of the text got 3300 from 「TORX 330」 beside a count of 0 —
      // the gap between label and number is a CSS margin, not whitespace —
      // and the two chips it happened to parse correctly hid that. The
      // same reasoning as `data-post-count` on the rider card.
      data-badge={badge}
      data-count={count}
      data-testid={testId}
      href={href}
    >
      {label}
      {/* The count is beside the label, not behind a click, and it is the
          count *of the selection including this chip* — with AND, a chip
          advertising its own total sends people to an empty page. Nobody
          has finished the six majors yet; 「六大 0」 is the honest form of
          that, before the click rather than after. */}
      <span className="ml-1 opacity-60">{count}</span>
    </Link>
  );
}

export async function RiderFilters({
  options,
  selected,
  total,
}: {
  options: RiderBadgeOption[];
  /** Every badge currently applied. All of them have to match — see the
      module header — so the chips toggle rather than replace. */
  selected: readonly string[];
  total: number;
}) {
  const t = await getDictionary();
  const shortcuts = options.filter((option) => option.shortcut);
  const events = options.filter((option) => !option.shortcut);

  return (
    <div className="flex flex-col gap-3" data-testid="rider-filters">
      <div className="flex flex-wrap gap-2" data-testid="rider-filter-shortcuts">
        <Chip
          active={selected.length === 0}
          count={total}
          data-testid="rider-filter-all"
          href={riderBadgesHref([])}
          label={t.common.all}
        />
        {shortcuts.map((option) => (
          <Chip
            key={option.id}
            active={selected.includes(option.id)}
            badge={option.id}
            count={option.count}
            data-testid="rider-filter-shortcut"
            href={riderBadgesHref(toggleRiderBadge(selected, option.id))}
            label={option.label}
          />
        ))}
      </div>

      {events.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="rider-filter-events">
          {events.map((option) => (
            <Chip
              key={option.id}
              active={selected.includes(option.id)}
              badge={option.id}
              count={option.count}
              data-testid="rider-filter-event"
              href={riderBadgesHref(toggleRiderBadge(selected, option.id))}
              label={option.label}
            />
          ))}
        </div>
      )}
    </div>
  );
}

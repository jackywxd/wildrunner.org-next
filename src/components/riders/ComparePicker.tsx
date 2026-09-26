import Link from "@/components/i18n/locale-link";

import { RiderAvatar } from "@/components/riders/RiderAvatar";
import { getDictionary } from "@/lib/i18n/dictionary";
import { COMPARE_LIMIT, compareHref, type PairCount } from "@/lib/riders/compare";
import type { SiteRider } from "@/lib/content-types";

type Member = Pick<SiteRider, "avatar" | "name" | "slug">;

/**
 * Who is being compared, and how to change it.
 *
 * LINKS, NOT CLIENT STATE, for the reason `RiderFilters` and `RiderViewTabs`
 * give: every choice is its own server-rendered address, which is also what
 * makes a comparison something to share and something a search engine can
 * find. Removing a member is a link to the address without them; adding one
 * is a link to the address with them at the end — so lanes keep the order
 * people were picked in.
 */
export async function ComparePicker({
  members,
  palette,
  selected,
}: {
  members: Member[];
  palette: string[];
  selected: Member[];
}) {
  const t = await getDictionary();
  const slugs = selected.map((member) => member.slug);
  const others = members.filter((member) => !slugs.includes(member.slug));
  const full = selected.length >= COMPARE_LIMIT;

  return (
    <nav aria-label={t.compare.pickAria} className="mt-6 print:hidden" data-testid="compare-picker">
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {selected.map((member, index) => (
            <li key={member.slug}>
              <Link
                aria-label={t.compare.remove.replace("{name}", member.name)}
                className="hit-area inline-flex min-h-11 items-center gap-2 border border-border bg-secondary px-2 text-sm font-semibold text-foreground transition-colors hover:border-foreground"
                data-compare-selected={member.slug}
                data-testid="compare-remove"
                href={compareHref(slugs.filter((slug) => slug !== member.slug))}
              >
                <span aria-hidden className="h-4 w-1" style={{ background: palette[index] }} />
                <RiderAvatar rider={member} size={24} />
                {member.name}
                <span aria-hidden className="px-1 text-muted-foreground">
                  ×
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-sm text-muted-foreground" data-testid="compare-status">
        {full
          ? t.compare.full
          : selected.length < 2
            ? t.compare.pickPrompt.replace("{count}", String(2 - selected.length))
            : null}
      </p>

      {!full && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {others.map((member) => (
            <li key={member.slug}>
              <Link
                className="hit-area inline-flex min-h-9 items-center gap-1.5 border border-border bg-background px-2.5 text-tag text-muted-foreground transition-colors hover:text-foreground"
                data-compare-add={member.slug}
                data-testid="compare-add"
                href={compareHref([...slugs, member.slug])}
              >
                <span aria-hidden>＋</span>
                {member.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

/** How many races each pair of the compared members ran together. */
export async function ComparePairs({
  counts,
  names,
  palette,
  slugs,
}: {
  counts: PairCount[];
  names: Map<string, string>;
  palette: string[];
  slugs: string[];
}) {
  const t = await getDictionary();
  return (
    <section
      className="mt-6 border border-border bg-secondary p-4"
      data-testid="compare-pairs"
    >
      <h2 className="text-sm font-bold text-muted-foreground">{t.compare.together}</h2>
      <ul className="mt-2 flex flex-col gap-1.5">
        {counts.map((entry) => (
          <li
            className="flex items-center gap-2 text-sm"
            data-count={entry.count}
            data-pair={entry.slugs.join(",")}
            key={entry.slugs.join(",")}
          >
            <span aria-hidden className="flex">
              {entry.slugs.map((slug) => (
                <span
                  className="-ml-0.5 h-2.5 w-2.5 first:ml-0"
                  key={slug}
                  style={{ background: palette[slugs.indexOf(slug)] }}
                />
              ))}
            </span>
            <span className="min-w-0 flex-1">
              {entry.slugs.length > 2
                ? t.compare.all
                : entry.slugs.map((slug) => names.get(slug)).join(" × ")}
            </span>
            <span className={entry.count ? "font-extrabold" : "text-muted-foreground"}>
              {entry.count ? t.compare.times.replace("{count}", String(entry.count)) : t.compare.never}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

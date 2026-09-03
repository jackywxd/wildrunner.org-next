"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ImageUp } from "lucide-react";
import { QuotaBar } from "./QuotaBar";

import { MediaGrid } from "./MediaGrid";
import { MediaDetailDialog } from "./MediaDetailDialog";
import { transcodeBadge } from "./TranscodeBadge";
import {
  FilterChip,
  FilterSelect,
  KIND_LABELS,
  USAGE_LABELS,
} from "@/components/media/filters";
import type { MediaUsageFilter } from "@/lib/media/filters";
import type { RaceClaim } from "@/components/members/races/RaceClaimFields";
import type { CatalogueEvent } from "@/lib/races/catalogue-shape";
import {
  MEDIA_PAGE_SIZES,
  MEDIA_SORTS,
  useMediaBrowse,
  type MediaPageSize,
} from "@/lib/members/use-media-browse";
import type { Media } from "@/payload-types";

type Usage = { quotaBytes: number; usedBytes: number };

/**
 * Fifteen seconds. A 4K clip measured ~2.6 minutes of encoding plus
 * transfer, so this is roughly a dozen polls over a whole job — cheap
 * against a `/api/media` list, and short enough that the badge clearing
 * still reads as a response to something rather than an unrelated event.
 */
const TRANSCODE_POLL_MS = 15_000;

/**
 * WHY THIS PAGE HAS A PAGER AT ALL, since it had none for a year.
 *
 * It asked for `limit=100` and drew whatever came back, so it was showing the
 * hundred newest rows and no indication there were more. On the local corpus
 * that is 100 of 546; an admin — whose access rule returns `true` rather than
 * an owner clause — was missing four fifths of the library with nothing on
 * screen saying so, which is why this looked like files had gone missing while
 * /admin listed them fine.
 *
 * Payload's REST list response already carries `totalDocs`/`totalPages`, so
 * the count is not computed here and cannot drift from the query that produced
 * it.
 *
 * The query, the paging and the reset-on-narrow rule now live in
 * `@/lib/members/use-media-browse` — the post editor's media picker asks
 * `/api/media` the same question, and the one thing it must not do is ask it
 * slightly differently. See that file's header.
 */

const USAGES: { value: MediaUsageFilter; label: string }[] = (
  ["all", "gallery", "private", "attachment"] as const
).map((value) => ({ value, label: USAGE_LABELS[value] }));

const PAGE_SIZE_OPTIONS = MEDIA_PAGE_SIZES.map((size) => ({
  value: String(size) as `${MediaPageSize}`,
  label: `每頁 ${size}`,
}));

export function MediaLibrary({
  catalogueEvents,
  preselectedRace,
  isAdmin,
  userId,
}: {
  /**
   * The whole race catalogue, not the dated editions this used to pass.
   *
   * Both the dropzone and the detail dialog ask which race a file is from,
   * and they now ask it the way the post editor does — see
   * `RaceClaimFields.tsx`. Resolved on the server for the same reason it
   * always was: a client fetch would be a second definition of the list.
   */
  catalogueEvents: CatalogueEvent[];
  /** From a 上傳相片-style deep link — a hint, not a requirement. */
  preselectedRace?: RaceClaim | null;
  /**
   * Decided on the server from the session, never asked of the browser.
   *
   * It only chooses whether the 只顯示我的 control is drawn; the narrowing it
   * requests is an ordinary `where[owner]`, and what a member is allowed to
   * see is settled by `mediaPublicRead` on every request regardless. So a
   * forged `true` here would show a member a filter that does nothing, not
   * somebody else's files.
   */
  isAdmin: boolean;
  userId: number;
}) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [selected, setSelected] = useState<Media | null>(null);
  // Admin-only in the UI, and a no-op for anyone else: `mediaPublicRead`
  // already returns `{ owner: { equals: user.id } }` for a non-admin, so the
  // clause it adds would AND with a clause that already says it.
  const [mineOnly, setMineOnly] = useState(false);

  const browse = useMediaBrowse({ ownerId: mineOnly ? userId : null });
  const { items, refresh: refreshMedia } = browse;

  // `cache: "no-store"` as well as the no-store response header: this figure
  // has to reflect an upload that happened a moment ago, and a response
  // already sitting in the browser's HTTP cache would be replayed regardless
  // of what the server now says.
  const refreshUsage = useCallback(async () => {
    const response = await fetch("/api/members/storage-usage", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (response.ok) setUsage((await response.json()) as Usage);
  }, []);

  useEffect(() => {
    refreshUsage();
  }, [refreshUsage]);

  /** Both halves, for the callers that change what each one reports. */
  const refresh = useCallback(async () => {
    await Promise.all([refreshMedia(), refreshUsage()]);
  }, [refreshMedia, refreshUsage]);

  // A transcode finishes minutes after the upload does, in a container, by
  // patching the row — nothing pushes that back to this page. Without a poll
  // the member watches 轉檔中 forever and reloads to find out, which undoes
  // the reason the encode was made asynchronous in the first place.
  //
  // Keyed on the boolean, not on `items`: the effect then re-runs only when
  // the answer actually flips, and an interval rather than a chained timeout
  // means one failed request does not silently end the polling — the next
  // tick still fires. It stops on its own once nothing is in flight.
  const transcodePending = items.some(
    (item) => transcodeBadge(item)?.tone === "pending",
  );

  useEffect(() => {
    if (!transcodePending) return;
    const timer = setInterval(refresh, TRANSCODE_POLL_MS);
    return () => clearInterval(timer);
  }, [transcodePending, refresh]);

  const {
    filtered: narrowed,
    kind,
    limit,
    loading,
    narrow,
    page,
    setKind,
    setLimit,
    setPage,
    setSort,
    setUsage: setUsageFilter,
    sort,
    totalDocs,
    totalPages,
    usage: usageFilter,
  } = browse;

  // `mineOnly` is this component's own control rather than the hook's, so it
  // has to be ORed in here — see `MediaBrowse.filtered`.
  const filtered = narrowed || mineOnly;

  return (
    <div className="space-y-6">
      {usage && (
        <QuotaBar usedBytes={usage.usedBytes} quotaBytes={usage.quotaBytes} />
      )}

      {/*
        A link, not the uploader itself. The two used to share this screen and
        neither had room: managing a library is a grid and a pager, adding to
        it is a dropzone that has things to say, and the uploader lost — it was
        squeezed down to a bare `<input type="file">` with no copy at all. It
        has its own route now; see `UploadPanel`.

        `preselectedRace` is forwarded through the query string rather than as
        a prop, because the destination is a different page — the same
        `?race=&year=` contract `RaceEntryRow` already links here with, read
        back by `preselectedRaceFrom`.
      */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={
            preselectedRace
              ? `/members/media/upload?race=${encodeURIComponent(preselectedRace.eventId)}&year=${preselectedRace.year}`
              : "/members/media/upload"
          }
          data-testid="media-upload-link"
          className="inline-flex items-center gap-2 bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          <ImageUp className="size-4" />
          上傳照片和影片
        </Link>
        <span className="text-xs text-muted-foreground">
          可以一次選很多個，也可以拖進去
        </span>
      </div>

      <div
        className="flex flex-wrap items-center gap-3"
        data-testid="media-filters"
      >
        <div className="flex gap-2">
          <FilterChip
            active={kind === "all"}
            onClick={() => narrow(() => setKind("all"))}
            data-testid="media-filter-kind-all"
          >
            {KIND_LABELS.all}
          </FilterChip>
          <FilterChip
            active={kind === "photo"}
            onClick={() => narrow(() => setKind("photo"))}
            data-testid="media-filter-kind-photo"
          >
            {KIND_LABELS.photo}
          </FilterChip>
          <FilterChip
            active={kind === "video"}
            onClick={() => narrow(() => setKind("video"))}
            data-testid="media-filter-kind-video"
          >
            {KIND_LABELS.video}
          </FilterChip>
        </div>
        <FilterSelect
          label="用途"
          value={usageFilter}
          onChange={(next) => narrow(() => setUsageFilter(next))}
          options={USAGES}
          data-testid="media-filter-usage"
        />
        <FilterSelect
          label="排序"
          value={sort}
          onChange={(next) => narrow(() => setSort(next))}
          options={MEDIA_SORTS}
          data-testid="media-filter-sort"
        />
        <FilterSelect
          label=""
          value={String(limit) as `${MediaPageSize}`}
          onChange={(next) =>
            narrow(() => setLimit(Number(next) as MediaPageSize))
          }
          options={PAGE_SIZE_OPTIONS}
          data-testid="media-filter-limit"
        />
        {/*
          Admins only, because for anybody else it is a control that cannot
          change the answer — their access rule already scopes the query to
          their own rows. A checkbox that never does anything is worse than no
          checkbox: it teaches a member that the library might be showing them
          somebody else's files.
        */}
        {isAdmin && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              data-testid="media-filter-mine"
              checked={mineOnly}
              onChange={(event) =>
                narrow(() => setMineOnly(event.target.checked))
              }
            />
            <span>只顯示我的</span>
          </label>
        )}
      </div>

      {!loading && (
        <MediaGrid items={items} onSelect={setSelected} filtered={filtered} />
      )}

      {/*
        Drawn whenever the query returned anything, not only when there is
        more than one page: the count is the part that was missing. "共 546 個
        檔案" over a grid of 24 is what tells a member the grid is a window.
      */}
      {!loading && totalDocs > 0 && (
        <div
          className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground"
          data-testid="media-pager"
        >
          <span data-testid="media-pager-total">共 {totalDocs} 個檔案</span>
          <span data-testid="media-pager-page">
            第 {page} / {totalPages} 頁
          </span>
          <button
            type="button"
            data-testid="media-pager-prev"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="border border-border px-3 py-1 text-foreground disabled:opacity-40"
          >
            上一頁
          </button>
          <button
            type="button"
            data-testid="media-pager-next"
            disabled={page >= totalPages}
            onClick={() =>
              setPage((current) => Math.min(totalPages, current + 1))
            }
            className="border border-border px-3 py-1 text-foreground disabled:opacity-40"
          >
            下一頁
          </button>
        </div>
      )}

      {selected && (
        <MediaDetailDialog
          item={selected}
          catalogueEvents={catalogueEvents}
          onClose={() => setSelected(null)}
          onUpdated={() => {
            setSelected(null);
            refresh();
          }}
          onDeleted={() => {
            setSelected(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

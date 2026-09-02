"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { QuotaBar } from "./QuotaBar";
import { UploadDropzone } from "./UploadDropzone";
import { MediaGrid } from "./MediaGrid";
import { MediaDetailDialog } from "./MediaDetailDialog";
import { transcodeBadge } from "./TranscodeBadge";
import {
  FilterChip,
  FilterSelect,
  KIND_LABELS,
} from "@/components/media/filters";
import type { MediaKindFilter, MediaUsageFilter } from "@/lib/media/filters";
import type { Media } from "@/payload-types";
import type { SiteRaceEditionOption } from "@/lib/content-types";

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
 */
const PAGE_SIZES = [24, 48, 96] as const;
type PageSize = (typeof PAGE_SIZES)[number];

/**
 * Payload `sort` strings, passed through untouched.
 *
 * Every field named here is a real column on `media` — a typo'd one is not an
 * error, it is a query that silently comes back in insertion order, which is
 * the failure this repo keeps writing down: green, quiet, wrong. `-createdAt`
 * matches what the page has always defaulted to.
 */
type Sort = "-createdAt" | "createdAt" | "-filesize" | "filename";

const SORTS: { value: Sort; label: string }[] = [
  { value: "-createdAt", label: "最新上傳" },
  { value: "createdAt", label: "最早上傳" },
  { value: "-filesize", label: "檔案大" },
  { value: "filename", label: "檔名" },
];

const USAGES: { value: MediaUsageFilter; label: string }[] = [
  { value: "all", label: "全部用途" },
  { value: "gallery", label: "相片牆" },
  { value: "private", label: "不公開" },
  { value: "attachment", label: "文章附件" },
];

const PAGE_SIZE_OPTIONS = PAGE_SIZES.map((size) => ({
  value: String(size) as `${PageSize}`,
  label: `每頁 ${size}`,
}));

export function MediaLibrary({
  preselectedRaceEditionId,
  raceEditions,
  isAdmin,
  userId,
}: {
  /** From a 上傳相片-style deep link — a hint, not a requirement. */
  preselectedRaceEditionId?: number;
  raceEditions: SiteRaceEditionOption[];
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
  const [items, setItems] = useState<Media[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [selected, setSelected] = useState<Media | null>(null);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [totalDocs, setTotalDocs] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [limit, setLimit] = useState<PageSize>(24);
  const [sort, setSort] = useState<Sort>("-createdAt");
  const [kind, setKind] = useState<MediaKindFilter>("all");
  const [usageFilter, setUsageFilter] = useState<MediaUsageFilter>("all");
  const [mineOnly, setMineOnly] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams({
      limit: String(limit),
      page: String(page),
      sort,
      depth: "0",
    });
    // `like` on mimeType rather than a list of exact types: the collection
    // accepts `image/*` and `video/*`, so the concrete values are whatever a
    // browser reported at upload time — image/heic and video/quicktime are
    // both in the corpus. The prefix is the only thing they agree on.
    if (kind !== "all") {
      params.set(
        "where[mimeType][like]",
        kind === "video" ? "video/" : "image/",
      );
    }
    if (usageFilter !== "all") params.set("where[usage][equals]", usageFilter);
    // Admin-only in the UI, and a no-op for anyone else: `mediaPublicRead`
    // already returns `{ owner: { equals: user.id } }` for a non-admin, so
    // this clause would AND with a clause that already says it.
    if (mineOnly) params.set("where[owner][equals]", String(userId));
    return params.toString();
  }, [limit, page, sort, kind, usageFilter, mineOnly, userId]);

  // `cache: "no-store"` as well as the no-store response header: this list
  // has to reflect an upload that happened a moment ago, and a response
  // already sitting in the browser's HTTP cache would be replayed
  // regardless of what the server now says.
  const refresh = useCallback(async () => {
    const [mediaRes, usageRes] = await Promise.all([
      fetch(`/api/media?${query}`, {
        credentials: "same-origin",
        cache: "no-store",
      }),
      fetch("/api/members/storage-usage", {
        credentials: "same-origin",
        cache: "no-store",
      }),
    ]);
    if (mediaRes.ok) {
      const body = (await mediaRes.json()) as {
        docs: Media[];
        totalDocs: number;
        totalPages: number;
      };
      setItems(body.docs);
      setTotalDocs(body.totalDocs);
      setTotalPages(Math.max(1, body.totalPages));
    }
    if (usageRes.ok) {
      setUsage((await usageRes.json()) as Usage);
    }
    setLoading(false);
  }, [query]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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

  /**
   * Every filter change goes through here, and the reason is the page number.
   *
   * Page 4 of 12 is not page 4 of 3: narrowing the query while holding the
   * page produces an empty grid over a non-empty library, which reads exactly
   * like the bug this whole change exists to fix. Payload answers an
   * out-of-range page with an empty `docs` and no error, so nothing would
   * complain.
   */
  const narrow = useCallback((apply: () => void) => {
    apply();
    setPage(1);
  }, []);

  const filtered = kind !== "all" || usageFilter !== "all" || mineOnly;

  return (
    <div className="space-y-6">
      {usage && (
        <QuotaBar usedBytes={usage.usedBytes} quotaBytes={usage.quotaBytes} />
      )}

      <UploadDropzone
        onUploaded={() => {
          // Back to the first page, because that is where a new upload lands
          // under the default sort. Refreshing in place would leave a member
          // on page 3 wondering where the file they just watched upload went.
          setPage(1);
          void refresh();
        }}
        preselectedRaceEditionId={preselectedRaceEditionId}
        raceEditions={raceEditions}
      />

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
          options={SORTS}
          data-testid="media-filter-sort"
        />
        <FilterSelect
          label=""
          value={String(limit) as `${PageSize}`}
          onChange={(next) => narrow(() => setLimit(Number(next) as PageSize))}
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
          raceEditions={raceEditions}
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

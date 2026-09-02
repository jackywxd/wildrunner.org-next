"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { MediaKindFilter, MediaUsageFilter } from "@/lib/media/filters";
import type { Media } from "@/payload-types";

/**
 * Browsing `/api/media`: the query, the page, and the rule that ties them
 * together.
 *
 * EXTRACTED FOR A SECOND CALLER, not for tidiness. `MediaLibrary` owned all
 * of this privately until the post editor needed to *pick* a file rather than
 * manage one — a cover image, and later a video for an article body. That
 * picker asks `/api/media` the same question with the same paging, and the
 * one thing it must not do is ask it slightly differently.
 *
 * The rule worth naming, because it is the one a second copy would lose:
 * **narrowing the query resets the page**. Page 4 of 12 is not page 4 of 3,
 * and Payload answers an out-of-range page with an empty `docs` and no error
 * — so a filter change that kept the page would draw an empty grid over a
 * full library, which reads exactly like data loss. `narrow()` exists so that
 * cannot be forgotten at a call site.
 *
 * WHAT IS DELIBERATELY *NOT* HERE. Storage quota, the upload dropzone and the
 * transcode poll stay in `MediaLibrary`: they are about managing a library,
 * not about reading one, and the picker wants none of them. Same reasoning as
 * `src/lib/media/filters.ts` — share the words and the query, never the
 * screen.
 */

/**
 * Payload `sort` strings, passed through untouched.
 *
 * Every field named here is a real column on `media` — a typo'd one is not an
 * error, it is a query that silently comes back in insertion order, which is
 * the failure this repo keeps writing down: green, quiet, wrong.
 */
export type MediaSort = "-createdAt" | "createdAt" | "-filesize" | "filename";

export const MEDIA_SORTS: { value: MediaSort; label: string }[] = [
  { value: "-createdAt", label: "最新上傳" },
  { value: "createdAt", label: "最早上傳" },
  { value: "-filesize", label: "檔案大" },
  { value: "filename", label: "檔名" },
];

export const MEDIA_PAGE_SIZES = [24, 48, 96] as const;
export type MediaPageSize = (typeof MEDIA_PAGE_SIZES)[number];

export type MediaBrowseState = {
  kind: MediaKindFilter;
  limit: number;
  /**
   * Scope to one member's files, or `null` for whatever the access rule
   * allows.
   *
   * A no-op for an ordinary member — `mediaPublicRead` already returns
   * `{ owner: { equals: user.id } }` for anyone signed in who is not an admin,
   * so this clause would AND with a clause that already says it. It earns its
   * place for an admin, who otherwise reads every member's library: the
   * library offers it as the 只顯示我的 checkbox, and the picker sets it
   * outright, because "choose a cover from your media" should not mean
   * "choose from everybody's".
   */
  ownerId: number | null;
  page: number;
  sort: MediaSort;
  usage: MediaUsageFilter;
};

/**
 * The query string, as a pure function of the state.
 *
 * Separated from the hook so it can be asserted without a browser or a
 * server. It is the half that fails silently: a wrong `where` still returns
 * a perfectly ordinary-looking page of media.
 */
export function mediaBrowseParams(state: MediaBrowseState): string {
  const params = new URLSearchParams({
    limit: String(state.limit),
    page: String(state.page),
    sort: state.sort,
    depth: "0",
  });

  // `like` on mimeType rather than a list of exact types: the collection
  // accepts `image/*` and `video/*`, so the concrete values are whatever a
  // browser reported at upload time — image/heic and video/quicktime are both
  // in the corpus. The prefix is the only thing they agree on.
  if (state.kind !== "all") {
    params.set(
      "where[mimeType][like]",
      state.kind === "video" ? "video/" : "image/",
    );
  }
  if (state.usage !== "all") {
    params.set("where[usage][equals]", state.usage);
  }
  if (state.ownerId !== null) {
    params.set("where[owner][equals]", String(state.ownerId));
  }

  return params.toString();
}

export type MediaBrowse = {
  /** Whether anything the member chose is narrowing the query — decides what
   *  an empty grid means. A `kind` fixed at construction does not count: the
   *  picker always asks for one, and "沒有符合條件的媒體" would be wrong for a
   *  member who simply has no files yet. */
  filtered: boolean;
  items: Media[];
  kind: MediaKindFilter;
  limit: MediaPageSize;
  loading: boolean;
  /** Apply a filter change and go back to page 1 — see this file's header. */
  narrow: (apply: () => void) => void;
  page: number;
  refresh: () => Promise<void>;
  setKind: (next: MediaKindFilter) => void;
  setLimit: (next: MediaPageSize) => void;
  setPage: (next: number | ((current: number) => number)) => void;
  setSort: (next: MediaSort) => void;
  setUsage: (next: MediaUsageFilter) => void;
  sort: MediaSort;
  totalDocs: number;
  totalPages: number;
  usage: MediaUsageFilter;
};

export function useMediaBrowse({
  kind: initialKind = "all",
  limit: initialLimit = 24,
  ownerId = null,
}: {
  kind?: MediaKindFilter;
  limit?: MediaPageSize;
  /** Read on every render rather than held as state, so a caller whose own
   *  control decides it (the library's 只顯示我的) stays the owner of that
   *  state instead of mirroring it in here. */
  ownerId?: number | null;
} = {}): MediaBrowse {
  const [items, setItems] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [totalDocs, setTotalDocs] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [limit, setLimit] = useState<MediaPageSize>(initialLimit);
  const [sort, setSort] = useState<MediaSort>("-createdAt");
  const [kind, setKind] = useState<MediaKindFilter>(initialKind);
  const [usage, setUsage] = useState<MediaUsageFilter>("all");

  const query = useMemo(
    () => mediaBrowseParams({ kind, limit, ownerId, page, sort, usage }),
    [kind, limit, ownerId, page, sort, usage],
  );

  // `cache: "no-store"` as well as the no-store response header: this list has
  // to reflect an upload that happened a moment ago, and a response already
  // sitting in the browser's HTTP cache would be replayed regardless of what
  // the server now says.
  const refresh = useCallback(async () => {
    const response = await fetch(`/api/media?${query}`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (response.ok) {
      const body = (await response.json()) as {
        docs: Media[];
        totalDocs: number;
        totalPages: number;
      };
      setItems(body.docs);
      setTotalDocs(body.totalDocs);
      setTotalPages(Math.max(1, body.totalPages));
    }
    setLoading(false);
  }, [query]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const narrow = useCallback((apply: () => void) => {
    apply();
    setPage(1);
  }, []);

  return {
    filtered: kind !== initialKind || usage !== "all",
    items,
    kind,
    limit,
    loading,
    narrow,
    page,
    refresh,
    setKind,
    setLimit,
    setPage,
    setSort,
    setUsage,
    sort,
    totalDocs,
    totalPages,
    usage,
  };
}

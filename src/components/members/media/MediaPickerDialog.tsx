"use client";

import { useEffect } from "react";

import { MediaGrid } from "./MediaGrid";
import { FilterSelect } from "@/components/media/filters";
import { MEDIA_SORTS, useMediaBrowse } from "@/lib/members/use-media-browse";
import type { MediaKindFilter } from "@/lib/media/filters";
import type { Media } from "@/payload-types";

const TITLES: Record<MediaKindFilter, string> = {
  all: "從媒體庫選擇",
  photo: "從媒體庫選擇圖片",
  video: "從媒體庫選擇影片",
};

/**
 * Choose a file that is already in the member's library.
 *
 * WHY THIS EXISTS AT ALL. Every member-facing way of putting a picture into a
 * post used to be an upload — the cover field and the editor's image button
 * both went straight to a file dialog. So a member who had already uploaded a
 * photo to the wall had no way to reuse it: they uploaded it again, spending
 * their quota twice on identical bytes and leaving the library with two rows
 * that mean the same thing.
 *
 * SCOPED TO THE MEMBER'S OWN FILES, always, by `ownerId`. For an ordinary
 * member that clause is redundant — `mediaPublicRead` already narrows every
 * request to `{ owner: { equals: user.id } }` — and for an admin it is the
 * whole point: an admin's read rule returns `true`, so without it "choose a
 * cover from your media" would offer every member's library.
 *
 * The query, the paging and the reset-on-narrow rule come from
 * `useMediaBrowse` rather than being written again here; see that file for
 * why sharing them is the part that matters.
 *
 * WHAT IT DOES NOT DO: upload, edit, or delete. Those live in
 * /members/media, which has the quota bar and the dropzone to go with them.
 * This is a picker, and a picker that grew a delete button would be a second
 * media library maintained by accident.
 */
export function MediaPickerDialog({
  kind,
  onClose,
  onPick,
  ownerId,
}: {
  /**
   * Which part of the library to offer. The cover field wants photos and
   * nothing else — `posts.image` renders through next/image, so a video
   * chosen there would be a broken card. The editor takes "all": an upload
   * node holds a media id whatever its type, and the public converter already
   * branches on the mime type to draw a player or a picture.
   */
  kind: MediaKindFilter;
  onClose: () => void;
  onPick: (media: Media) => void;
  ownerId: number;
}) {
  const browse = useMediaBrowse({ kind, ownerId });

  // Escape closes it. A dialog that can only be dismissed by finding the right
  // pixel is one a member gets stuck in, and this one covers the editor they
  // were part-way through writing in.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        data-testid="media-picker"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-3xl flex-col gap-4 overflow-y-auto border border-border bg-background p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">{TITLES[kind]}</span>
          <button
            type="button"
            data-testid="media-picker-close"
            onClick={onClose}
            className="text-xs text-foreground/50 hover:text-foreground"
          >
            關閉
          </button>
        </div>

        <FilterSelect
          label="排序"
          value={browse.sort}
          onChange={(next) => browse.narrow(() => browse.setSort(next))}
          options={MEDIA_SORTS}
          data-testid="media-picker-sort"
        />

        {!browse.loading && (
          <MediaGrid
            items={browse.items}
            onSelect={onPick}
            filtered={browse.filtered}
            showUsage
          />
        )}

        {!browse.loading && browse.totalDocs > 0 && (
          <div
            className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground"
            data-testid="media-picker-pager"
          >
            <span data-testid="media-picker-pager-total">
              共 {browse.totalDocs} 個檔案
            </span>
            <span data-testid="media-picker-pager-page">
              第 {browse.page} / {browse.totalPages} 頁
            </span>
            <button
              type="button"
              data-testid="media-picker-pager-prev"
              disabled={browse.page <= 1}
              onClick={() =>
                browse.setPage((current) => Math.max(1, current - 1))
              }
              className="border border-border px-3 py-1 text-foreground disabled:opacity-40"
            >
              上一頁
            </button>
            <button
              type="button"
              data-testid="media-picker-pager-next"
              disabled={browse.page >= browse.totalPages}
              onClick={() =>
                browse.setPage((current) =>
                  Math.min(browse.totalPages, current + 1),
                )
              }
              className="border border-border px-3 py-1 text-foreground disabled:opacity-40"
            >
              下一頁
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

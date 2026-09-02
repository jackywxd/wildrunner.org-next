import Image from "next/image";
import { formatBytes } from "@/lib/direct-upload";
import { mediaImageSrc } from "@/lib/cf-image";
import { VideoPosterTile } from "@/components/media/VideoPosterTile";
import { USAGE_LABELS } from "@/components/media/filters";
import { TranscodeBadge } from "./TranscodeBadge";
import type { Media } from "@/payload-types";

export function MediaGrid({
  items,
  onSelect,
  filtered = false,
  showUsage = false,
}: {
  items: Media[];
  onSelect: (item: Media) => void;
  /**
   * Whether anything is narrowing the query, which decides what an empty grid
   * means. "上傳第一個檔案吧" is right for a member with no media and actively
   * wrong for one who has hundreds and just picked 影片 + 不公開 — it reads as
   * data loss.
   */
  filtered?: boolean;
  /**
   * Print each file's `usage` on its tile.
   *
   * Off in the library, where a whole filter row already says which usages
   * are on screen. On in the picker, where the choice being made is
   * irreversible in one direction: a photo the member marked 不公開 becomes
   * visible to everyone the moment it is a post's cover, and the tile is the
   * only place they could learn that before clicking.
   */
  showUsage?: boolean;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-foreground/50" data-testid="media-grid-empty">
        {filtered
          ? "沒有符合條件的媒體，換個篩選條件試試。"
          : "還沒有媒體，上傳第一個檔案吧。"}
      </p>
    );
  }

  return (
    <div
      className="grid grid-cols-2 gap-3 lg:grid-cols-3 fhd:grid-cols-4"
      data-testid="media-grid"
    >
      {items.map((item) => {
        const isVideo = (item.mimeType ?? "").startsWith("video/");
        const src = mediaImageSrc(item);
        return (
          <button
            key={item.id}
            type="button"
            data-testid={`media-item-${item.id}`}
            onClick={() => onSelect(item)}
            className="group border border-border text-left"
          >
            <div className="relative aspect-video bg-secondary">
              {/*
                The badge stays above the tile: `VideoPosterTile` fills the box
                with `absolute inset-0`, so a badge declared before it would be
                painted under a poster the moment one exists — which is exactly
                the video whose 轉檔中 the member most wants to see.
              */}
              {isVideo ? (
                // The same tile the public wall draws, and the reason this
                // screen changed: it had been showing "▶ 影片" on a grey box
                // for every video a member owns. So the one screen where a
                // member picks a cover frame was the only one that never
                // showed them the frame they picked.
                <VideoPosterTile
                  poster={item.posterUrl}
                  label={item.alt}
                  data-testid="media-item-poster"
                />
              ) : src ? (
                <Image
                  src={src}
                  alt={item.alt}
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-foreground/40">
                  圖片處理中
                </div>
              )}
              <TranscodeBadge item={item} />
            </div>
            <div className="p-2 text-xs">
              <div className="truncate">{item.alt}</div>
              <div className="text-foreground/40">
                {item.filesize ? formatBytes(item.filesize) : ""}
                {showUsage && item.usage ? (
                  <>
                    {item.filesize ? " · " : ""}
                    {/* The separator sits outside the labelled span: an
                        element named for the usage should hold the usage and
                        nothing else, or an assertion on it is really an
                        assertion about punctuation. */}
                    <span data-testid="media-item-usage">
                      {USAGE_LABELS[item.usage]}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

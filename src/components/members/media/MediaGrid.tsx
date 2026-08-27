import Image from "next/image";
import { formatBytes } from "@/lib/direct-upload";
import { mediaImageSrc } from "@/lib/cf-image";
import { TranscodeBadge } from "./TranscodeBadge";
import type { Media } from "@/payload-types";

export function MediaGrid({
  items,
  onSelect,
}: {
  items: Media[];
  onSelect: (item: Media) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-foreground/50" data-testid="media-grid-empty">
        還沒有媒體，上傳第一個檔案吧。
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
            className="group text-left border border-border"
          >
            <div className="relative aspect-video bg-secondary">
              <TranscodeBadge item={item} />
              {isVideo || !src ? (
                <div className="flex h-full items-center justify-center text-xs text-foreground/40">
                  {isVideo ? "▶ 影片" : "圖片處理中"}
                </div>
              ) : (
                <Image
                  src={src}
                  alt={item.alt}
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="object-cover"
                />
              )}
            </div>
            <div className="p-2 text-xs">
              <div className="truncate">{item.alt}</div>
              <div className="text-foreground/40">
                {item.filesize ? formatBytes(item.filesize) : ""}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { mediaImageSrc } from "@/lib/cf-image";
import type { Media } from "@/payload-types";

/**
 * Resolves a media id to something displayable inside the editor.
 *
 * The node itself only stores the id — that is the whole point of the
 * `depth: 0` rule (a populated Media object must never end up back in
 * `content`), so the picture has to be fetched separately here. Cached per
 * id for the lifetime of the page so re-renders and repeated ids don't
 * refetch.
 */
const cache = new Map<number | string, Media>();

export function UploadPreview({ value }: { value: number | string }) {
  const [media, setMedia] = useState<Media | null>(cache.get(value) ?? null);

  useEffect(() => {
    if (cache.has(value)) {
      setMedia(cache.get(value)!);
      return;
    }
    let cancelled = false;
    fetch(`/api/media/${value}?depth=0`, {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        const doc = body as Media | null;
        if (cancelled || !doc) return;
        cache.set(value, doc);
        setMedia(doc);
      })
      .catch(() => {
        /* a missing image shows the fallback box below */
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  const src = media ? mediaImageSrc(media) : "";
  const isVideo = (media?.mimeType ?? "").startsWith("video/");

  return (
    <div
      data-testid="editor-upload"
      data-media-id={String(value)}
      className="my-4 border border-border"
    >
      {src && !isVideo ? (
        // Not next/image: the editor renders inside contentEditable, where
        // next/image's fill/absolute wrapper fights the block layout, and
        // these are author-facing previews rather than public page loads.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={media?.alt ?? ""}
          className="block max-h-96 w-full object-contain"
        />
      ) : (
        <div className="flex aspect-video items-center justify-center bg-secondary text-xs text-foreground/40">
          {isVideo ? "▶ 影片" : `媒體 #${value}`}
        </div>
      )}
    </div>
  );
}

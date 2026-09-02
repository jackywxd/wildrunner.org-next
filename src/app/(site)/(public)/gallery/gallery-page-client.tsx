"use client";

import React, { useState } from "react";
import type {
  SiteAlbumCard,
  SiteMediaItem,
  SitePhoto,
} from "@/lib/content-types";
import type { WallCursor } from "@/lib/media/gallery-index";
import SwiperLightbox from "@/components/swiper/SwiperLightbox";
import { MediaGrid } from "@/app/(site)/(public)/gallery/_components/MediaGrid";
import { AlbumCards } from "@/app/(site)/(public)/gallery/_components/AlbumCards";
import { FilterChip } from "@/components/media/filters";

/**
 * Everything here arrives already reduced — deduped, sorted, capped, counted.
 *
 * It used to arrive raw (every album with all of its items, plus the whole
 * wall) and four `useMemo`s did the reducing in the browser. That saved render
 * time and no bytes: the input was already serialised into the payload. The
 * work now happens once per cache entry in buildGalleryIndex instead of once
 * per visitor, and the page carries only what it draws.
 */
type GalleryPageClientProps = {
  albums: SiteAlbumCard[];
  featuredPhotos: SitePhoto[];
  /**
   * The wall's first page only — album membership ∪ media.usage, deduped and
   * newest-first, see unionBySrc — not the whole thing. MediaGrid fetches
   * the rest from /api/gallery/wall as the visitor scrolls, using
   * `nextCursor` below to pick up where this page left off.
   */
  items: SiteMediaItem[];
  /** `null` means the first page was the only page. */
  nextCursor: WallCursor | null;
};

type GalleryView = "all" | "albums";

export default function GalleryPageClient({
  albums,
  featuredPhotos,
  items,
  nextCursor,
}: GalleryPageClientProps) {
  // Default: every photo across every published gallery, newest first —
  // "browse everything" is what most visitors want from a link labelled
  // 相册, not a shelf of albums they have to open one at a time. The
  // by-album layout (today's old default) is still one click away.
  const [view, setView] = useState<GalleryView>("all");

  return (
    <div className="container max-w-7xl py-6 lg:py-10">
      <div className="flex flex-col gap-6">
        <section className="border-t-2 border-border pt-8">
          <h1 className="text-4xl font-extrabold text-foreground">相册</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {view === "all" ? "所有相片與影片,依時間排序" : "依相簿瀏覽"}
          </p>

          <div className="mt-4 flex gap-2" data-testid="gallery-view-toggle">
            <FilterChip
              active={view === "all"}
              onClick={() => setView("all")}
              data-testid="gallery-view-all"
            >
              全部相片
            </FilterChip>
            <FilterChip
              active={view === "albums"}
              onClick={() => setView("albums")}
              data-testid="gallery-view-albums"
            >
              依相簿
            </FilterChip>
          </div>

          {view === "all" && (
            <div className="mt-8" data-testid="gallery-all-photos">
              <MediaGrid items={items} nextCursor={nextCursor} />
            </div>
          )}
        </section>

        {view === "albums" && (
          <>
            {featuredPhotos.length > 0 && (
              <section className="border-t-2 border-border pt-8">
                <h2 className="text-xl font-extrabold">精選照片</h2>
                <SwiperLightbox
                  images={featuredPhotos}
                  autoplay={true}
                  featured={true}
                />
              </section>
            )}

            {/*
              One card per album, contents at /gallery/[slug].
              This used to be a section per album, each with its own video
              strip and a ten-photo swiper — which is why the page had to
              carry every album's contents in order to draw a shelf of them.
            */}
            <section className="border-t-2 border-border pt-8">
              <h2 className="mb-4 text-xl font-extrabold">相簿</h2>
              <AlbumCards albums={albums} />
            </section>
          </>
        )}
      </div>
    </div>
  );
}

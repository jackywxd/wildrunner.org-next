"use client";

import React, { useState } from "react";
import type { SiteAlbumCard, SiteMediaItem, SitePhoto } from "@/lib/content-types";
import SwiperLightbox from "@/components/swiper/SwiperLightbox";
import { MediaGrid } from "@/app/(site)/(public)/gallery/_components/MediaGrid";
import { AlbumCards } from "@/app/(site)/(public)/gallery/_components/AlbumCards";
import { cn } from "@/lib/utils";

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
   * Album membership ∪ media.usage, deduped and newest-first — see
   * unionBySrc. Photos and videos in one list because the page draws them in
   * one grid; a separate video rail was a separate order, and two orders is
   * what buried a member's newest upload at position 24.
   */
  items: SiteMediaItem[];
};

type GalleryView = "all" | "albums";

function ViewChip({
  active,
  children,
  onClick,
  // Named for the attribute rather than something like `testId` so the
  // attribute itself appears literally at each call site, which is what
  // `scripts/assert-schema-screen.mjs` greps for. A renamed prop passes
  // typecheck and fails that check — correctly, since its whole job is to
  // prove a selector a test uses really exists. (Deliberately not spelling
  // the attribute out in this comment: a checker that matches its own
  // documentation is the false positive VERIFICATION.md warns about.)
  "data-testid": testId,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  "data-testid": string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={cn(
        "border px-3 py-1 text-xs leading-tight transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:text-foreground",
      )}
      // The only signal that the view has actually switched. These chips
      // are server-rendered, so a click landing before hydration is
      // silently dropped and the shelf never appears — which is exactly how
      // this failed in CI while passing locally, where a warm dev server
      // hydrates before a test can click.
      data-active={active}
    >
      {children}
    </button>
  );
}

export default function GalleryPageClient({
  albums,
  featuredPhotos,
  items,
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
            {view === "all"
              ? "所有相片與影片,依時間排序"
              : "依相簿瀏覽"}
          </p>

          <div className="mt-4 flex gap-2" data-testid="gallery-view-toggle">
            <ViewChip
              active={view === "all"}
              onClick={() => setView("all")}
              data-testid="gallery-view-all"
            >
              全部相片
            </ViewChip>
            <ViewChip
              active={view === "albums"}
              onClick={() => setView("albums")}
              data-testid="gallery-view-albums"
            >
              依相簿
            </ViewChip>
          </div>

          {view === "all" && (
            <div className="mt-8" data-testid="gallery-all-photos">
              <MediaGrid items={items} />
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

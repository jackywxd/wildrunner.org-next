"use client";

import React, { useMemo, useState } from "react";
import type {
  SiteAlbumCard,
  SiteMediaItem,
  SitePhoto,
} from "@/lib/content-types";
import type {
  RaceFilterOption,
  WallCursor,
} from "@/lib/media/gallery-index";
import SwiperLightbox from "@/components/swiper/SwiperLightbox";
import { MediaGrid } from "@/app/[lang]/(site)/(public)/gallery/_components/MediaGrid";
import { AlbumCards } from "@/app/[lang]/(site)/(public)/gallery/_components/AlbumCards";
import { FilterChip, FilterSelect } from "@/components/media/filters";
import { useDictionary } from "@/components/i18n/dictionary-provider";

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
  /**
   * The races the wall and the shelf can both be narrowed to.
   *
   * ONE OPTION LIST, TWO MECHANISMS, and that is deliberate rather than
   * sloppy. The wall's filter has to run on the server — the client holds one
   * page of sixty, so narrowing that here would show whichever eight of the
   * sixty match and then stop. The shelf holds every card it will ever have,
   * so its filter is a `.filter()` and a round trip would fetch what it is
   * already sitting on. Same words, two correct mechanisms — the shape
   * `src/lib/media/filters.ts` describes at length.
   */
  races: RaceFilterOption[];
  /** The site-wide tracks. The wall is not an album, so it has no music of
   *  its own — see the page's own note. */
  musicPlaylist: string[];
};

type GalleryView = "all" | "albums";

/** Matches `MediaGrid`'s own "no filter" value; both are `<select>` values. */
const ANY_RACE = "";

export default function GalleryPageClient({
  albums,
  featuredPhotos,
  items,
  nextCursor,
  races,
  musicPlaylist,
}: GalleryPageClientProps) {
  const t = useDictionary();
  // Default: every photo across every published gallery, newest first —
  // "browse everything" is what most visitors want from a link labelled
  // 相冊, not a shelf of albums they have to open one at a time. The
  // by-album layout (today's old default) is still one click away.
  const [view, setView] = useState<GalleryView>("all");
  // The shelf's own race filter. Deliberately not shared with the wall's: the
  // two views are answering different questions, and carrying a selection
  // across the toggle would silently hide albums a visitor never filtered.
  const [albumRace, setAlbumRace] = useState<number | null>(null);

  const shownAlbums = useMemo(
    () =>
      albumRace === null
        ? albums
        : albums.filter((album) => album.raceEditionIds.includes(albumRace)),
    [albums, albumRace],
  );

  return (
    <div className="container max-w-7xl py-6 lg:py-10">
      <div className="flex flex-col gap-6">
        <section className="border-t-2 border-border pt-8">
          <h1 className="text-4xl font-extrabold text-foreground">{t.galleryPage.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {view === "all" ? t.galleryPage.subtitleAll : t.galleryPage.subtitleAlbums}
          </p>

          <div className="mt-4 flex gap-2" data-testid="gallery-view-toggle">
            <FilterChip
              active={view === "all"}
              onClick={() => setView("all")}
              data-testid="gallery-view-all"
            >
              {t.galleryPage.tabAll}
            </FilterChip>
            <FilterChip
              active={view === "albums"}
              onClick={() => setView("albums")}
              data-testid="gallery-view-albums"
            >
              {t.galleryPage.tabAlbums}
            </FilterChip>
          </div>

          {view === "all" && (
            <div className="mt-8" data-testid="gallery-all-photos">
              <MediaGrid
                items={items}
                nextCursor={nextCursor}
                races={races}
                musicPlaylist={musicPlaylist}
              />
            </div>
          )}
        </section>

        {view === "albums" && (
          <>
            {featuredPhotos.length > 0 && (
              <section className="border-t-2 border-border pt-8">
                <h2 className="text-xl font-extrabold">{t.galleryPage.featured}</h2>
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
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-extrabold">{t.galleryPage.albums}</h2>
                {races.length > 0 && (
                  <FilterSelect
                    label={t.gallery.raceLabel}
                    value={albumRace === null ? ANY_RACE : String(albumRace)}
                    onChange={(next) =>
                      setAlbumRace(next === ANY_RACE ? null : Number(next))
                    }
                    options={[
                      { value: ANY_RACE, label: t.gallery.anyRace },
                      ...races.map((option) => ({
                        value: String(option.id),
                        label: option.label,
                      })),
                    ]}
                    data-testid="gallery-album-filter-race"
                  />
                )}
              </div>
              <AlbumCards albums={shownAlbums} filtered={albumRace !== null} />
            </section>
          </>
        )}
      </div>
    </div>
  );
}

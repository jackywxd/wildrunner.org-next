"use client";

import Image from "next/image";
import { Icon } from "@iconify-icon/react";
import { Link } from "@/components/transition/react-transition-progress/next";
import type { SiteAlbumCard } from "@/lib/content-types";
import { useDictionary } from "@/components/i18n/dictionary-provider";

/**
 * The albums view: one cover per album, and the contents one click away.
 *
 * It used to render, per album, a horizontally scrolling video strip and a
 * SwiperLightbox of the first ten photos — which meant /gallery carried every
 * album's contents in order to draw a shelf of them. Twenty-one albums of
 * that is where half the page's 663 KB came from.
 *
 * A cover wall is also what a reader wants from a view called 依相簿: the
 * question it answers is "which albums exist", and the previous layout
 * answered "here are ten photos from each" in a strip that never fitted.
 */
export function AlbumCards({
  albums,
  filtered = false,
}: {
  albums: SiteAlbumCard[];
  /** Whether a filter is narrowing this list — it decides what empty means. */
  filtered?: boolean;
}) {
  const t = useDictionary();
  if (albums.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="gallery-albums-empty">
        {/* "還沒有相簿" is a claim about the site, and it is false the moment a
            race is selected: a visitor who filtered to a race with no album
            has not discovered that the site has no albums. */}
        {filtered ? t.albums.emptyFiltered : t.albums.emptyAll}
      </p>
    );
  }

  return (
    <div
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
      data-testid="gallery-album-cards"
    >
      {albums.map((album) => (
        <Link
          key={album.slug}
          href={`/gallery/${album.slug}`}
          className="group flex flex-col border border-border bg-background"
          data-testid="gallery-album-card"
        >
          <div className="relative aspect-[4/3] overflow-hidden bg-muted">
            {album.cover?.src ? (
              <Image
                src={album.cover.src}
                alt={album.name}
                fill
                // Four across at the widest breakpoint, two on a phone — the
                // grid above. Without this every cover would be requested at
                // full viewport width.
                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                placeholder={album.cover.blurDataURL ? "blur" : undefined}
                blurDataURL={album.cover.blurDataURL}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Icon
                  className="text-2xl opacity-40"
                  icon="heroicons:photo"
                  inline
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1 px-3 py-2">
            <h2 className="truncate text-sm font-extrabold text-foreground">
              {album.name}
            </h2>
            <p className="text-xs text-muted-foreground">
              {album.photoCount > 0 ? t.albums.photoCount.replace("{count}", String(album.photoCount)) : null}
              {album.photoCount > 0 && album.videoCount > 0 ? " · " : null}
              {album.videoCount > 0 ? t.albums.videoCount.replace("{count}", String(album.videoCount)) : null}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}

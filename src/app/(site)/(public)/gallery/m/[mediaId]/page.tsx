import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft } from "lucide-react";
import { siteConfig } from "@/config/site";
import { mediaDisplayName } from "@/lib/media-name";
import { buildVideoOgImageUrl } from "@/lib/galleryOg";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { getGalleryMediaById } from "@/lib/content";
import { StreamVideoPlayer } from "@/components/stream-video-player";
import { streamHlsUrl } from "@/lib/stream";
import { refreshStreamReady } from "@/lib/stream-ingest";

/**
 * A shareable page for one photo or video, with no album around it.
 *
 * Unifies what used to be a video-only route (`/gallery/v/[mediaId]`, now a
 * 308 redirect here) with photos, which had no id-based share address at
 * all — `getGalleryPhotos()` only ever returned the whole public list.
 *
 * No `generateStaticParams`, deliberately: `next dev` forks a child process to
 * ask for it and throws the answer away on a force-dynamic route, and that
 * child opens a second miniflare over the same SQLite file. See AGENTS.md.
 */

interface GalleryMediaByIdPageProps {
  params: Promise<{ mediaId: string }>;
}

export const dynamic = "force-dynamic";

/** `notFound()` for anything that is not a plain positive integer. */
function parseMediaId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function generateMetadata({
  params,
}: GalleryMediaByIdPageProps): Promise<Metadata> {
  const { mediaId } = await params;
  const id = parseMediaId(mediaId);
  const item = id === null ? null : await getGalleryMediaById(id);
  const baseURL = siteConfig.baseURL ?? "";

  if (!item) return { title: "找不到相片或影片" };

  const title = mediaDisplayName(item);
  const url = `${baseURL}/gallery/m/${id}`;

  if (item.kind === "video") {
    if (item.streamId && !item.streamReady) {
      item.streamReady = await refreshStreamReady(item.mediaId, item.streamId);
    }
    const streamVideoUrl = item.streamReady ? streamHlsUrl(item.streamId) : null;
    // No album to name, so the site itself is the subtitle — the one thing
    // this page carries that the album version takes from the gallery row.
    const ogImage = buildVideoOgImageUrl({
      baseURL,
      title,
      subtitle: siteConfig.name,
    });

    return {
      title: `${title} · ${siteConfig.name}`,
      description: siteConfig.description,
      openGraph: {
        title,
        description: siteConfig.description,
        type: "video.other",
        url,
        images: [{ url: ogImage, alt: title }],
        videos: streamVideoUrl
          ? [{ url: streamVideoUrl, type: "application/x-mpegURL" }]
          : undefined,
      },
      twitter: {
        card: "summary_large_image",
        title,
        description: siteConfig.description,
        images: [ogImage],
      },
    };
  }

  // A photo already has a real image — no composite text overlay like the
  // video OG image needs for lack of a thumbnail.
  const ogImage = item.src.startsWith("http") ? item.src : `${baseURL}${item.src}`;

  return {
    title: `${title} · ${siteConfig.name}`,
    description: siteConfig.description,
    openGraph: {
      title,
      description: siteConfig.description,
      url,
      images: [{ url: ogImage, alt: title, width: item.width, height: item.height }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: siteConfig.description,
      images: [ogImage],
    },
  };
}

export default async function GalleryMediaByIdPage({
  params,
}: GalleryMediaByIdPageProps) {
  const { mediaId } = await params;
  const id = parseMediaId(mediaId);
  const item = id === null ? null : await getGalleryMediaById(id);
  if (!item) notFound();

  if (item.kind === "video" && item.streamId && !item.streamReady) {
    item.streamReady = await refreshStreamReady(item.mediaId, item.streamId);
  }

  const title = mediaDisplayName(item);

  return (
    <div className="container relative max-w-7xl flex flex-col gap-4 py-6 lg:py-10">
      <Link
        href="/gallery"
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "self-start -ml-2 px-2",
        )}
      >
        <ChevronLeft className="mr-1 size-4" />
        相册
      </Link>

      <h1 className="!mb-0 text-4xl font-black leading-[1.12] text-foreground">
        {title}
      </h1>

      {item.kind === "video" ? (
        <div className="w-full overflow-hidden rounded-none border border-border bg-black">
          <StreamVideoPlayer video={item} />
        </div>
      ) : (
        <div className="w-full overflow-hidden rounded-none border border-border">
          <Image
            src={item.src}
            alt={title}
            width={item.width}
            height={item.height}
            blurDataURL={item.blurDataURL}
            placeholder={item.blurDataURL ? "blur" : "empty"}
            className="h-auto w-full"
            sizes="(max-width: 1280px) 100vw, 1280px"
          />
        </div>
      )}
    </div>
  );
}

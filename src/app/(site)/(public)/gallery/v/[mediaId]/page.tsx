import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { siteConfig } from "@/config/site";
import { mediaDisplayName } from "@/lib/media-name";
import { buildVideoOgImageUrl } from "@/lib/galleryOg";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { getGalleryVideoById } from "@/lib/content";
import { StreamVideoPlayer } from "@/components/stream-video-player";
import { streamHlsUrl } from "@/lib/stream";
import { refreshStreamReady } from "@/lib/stream-ingest";

/**
 * A shareable page for a video that belongs to no album.
 *
 * `/gallery/[slug]/v/[videoId]` needs an album to resolve through, because the
 * share id used to live on the membership row (`galleries_videos.video_id`).
 * A member's own upload is in no album, so it had no id and `GalleryVideos`
 * rendered no share button for it at all — the file played inside /gallery and
 * could not be linked to.
 *
 * This route addresses the video by its media id, which is what identifies it
 * now: stable, the same in every album it appears in, and present whether or
 * not it appears in one. No conflict with the album routes — `/gallery/[slug]`
 * is two segments and `/gallery/[slug]/v/[videoId]` is four.
 *
 * No `generateStaticParams`, deliberately: `next dev` forks a child process to
 * ask for it and throws the answer away on a force-dynamic route, and that
 * child opens a second miniflare over the same SQLite file. See AGENTS.md.
 */

interface GalleryVideoByIdPageProps {
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
}: GalleryVideoByIdPageProps): Promise<Metadata> {
  const { mediaId } = await params;
  const id = parseMediaId(mediaId);
  const video = id === null ? null : await getGalleryVideoById(id);
  const baseURL = siteConfig.baseURL ?? "";

  if (!video) return { title: "找不到影片" };

  if (video.streamId && !video.streamReady) {
    video.streamReady = await refreshStreamReady(video.mediaId, video.streamId);
  }

  const videoName = mediaDisplayName(video);
  const streamVideoUrl = video.streamReady ? streamHlsUrl(video.streamId) : null;
  // No album to name, so the site itself is the subtitle — the one thing this
  // page carries that the album version takes from the gallery row.
  const ogImage = buildVideoOgImageUrl({
    baseURL,
    title: videoName,
    subtitle: siteConfig.name,
  });

  return {
    title: `${videoName} · ${siteConfig.name}`,
    description: siteConfig.description,
    openGraph: {
      title: videoName,
      description: siteConfig.description,
      type: "video.other",
      url: `${baseURL}/gallery/v/${video.mediaId}`,
      images: [{ url: ogImage, alt: videoName }],
      videos: streamVideoUrl
        ? [{ url: streamVideoUrl, type: "application/x-mpegURL" }]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: videoName,
      description: siteConfig.description,
      images: [ogImage],
    },
  };
}

export default async function GalleryVideoByIdPage({
  params,
}: GalleryVideoByIdPageProps) {
  const { mediaId } = await params;
  const id = parseMediaId(mediaId);
  const video = id === null ? null : await getGalleryVideoById(id);
  if (!video) notFound();

  if (video.streamId && !video.streamReady) {
    video.streamReady = await refreshStreamReady(video.mediaId, video.streamId);
  }

  const title = mediaDisplayName(video);

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

      <div className="w-full overflow-hidden rounded-none border border-border bg-black">
        <StreamVideoPlayer video={video} />
      </div>
    </div>
  );
}

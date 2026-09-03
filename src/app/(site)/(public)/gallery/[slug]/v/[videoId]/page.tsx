import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { siteConfig } from "@/config/site";
import { mediaDisplayName } from "@/lib/media-name";
import {
  buildVideoOgImageUrl,
  resolveGalleryCoverSrc,
} from "@/lib/galleryOg";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  getGalleryBySlug,
  getGalleryVideo,
} from "@/lib/content";
import { StreamVideoPlayer } from "@/components/stream-video-player";
import { streamHlsUrl } from "@/lib/stream";
import { refreshStreamReady } from "@/lib/stream-ingest";

interface GalleryVideoPageProps {
  params: Promise<{
    slug: string;
    videoId: string;
  }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: GalleryVideoPageProps): Promise<Metadata> {
  const { slug, videoId } = await params;
  const gallery = await getGalleryBySlug(slug);
  const result = gallery ? getGalleryVideo(gallery, videoId) : undefined;
  const baseURL = siteConfig.baseURL ?? "";

  if (!result) {
    return {
      title: "错误：找不到视频",
    };
  }
  if (result.video.streamId && !result.video.streamReady) {
    result.video.streamReady = await refreshStreamReady(
      result.video.mediaId,
      result.video.streamId,
    );
  }

  const { gallery: g, video } = result;
  const videoName = mediaDisplayName(video);
  // The album is named in the description and on the card's byline, and the
  // root template adds the site name. Carrying all three in the tab title is
  // how this route ended up with two different separators in one string.
  const title = videoName;
  const description = `${g.name} · ${siteConfig.description}`;
  const pageUrl = `${baseURL}/gallery/${g.slug}/v/${encodeURIComponent(video.id)}`;
  const ogImage = buildVideoOgImageUrl({
    baseURL,
    title: videoName,
    subtitle: g.name,
    coverSrc: resolveGalleryCoverSrc(g),
  });
  const streamVideoUrl = video.streamReady
    ? streamHlsUrl(video.streamId)
    : null;

  return {
    title,
    description,
    openGraph: {
      title: videoName,
      description,
      type: "video.other",
      url: pageUrl,
      images: [{ url: ogImage, alt: title }],
      videos: streamVideoUrl
        ? [{ url: streamVideoUrl, type: "application/x-mpegURL" }]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: videoName,
      description,
      images: [ogImage],
    },
  };
}

export default async function GalleryVideoPage({
  params,
}: GalleryVideoPageProps) {
  const { slug, videoId } = await params;
  const gallery = await getGalleryBySlug(slug);
  const result = gallery ? getGalleryVideo(gallery, videoId) : undefined;
  if (!result) notFound();
  if (result.video.streamId && !result.video.streamReady) {
    result.video.streamReady = await refreshStreamReady(
      result.video.mediaId,
      result.video.streamId,
    );
  }

  const { gallery: g, video } = result;
  const title = mediaDisplayName(video);

  return (
    <div className="container relative max-w-7xl flex flex-col gap-4 py-6 lg:py-10">
      <Link
        href={`/gallery/${g.slug}`}
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "self-start -ml-2 px-2",
        )}
      >
        <ChevronLeft className="mr-1 size-4" />
        {g.name}
      </Link>

      <h1 className="!mb-0 text-4xl font-black leading-[1.12] text-foreground">
        {title}
      </h1>
      <p className="!mt-0 text-sm text-muted-foreground">{g.name}</p>

      <div className="w-full overflow-hidden rounded-none border border-border bg-black">
        <StreamVideoPlayer video={video} />
      </div>
    </div>
  );
}

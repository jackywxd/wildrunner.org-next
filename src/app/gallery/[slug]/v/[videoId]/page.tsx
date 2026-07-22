import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { galleries } from "#site/content";
import { siteConfig } from "@/config/site";
import { getGalleryVideo } from "@/store/velite";
import {
  buildVideoOgImageUrl,
  resolveGalleryCoverSrc,
} from "@/lib/galleryOg";
import { getVideoId } from "@/lib/videoId";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

interface GalleryVideoPageProps {
  params: Promise<{
    slug: string;
    videoId: string;
  }>;
}

function videoTitle(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

export async function generateMetadata({
  params,
}: GalleryVideoPageProps): Promise<Metadata> {
  const { slug, videoId } = await params;
  const result = getGalleryVideo(slug, videoId);
  const baseURL = siteConfig.baseURL ?? "";

  if (!result) {
    return {
      title: "错误：找不到视频",
    };
  }

  const { gallery, video } = result;
  const title = `${videoTitle(video.filename)} | ${gallery.name}`;
  const description = `${gallery.name} · ${videoTitle(video.filename)}`;
  const pageUrl = `${baseURL}/gallery/${gallery.slug}/v/${getVideoId(video)}`;
  const ogImage = buildVideoOgImageUrl({
    baseURL,
    title: videoTitle(video.filename),
    subtitle: gallery.name,
    coverSrc: resolveGalleryCoverSrc(gallery),
  });

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "video.other",
      url: pageUrl,
      images: [{ url: ogImage, alt: title }],
      videos: [
        {
          url: video.src,
          type: video.mimeType || "video/mp4",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export async function generateStaticParams() {
  return galleries.flatMap((gallery) =>
    (gallery.videos ?? []).map((video) => ({
      slug: gallery.slug,
      videoId: getVideoId(video),
    }))
  );
}

export default async function GalleryVideoPage({
  params,
}: GalleryVideoPageProps) {
  const { slug, videoId } = await params;
  const result = getGalleryVideo(slug, videoId);
  if (!result) notFound();

  const { gallery, video } = result;
  const title = videoTitle(video.filename);

  return (
    <div className="prose-article flex flex-col gap-4">
      <Link
        href={`/gallery/${gallery.slug}`}
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "self-start -ml-2 px-2 not-prose"
        )}
      >
        <ChevronLeft className="mr-1 size-4" />
        {gallery.name}
      </Link>

      <h1 className="!mb-0">{title}</h1>
      <p className="opacity-70 !mt-0 text-sm">{gallery.name}</p>

      <div className="not-prose w-full overflow-hidden rounded-lg bg-black">
        <video
          src={video.src}
          controls
          playsInline
          preload="metadata"
          className="aspect-video w-full"
        >
          <source src={video.src} type={video.mimeType || "video/mp4"} />
          {video.filename}
        </video>
      </div>
    </div>
  );
}

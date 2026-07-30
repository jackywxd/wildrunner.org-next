import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PhotoGallery from "@/app/(site)/(public)/gallery/_components/PhotoGallery";
import { siteConfig } from "@/config/site";
import { resolveGalleryOgImage } from "@/lib/galleryOg";
import {
  getGalleryBySlug,
  getPublishedGalleries,
  getSiteGlobals,
} from "@/lib/content";

export const dynamic = "force-dynamic";

interface GalleryDetailPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateMetadata({
  params,
}: GalleryDetailPageProps): Promise<Metadata> {
  const gallery = await getGalleryBySlug((await params).slug);
  const globals = await getSiteGlobals();
  const baseURL = siteConfig.baseURL ?? "";

  if (gallery == null) {
    return {
      title: `错误：找不到相册`,
      description: `错误：找不到相册。 | ${globals.metadata.description}`,
      openGraph: {
        title: `错误：找不到相册`,
        description: `错误：找不到相册。 | ${globals.metadata.description}`,
      },
    };
  }

  const title = `${gallery.name} | 相册`;
  const description = `${gallery.name}的照片`;
  const ogImage = resolveGalleryOgImage(gallery, baseURL);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${baseURL}/gallery/${gallery.slug}`,
      images: [
        {
          url: ogImage,
          alt: gallery.name,
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
  const galleries = await getPublishedGalleries();
  return galleries.map((gallery) => ({
    slug: gallery.slug,
  }));
}

const GalleryDetailPage: React.FC<GalleryDetailPageProps> = async ({
  params,
}) => {
  const gallery = await getGalleryBySlug((await params).slug);
  if (!gallery) notFound();

  const videoCount = gallery.videos?.length ?? 0;

  return (
    <div className="container relative max-w-7xl py-6 lg:py-10">
      <div className="flex flex-col gap-4">
        <h1 className="text-4xl font-black leading-[1.12] text-foreground">
          {gallery.name}
        </h1>
        <div className="text-left text-sm text-muted-foreground">
          {gallery.images.length}张照片
          {videoCount > 0 ? ` · ${videoCount}个视频` : null}
        </div>
        <PhotoGallery gallery={gallery} />
      </div>
    </div>
  );
};

export default GalleryDetailPage;

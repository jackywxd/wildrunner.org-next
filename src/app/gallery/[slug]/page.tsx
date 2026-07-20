import React from "react";
import type { Metadata } from "next";
import { getGalleryBySlug } from "@/store/velite";
import { galleries, globals } from "#site/content";
import { notFound } from "next/navigation";
import PhotoGallery from "@/app/gallery/_components/PhotoGallery";
import { siteConfig } from "@/config/site";

interface GalleryDetailPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateMetadata({
  params,
}: GalleryDetailPageProps): Promise<Metadata> {
  const gallery = getGalleryBySlug((await params).slug);
  const baseURL = siteConfig.baseURL;

  let ogImage = `${baseURL}/og?title=${gallery?.name}`;
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
          alt: gallery?.name,
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
  return galleries.map(async (gallery) => ({
    slug: gallery.slug,
  }));
}

const GalleryDetailPage: React.FC<GalleryDetailPageProps> = async ({
  params,
}) => {
  const gallery = getGalleryBySlug((await params).slug);
  if (!gallery) notFound();

  return (
    <div className="prose-article flex flex-col gap-4">
      <h1>{gallery.name}</h1>
      <div className="text-end opacity-80">{gallery.images.length}张照片</div>
      <PhotoGallery gallery={gallery} />
    </div>
  );
};

export default GalleryDetailPage;

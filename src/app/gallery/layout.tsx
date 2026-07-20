import React from "react";
import { Metadata } from "next";
import { siteConfig } from "@/config/site";

export function generateMetadata(): Metadata {
  const baseURL = siteConfig.baseURL;
  const title = `${siteConfig.title} | 相册`;
  const description = `${siteConfig.description} `;
  let ogImage = `${baseURL}/og?title=${title}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `${baseURL}/gallery`,
      images: [
        {
          url: ogImage,
          alt: description,
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

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="container relative max-w-7xl py-6 lg:py-10">{children}</div>
  );
}



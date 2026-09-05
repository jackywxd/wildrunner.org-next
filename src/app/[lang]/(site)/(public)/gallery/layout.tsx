import React from "react";
import { Metadata } from "next";
import { pageMetadata } from "@/lib/site-metadata";
import { getDictionary } from "@/lib/i18n/dictionary";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return pageMetadata({
    path: "/gallery",
    title: t.gallery.albumTitle,
    subtitle: t.gallery.albumSubtitle,
    card: { kind: "plain" },
  });
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



import React from "react";
import { Metadata } from "next";
import { pageMetadata } from "@/lib/site-metadata";
import { currentLocale, getDictionary } from "@/lib/i18n/dictionary";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return pageMetadata({
    locale: await currentLocale(),
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
  // Every gallery page draws its own `container`; wrapping it in a second
  // one here doubled the gutter and the vertical padding both.
  return children;
}



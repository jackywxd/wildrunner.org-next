import React from "react";
import { Metadata } from "next";
import { pageMetadata } from "@/lib/site-metadata";

export function generateMetadata(): Metadata {
  return pageMetadata({
    path: "/gallery",
    title: "相冊",
    subtitle: "野馬營在賽道上、山裡和終點線後的照片與影片。",
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



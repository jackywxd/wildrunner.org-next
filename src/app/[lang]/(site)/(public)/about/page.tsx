import React from "react";
import PageHeader from "@/components/page-header";
import { siteConfig } from "@/config/site";
import { Metadata } from "next";
import { getSiteGlobals } from "@/lib/content";
import { pageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = pageMetadata({
  path: "/about",
  title: "關於野馬營",
  subtitle: "一群在溫哥華相遇的越野跑者，和這個站為什麼存在。",
  card: { kind: "plain" },
});

export default async function AboutPage() {
  const globals = await getSiteGlobals();

  return (
    <div className="container relative max-w-6xl py-6 lg:py-10">
      <PageHeader title="關於野馬營" description={siteConfig.slogan} />
      <hr className="my-8 h-0 border-t-2 border-border" />

      {/* Bounded, because the container is not. Same reasoning as the rider
          page's bio: at 1440px this paragraph would set ~65 Chinese
          characters to a line where a readable measure is nearer 40.
          `whitespace-pre-line` is what makes paragraphs work in a textarea —
          the admin presses return, and the blank line survives to here. */}
      <p
        className="max-w-2xl whitespace-pre-line text-left text-muted-foreground lg:text-lg"
        data-testid="about-body"
      >
        {globals.about ?? globals.metadata.description}
      </p>
    </div>
  );
}

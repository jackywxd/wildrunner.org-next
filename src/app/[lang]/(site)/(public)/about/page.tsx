import React from "react";
import PageHeader from "@/components/page-header";
import { siteConfig } from "@/config/site";
import { Metadata } from "next";
import { getSiteGlobals } from "@/lib/content";
import { pageMetadata } from "@/lib/site-metadata";
import { currentLocale, getDictionary } from "@/lib/i18n/dictionary";

export async function generateMetadata(): Promise<Metadata> {
  // A function rather than the static `metadata` object it was: the title and
  // the sentence under it come from the dictionary now, and reading that
  // needs the request's language.
  const t = await getDictionary();
  return pageMetadata({
    locale: await currentLocale(),
    path: "/about",
    title: t.about.title,
    subtitle: t.about.subtitle,
    card: { kind: "plain" },
  });
}

export default async function AboutPage() {
  const [globals, t] = await Promise.all([getSiteGlobals(), getDictionary()]);

  return (
    <div className="container relative max-w-6xl py-6 lg:py-10">
      <PageHeader title={t.about.title} description={siteConfig.slogan} />
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

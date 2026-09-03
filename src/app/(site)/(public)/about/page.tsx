import React from "react";
import PageHeader from "@/components/page-header";
import { siteConfig } from "@/config/site";
import { Metadata } from "next";
import { getSiteGlobals } from "@/lib/content";

/**
 * 關於野馬營.
 *
 * WHAT WAS HERE BEFORE, and why none of it survived: this page was the blog
 * template's, unchanged. It rendered a name card built from
 * `siteConfig.authorImage` — which resolves to `devbertskie.png`, the
 * template author's own photo — under a hardcoded English job title,
 * "Full Stack Developer", on a Vancouver trail-running club's about page.
 * Beside it sat three social buttons whose Facebook and Twitter entries were
 * `https://facebook.com` and `https://twitter.com`: not broken links, which
 * announce themselves, but working buttons that quietly sent a visitor to
 * another company's front door.
 *
 * The heading and standfirst were English ("About", "Let's get to know each
 * other") directly beneath a Chinese nav.
 *
 * WHAT IT SAYS NOW is deliberately only what this repository can already
 * prove: the club's own slogan, and the description on the Site global. The
 * body is still `metadata.description`, which is a sentence written for
 * search results rather than for a reader — that is the next thing to fix,
 * and fixing it properly means giving the Site global an `about` field so the
 * copy can be edited without a deploy. Left undone here on purpose: this
 * change removes what was untrue, and inventing replacement prose about a
 * club I cannot ask would just be a nicer-looking version of the same
 * problem.
 */

export const metadata: Metadata = {
  title: "關於",
};

export default async function AboutPage() {
  const globals = await getSiteGlobals();

  return (
    <div className="container relative max-w-6xl py-6 lg:py-10">
      <PageHeader title="關於野馬營" description={siteConfig.slogan} />
      <hr className="my-8 h-0 border-t-2 border-border" />

      {/* Bounded, because the container is not. Same reasoning as the rider
          page's bio: at 1440px this paragraph would set ~65 Chinese
          characters to a line where a readable measure is nearer 40. */}
      <p className="max-w-2xl whitespace-pre-line text-left text-muted-foreground lg:text-lg">
        {globals.metadata.description}
      </p>
    </div>
  );
}

import Link from "next/link";

import Marquee from "@/components/magicui/Marquee";
import PhotoCard from "@/components/PhotoCard";
import { RaceEntryRow } from "@/components/race-schedule/RaceEntryRow";
import { siteConfig } from "@/config/site";
import type { SitePhoto } from "@/lib/content-types";
import {
  getPublishedGalleries,
  getPublishedPosts,
  getSiteGlobals,
  getUpcomingRaces,
} from "@/lib/content";
import { isRegistrationOpen } from "@/lib/races/registration";
import Races from "@/components/races";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const globals = await getSiteGlobals();
  const title = globals.metadata.titleDefault || siteConfig.title;
  const description =
    globals.metadata.description || siteConfig.description;
  const baseURL = siteConfig.baseURL;

  const ogImage = `${baseURL}/og?title=${encodeURIComponent(title)}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: baseURL,
      images: [
        {
          url: ogImage,
          alt: title,
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

const HOME_RACE_COUNT = 4;

export default async function Home() {
  // One clock for the whole render, so a race cannot be evaluated against
  // two different days within the same page.
  const now = new Date();

  const [globals, galleries, posts, upcomingRaces] = await Promise.all([
    getSiteGlobals(),
    getPublishedGalleries(),
    getPublishedPosts(),
    getUpcomingRaces({ now }),
  ]);

  // Open entries first, then the nearest races to fill the row. The
  // homepage question is "what can I still sign up for", and a strict date
  // sort answers "what happens soonest" — which is often a race that closed
  // months ago.
  const featuredRaces = [
    ...upcomingRaces.filter((race) => isRegistrationOpen(race, now)),
    ...upcomingRaces.filter((race) => !isRegistrationOpen(race, now)),
  ].slice(0, HOME_RACE_COUNT);

  const imageCount = galleries.reduce((acc, gallery) => {
    return acc + gallery.images.length;
  }, 0);

  let featuredImages = galleries.reduce((acc, gallery) => {
    return acc.concat(gallery.images.filter((image) => image.featured));
  }, [] as SitePhoto[]);

  featuredImages =
    featuredImages.length > 20 ? featuredImages.slice(0, 20) : featuredImages;

  const filteredPosts = posts
    .filter((post) => post.published)
    .sort(
      (a, b) =>
        new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime(),
    );

  return (
    <main className="container relative max-w-6xl py-6 lg:py-10">
      <section className="space-y-6 pb-8 md:pb-12 md:pt-10 lg:py-32">
        <div className="mt-6 flex max-w-5xl flex-col items-start gap-4 xl:mt-0">
          <h1 className="text-[42px] font-black leading-[1.12]">
            {globals.heroTitleZh}
          </h1>
          <h1 className="text-primary text-[42px] font-black leading-[1.12]">
            {globals.heroTitleEn}
          </h1>
          {siteConfig.description && (
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              {globals.metadata.description || siteConfig.description}
            </p>
          )}

          <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row">
            <Link
              href="/posts"
              className={cn(buttonVariants({ variant: "default" }), "px-6")}
            >
              查看文章
            </Link>
            <Link
              href="/about"
              className={cn(buttonVariants({ variant: "outline" }), "px-6")}
            >
              關於我們
            </Link>
          </div>
        </div>
      </section>
      {filteredPosts?.length > 0 && (
        <>
          <h2 className="text-xl font-bold sm:text-2xl md:text-3xl">
            Latest Posts
          </h2>
          <section>
            <Races
              allRaces={
                filteredPosts.length < 8
                  ? filteredPosts
                  : filteredPosts.slice(0, 8)
              }
            />
          </section>
        </>
      )}

      {featuredRaces.length > 0 && (
        <section className="mt-10 border-t-2 border-border pt-8">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-bold sm:text-2xl">近期賽事</h2>
              <p className="text-sm text-muted-foreground">
                未來一年的越野賽事與報名時間
              </p>
            </div>
            <Link
              href="/races"
              data-testid="home-races-link"
              className={cn(buttonVariants({ variant: "ghost" }), "px-6")}
            >
              查看全部
            </Link>
          </div>

          <ul className="mt-6 space-y-3">
            {featuredRaces.map((race) => (
              <RaceEntryRow entry={race} key={race.id} now={now} />
            ))}
          </ul>
        </section>
      )}

      {featuredImages?.length > 0 && (
        <section className="mt-10 border-t-2 border-border pt-8">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-bold sm:text-2xl">相册</h2>
              <p className="text-sm text-muted-foreground">
                浏览 {imageCount} 張圖片
              </p>
            </div>
            <Link
              href="/gallery"
              className={cn(buttonVariants({ variant: "ghost" }), "px-6")}
            >
              前往相册
            </Link>
          </div>

          <div className="mt-6">
            <Marquee className="h-[160px] [--duration:240s] overflow-clip">
              {featuredImages.map((image, i) => (
                <PhotoCard
                  key={image.slug}
                  item={image}
                  maxWidth={250}
                  maxHeight={119}
                  priority={i < 3}
                />
              ))}
            </Marquee>
          </div>
        </section>
      )}

      <section className="mt-12 bg-primary px-6 py-10 text-primary-foreground">
        <div className="max-w-5xl">
          <p className="text-xs font-semibold tracking-widest text-primary-foreground/80">
            WILDRUNNER.ORG
          </p>
          <h2 className="mt-2 text-[32px] font-black leading-[1.12]">
            一群野馬，一個家。
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-primary-foreground/85 sm:text-base">
            {siteConfig.slogan}
          </p>
          <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row">
            <Link
              href="/posts"
              className={cn(
                buttonVariants({ variant: "secondary" }),
                "bg-primary-foreground text-primary hover:bg-primary-foreground/90",
              )}
            >
              查看文章
            </Link>
            <Link
              href="/gallery"
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "px-6 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground",
              )}
            >
              看照片
            </Link>
            <Link
              href="/riders"
              data-testid="home-riders-link"
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "px-6 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground",
              )}
            >
              認識成員
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

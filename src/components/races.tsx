import React from "react";
import type { SitePost } from "@/lib/content-types";
import Image from "next/image";
import Link from "@/components/i18n/locale-link";
import { cn, formatDate } from "@/lib/utils";
import { Pencil } from "lucide-react";
import { postPublicPath } from "@/lib/content-paths";
import { getDictionary } from "@/lib/i18n/dictionary";

export default async function Races({ allRaces }: { allRaces: SitePost[] }) {
  const t = await getDictionary();
  const rs = allRaces.sort(
    (a, b) =>
      new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime(),
  );
  return (
    // `mx-auto`: the homepage container is max-w-6xl and this block is
    // max-w-4xl, so without auto margins the grid hugged the left edge and
    // left ~2xl of dead space beside it — visibly out of line with the
    // gallery section below, which fills the container.
    <div className="mx-auto max-w-4xl py-6 lg:py-10">
      {rs.length ? (
        <div className="grid gap-10 sm:grid-cols-2">
          {rs.map((race, index) => (
            <article
              key={race.slug}
              // One height for every card — see `posts/page.tsx`, whose cards
              // these are on the homepage. Taller from `xl`, where the cover is.
              className="group relative flex h-[370px] flex-col space-y-2 overflow-hidden border border-border bg-secondary p-4 xl:h-[450px]"
            >
              {!race.published ? (
                <span className="absolute inset-0 flex items-center justify-center bg-background opacity-60">
                  <Pencil size={80} className="text-gray-800" />
                  <span className="sr-only">Under Construction</span>
                </span>
              ) : (
                <Link
                  href={postPublicPath(race.slug)}
                  className="absolute inset-0"
                >
                  <span className="sr-only">{t.posts.read}</span>
                </Link>
              )}
              {race.image && (
                <div className="flex mx-auto w-[200px] h-[120px] xl:w-[300px] xl:h-[200px] shrink-0 overflow-hidden justify-center items-center bg-cover">
                  <Image
                    src={race.image.src}
                    alt={race.title}
                    width={race.image.width}
                    height={race.image.height}
                    sizes="(max-width: 1280px) 200px, 300px"
                    priority={index < 2}
                    loading={index < 2 ? undefined : "lazy"}
                    className="grayscale transition-colors overflow-hidden bg-cover bg-center object-contain"
                    placeholder={race.image.blurDataURL ? "blur" : undefined}
                    blurDataURL={race.image.blurDataURL}
                  />
                </div>
              )}
              <h2 className="line-clamp-2 shrink-0 text-2xl font-extrabold text-foreground group-hover:text-primary">
                {race.title}
              </h2>
              {race.description && (
                <p
                  className={cn(
                    "text-muted-foreground",
                    race.image ? "line-clamp-3" : "line-clamp-[7] xl:line-clamp-[10]",
                  )}
                >
                  {race.description}
                </p>
              )}
              <div className="!mt-auto shrink-0 space-y-1 pt-2">
                {race.date && (
                  <p className="text-sm text-muted-foreground">
                    {formatDate(race.date)}
                  </p>
                )}
                {race.author && (
                  <p className="font-bold text-muted-foreground" data-testid="post-card-author">
                    {race.author}
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p>{t.posts.empty}</p>
      )}
    </div>
  );
}

import React from "react";
import type { SitePost } from "@/lib/content-types";
import Image from "next/image";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { Pencil } from "lucide-react";
import { postPublicPath } from "@/lib/content-paths";

export default function Races({ allRaces }: { allRaces: SitePost[] }) {
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
              className="group relative flex flex-col space-y-2 border border-border bg-secondary p-4"
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
                  <span className="sr-only">View Article</span>
                </Link>
              )}
              {race.image && (
                <div className="flex mx-auto w-[200px] h-[120px] xl:w-[300px] xl:h-[200px] overflow-hidden justify-center items-center bg-cover">
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
              <h2 className="text-2xl font-extrabold text-foreground group-hover:text-primary">
                {race.title}
              </h2>
              {race.description && (
                <p className="text-muted-foreground">{race.description}</p>
              )}
              {race.date && (
                <p className="text-sm text-muted-foreground">
                  {formatDate(race.date)}
                </p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p>No Posts found</p>
      )}
    </div>
  );
}

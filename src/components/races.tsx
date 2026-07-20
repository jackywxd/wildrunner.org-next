import React from "react";
import { posts } from "#site/content";
import Image from "next/image";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { Pencil } from "lucide-react"; // Example from lucide-react

export default function Races({ allRaces }: { allRaces: typeof posts }) {
  const rs = allRaces.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  return (
    <div className="container max-w-4xl py-6 lg:py-10">
      {rs.length ? (
        <div className="grid gap-10 sm:grid-cols-2">
          {rs.map((race) => (
            <article
              key={race.slug}
              className="group relative flex flex-col space-y-2"
            >
              {!race.published ? (
                <span className="absolute inset-0 flex items-center justify-center bg-gray-300 opacity-50">
                  <Pencil size={80} className="text-gray-800" />
                  <span className="sr-only">Under Construction</span>
                </span>
              ) : (
                <Link href={race.slug} className="absolute inset-0">
                  <span className="sr-only">View Article</span>
                </Link>
              )}
              {race.image && (
                <div className="flex mx-auto w-[200px] h-[120px] xl:w-[300px] xl:h-[200px] overflow-hidden justify-center items-center bg-cover">
                  <Image
                    src={race.image}
                    alt={race.title}
                    width={300}
                    height={200}
                    loading="lazy"
                    className="transition-colors rounded-xl overflow-hidden bg-cover bg-center object-contain"
                    placeholder={
                      "blurDataURL" in race.image ? "blur" : undefined
                    }
                  />
                </div>
              )}
              <h2 className="text-2xl font-extrabold text-primary">
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

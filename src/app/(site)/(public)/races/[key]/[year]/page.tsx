import type { Metadata } from "next";
import { notFound } from "next/navigation";

import PageHeader from "@/components/page-header";
import { RaceSeriesTag } from "@/components/race-schedule/RaceSeriesTag";
import {
  getRaceEditionDetail,
  getRaceEditionPhotos,
  getRaceEditionVideos,
} from "@/lib/content";
import { externalHref } from "@/lib/races/registration";
import { GalleryVideos } from "@/app/(site)/(public)/gallery/_components/GalleryVideos";
import { raceGallerySlug } from "@/lib/race-gallery";
import { pageMetadata } from "@/lib/site-metadata";

import RacePhotoWall from "./_components/RacePhotoWall";

export const dynamic = "force-dynamic";

interface RaceEditionPageProps {
  params: Promise<{ key: string; year: string }>;
}

async function loadEdition(params: RaceEditionPageProps["params"]) {
  const { key, year } = await params;
  const parsedYear = Number(year);
  if (!Number.isInteger(parsedYear)) return null;
  return getRaceEditionDetail(key, parsedYear);
}

export async function generateMetadata({
  params,
}: RaceEditionPageProps): Promise<Metadata> {
  const edition = await loadEdition(params);
  if (!edition) return {};

  return pageMetadata({
    path: `/races/${edition.eventKey}/${edition.year}`,
    title: `${edition.nameZh || edition.name} ${edition.year}`,
    subtitle: `${edition.nameZh || edition.name} ${edition.year} 的賽事資訊與相片牆。`,
    card: { kind: "plain" },
  });
}

/** "2026-08-28" -> "8月28日". */
function formatDay(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function formatRange(startDate?: string, endDate?: string): string | undefined {
  if (!startDate) return undefined;
  if (!endDate || endDate === startDate) return formatDay(startDate);
  const sameMonth = endDate.slice(0, 7) === startDate.slice(0, 7);
  const end = sameMonth
    ? `${Number(endDate.slice(8, 10))}日`
    : formatDay(endDate);
  return `${formatDay(startDate)}–${end}`;
}

export default async function RaceEditionPage({ params }: RaceEditionPageProps) {
  const edition = await loadEdition(params);
  if (!edition) notFound();

  const [photos, videos] = await Promise.all([
    getRaceEditionPhotos(edition.id),
    getRaceEditionVideos(edition.id),
  ]);
  const range = formatRange(edition.startDate, edition.endDate);
  const place = [edition.location, edition.country].filter(Boolean).join(" · ");
  const site = externalHref(edition.url);

  return (
    <div className="container max-w-4xl py-6 lg:py-10" data-testid="race-edition-page">
      <PageHeader
        title={`${edition.nameZh || edition.name} ${edition.year}`}
        description={edition.nameZh ? edition.name : undefined}
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <RaceSeriesTag series={edition.series} />
        {range && (
          <span className="text-sm font-medium tabular-nums text-foreground/70">
            {range}
          </span>
        )}
      </div>

      {(place || edition.distanceSummary) && (
        <p className="mt-2 text-sm text-muted-foreground">
          {[place, edition.distanceSummary].filter(Boolean).join("　|　")}
        </p>
      )}

      {site && (
        <a
          className="mt-2 inline-block text-sm text-primary hover:underline"
          href={site}
          rel="noopener noreferrer"
          target="_blank"
        >
          官方網站 →
        </a>
      )}

      <hr className="my-8 h-0 border-t-2 border-border" />

      <h2 className="font-heading text-lg font-semibold">相片牆</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        會員上傳時標記這場比賽，就會出現在這裡。
      </p>

      {videos.length > 0 && (
        <div className="mt-4" data-testid="race-video-strip">
          <GalleryVideos
            videos={videos.map((video) => ({ ...video, id: String(video.mediaId) }))}
            gallerySlug={raceGallerySlug(edition.eventKey, edition.year)}
            compact
          />
        </div>
      )}

      <div className="mt-4">
        <RacePhotoWall photos={photos} />
      </div>
    </div>
  );
}

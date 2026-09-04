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
import { ShareSheet } from "@/components/share/ShareSheet";
import { WeChatThumb } from "@/components/share/WeChatThumb";
import { wechatText, xiaohongshuText } from "@/lib/share/share-text";
import type { ShareSubject } from "@/lib/share/share-text";
import { siteConfig } from "@/config/site";

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

  // A PHOTOGRAPH FROM ITS OWN WALL WHEN THERE IS ONE. This page is the most
  // shareable thing on the site — a race somebody just ran — and a picture
  // from that race beats any generated card. One extra query, on a page that
  // already runs several.
  const [photo] = await getRaceEditionPhotos(edition.id);

  return pageMetadata({
    path: `/races/${edition.eventKey}/${edition.year}`,
    title: `${edition.nameZh || edition.name} ${edition.year}`,
    subtitle: `${edition.nameZh || edition.name} ${edition.year} 的賽事資訊與相片牆。`,
    // Seeded on the event key, not on the edition: it is the same race every
    // year, and `races/design-tokens.ts` hashes that same key for the badge
    // drawn on this very page. The card and the badge therefore agree, which
    // is the only reason to prefer a hash over a stored colour.
    card: photo
      ? { kind: "photo", src: photo.src }
      : { kind: "rainbow", seed: edition.eventKey },
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

  const shareSubject: ShareSubject = {
    kind: "race",
    name: edition.nameZh || edition.name,
    year: edition.year,
    series: edition.series,
    location: edition.location,
    distanceSummary: edition.distanceSummary,
    url: `${siteConfig.baseURL}/races/${edition.eventKey}/${edition.year}`,
  };
  const posterPath = `/share/race/${edition.eventKey}/${edition.year}`;

  return (
    <div className="container max-w-4xl py-6 lg:py-10" data-testid="race-edition-page">
      {/* The first image on this page that is ≥300×300 — the rule WeChat
          picks by. The photo wall below is full of larger ones, so this has to
          come before them. */}
      <WeChatThumb src={`/wx/race/${edition.eventKey}/${edition.year}`} />

      <div className="mb-4">
        <ShareSheet
          posterSrc={posterPath}
          title={shareSubject.name}
          wechatText={wechatText(shareSubject)}
          xiaohongshuText={xiaohongshuText(shareSubject)}
        />
      </div>

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

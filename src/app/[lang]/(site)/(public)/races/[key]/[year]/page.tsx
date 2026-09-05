import type { Metadata } from "next";
import { notFound } from "next/navigation";

import PageHeader from "@/components/page-header";
import { RaceSeriesTag } from "@/components/race-schedule/RaceSeriesTag";
import { seriesLabel } from "@/lib/i18n/race-labels";
import {
  getRaceEditionDetail,
  getRaceEditionPhotos,
  getRaceEditionVideos,
} from "@/lib/content";
import { externalHref } from "@/lib/races/registration";
import { GalleryVideos } from "@/app/[lang]/(site)/(public)/gallery/_components/GalleryVideos";
import { raceGallerySlug } from "@/lib/race-gallery";
import { pageMetadata } from "@/lib/site-metadata";

import RacePhotoWall from "./_components/RacePhotoWall";
import { ShareSheet } from "@/components/share/ShareSheet";
import { WeChatThumb } from "@/components/share/WeChatThumb";
import { wechatText, xiaohongshuText } from "@/lib/share/share-text";
import type { ShareSubject } from "@/lib/share/share-text";
import { siteConfig } from "@/config/site";
import { getDictionary } from "@/lib/i18n/dictionary";

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
  const t = await getDictionary();
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
    subtitle: t.raceEdition.subtitle
      .replace("{name}", edition.nameZh || edition.name)
      .replace("{year}", String(edition.year)),
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
function formatDay(date: string, monthDay: string): string {
  const [, month, day] = date.split("-");
  return monthDay.replace("{month}", String(Number(month))).replace("{day}", String(Number(day)));
}

function formatRange(
  startDate: string | undefined,
  endDate: string | undefined,
  monthDay: string,
  dayOnly: string,
): string | undefined {
  if (!startDate) return undefined;
  if (!endDate || endDate === startDate) return formatDay(startDate, monthDay);
  const sameMonth = endDate.slice(0, 7) === startDate.slice(0, 7);
  const end = sameMonth
    ? dayOnly.replace("{day}", String(Number(endDate.slice(8, 10))))
    : formatDay(endDate, monthDay);
  return `${formatDay(startDate, monthDay)}–${end}`;
}

export default async function RaceEditionPage({ params }: RaceEditionPageProps) {
  const t = await getDictionary();
  const edition = await loadEdition(params);
  if (!edition) notFound();

  const [photos, videos] = await Promise.all([
    getRaceEditionPhotos(edition.id),
    getRaceEditionVideos(edition.id),
  ]);
  const range = formatRange(
    edition.startDate,
    edition.endDate,
    t.raceSchedule.monthDay,
    t.raceSchedule.dayOnly,
  );
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
        <RaceSeriesTag label={seriesLabel(t, edition.series)} series={edition.series} />
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
          {t.raceEdition.officialSite}
        </a>
      )}

      <hr className="my-8 h-0 border-t-2 border-border" />

      <h2 className="font-heading text-lg font-semibold">{t.raceEdition.photoWall}</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {t.raceEdition.photoWallHint}
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

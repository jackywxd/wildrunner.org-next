import Image from "next/image";

/**
 * What a video looks like in a grid of mostly photos.
 *
 * Extracted from /gallery's own `VideoCard` when the member library needed
 * the same thing. It had been drawing the string "▶ 影片" on a grey box for
 * every video a member owns — so the one screen where somebody chooses a
 * cover frame was the one screen that never showed them a frame. The public
 * wall has drawn the real poster since #114.
 *
 * BOTH HALVES ARE LOAD-BEARING and the fallback is not a leftover. Measured
 * when the card was written: of 27 gallery videos in production, 26 have no
 * `width`/`height` and 27 have no `blurDataURL`; locally it was 22 of 22. A
 * poster exists only for a video the container has run over since posters
 * shipped, so on any database with history there are videos with none, and
 * `scripts/backfill-video-posters.ts` fills them in over time rather than at
 * once.
 *
 * `absolute inset-0`, so the caller owns the box. The two callers size it
 * differently for reasons neither can give up: react-photo-album positions a
 * tile by giving its wrapper a width and leaving height to the content, so
 * the album page needs an explicit `aspectRatio` (a card the layout had sized
 * 445x250 rendered 445x58 without it — the height of a glyph and a line of
 * text), while the member grid is a plain CSS grid with `aspect-video` cells.
 */
export function VideoPosterTile({
  poster,
  label,
  "data-testid": posterTestId,
}: {
  /** `media.posterUrl` — absent until the container has taken a frame. */
  poster?: string | null;
  label: string;
  /** Goes on the poster image, so a spec can assert a real frame is drawn. */
  "data-testid": string;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-hidden bg-neutral-900 text-white/80 transition-colors hover:bg-neutral-800">
      {/*
        Through `next/image` rather than a bare <img>, for the same reason
        every photo in these grids is: the poster is the video's full frame —
        1920x1080 for anything the transcoder has touched — and this tile is a
        few hundred pixels wide. src/lib/image-loader.ts rewrites it to a
        `/cdn-cgi/image/width=…` URL when it is on the R2 CDN, so the browser
        fetches a thumbnail instead of a full frame per video on the page.

        UNDER the glyph rather than replacing it: the tile still has to read as
        a video at a glance, and a bare still frame is indistinguishable from a
        photo in a grid that holds both.
      */}
      {poster && (
        <Image
          src={poster}
          alt=""
          aria-hidden="true"
          fill
          sizes="(max-width: 768px) 100vw, 400px"
          className="object-cover"
          data-testid={posterTestId}
        />
      )}
      <div className="relative flex flex-col items-center gap-2 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
        <PlayGlyph />
        <p className="max-w-[85%] truncate px-2 text-center text-xs">{label}</p>
      </div>
    </div>
  );
}

/**
 * The play glyph, inline rather than from Iconify.
 *
 * `@iconify-icon/react` fetches its icon data from api.iconify.design at
 * runtime, and this repo bundles nothing offline. Everywhere it is used today
 * that is a branch a reader rarely reaches — AlbumCards draws one only for an
 * album with no cover. A tile per video is not that: it would put a
 * third-party request on the first paint of the site's most-visited public
 * page, once per video, for one triangle. It also fails closed in a way that
 * is easy to miss — the console guard caught it here because the sandbox
 * cannot reach that host at all, which is the only reason it was visible.
 */
function PlayGlyph() {
  return (
    <svg
      aria-hidden="true"
      className="h-8 w-8"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.91 11.672a.375.375 0 0 1 0 .656l-5.603 3.113a.375.375 0 0 1-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112Z"
      />
    </svg>
  );
}

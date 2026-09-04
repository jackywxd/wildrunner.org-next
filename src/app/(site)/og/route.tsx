import { ImageResponse } from "next/og";
import { siteConfig } from "@/config/site";
import { resolveBackgroundImage } from "@/lib/ogPhoto";
import { markDataUri } from "@/lib/brand-mark";

/**
 * Share cards, in three treatments that share one layout.
 *
 *   plain    a page with nothing of its own — paper ground, ink type
 *   rainbow  a post with no picture anywhere (src/lib/postOg.ts)
 *   photo    an `image` param, used by gallery video shares
 *
 * The layout is deliberately editorial rather than centred: the lockup sits
 * top-left, the headline is left-aligned and large, and the byline sits
 * under a short accent rule at the bottom. Centred type reads as a title
 * slide; a card is read at ~500px in a feed, at a glance, so it wants one
 * strong left edge to scan down and a headline big enough to survive the
 * downscale.
 */

async function loadFont(request: Request): Promise<ArrayBuffer | null> {
  try {
    // Serve from public/ so the font is available via Workers Assets in production
    // and via Next static files in local `next dev`.
    const fontUrl = new URL("/fonts/Inter-Regular.ttf", request.url);
    const res = await fetch(fontUrl);
    if (!res.ok) {
      console.warn(`OG font fetch failed: ${res.status} ${fontUrl.href}`);
      return null;
    }
    return res.arrayBuffer();
  } catch (error) {
    console.warn("OG font load error:", error);
    return null;
  }
}

/** FNV-1a, the same hash `races/design-tokens.ts` uses, for the same reason. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Headline size, stepped by character count.
 *
 * Counting characters rather than measuring: a Traditional Chinese headline
 * is roughly one em per character, so the count *is* the width, and these
 * cards are overwhelmingly Chinese. The largest step is deliberately huge —
 * the card is downscaled to feed width, and a headline that looks oversized
 * at 1920px is merely readable at 500px.
 */
function titleFontSize(title: string): number {
  if (title.length > 52) return 60;
  if (title.length > 40) return 72;
  if (title.length > 30) return 84;
  if (title.length > 18) return 104;
  if (title.length > 10) return 124;
  return 148;
}

/** Six vivid stops a full wheel apart, rotated so each post differs. */
function rainbowStops(seed: string): string[] {
  const base = hash(seed) % 360;
  return [0, 60, 120, 180, 240, 300].map(
    (offset) => `hsl(${(base + offset) % 360} 88% 58%)`,
  );
}

// OpenNext Cloudflare does not support the Edge runtime; use the default Node/workerd runtime.
export async function GET(request: Request) {
  const url = new URL(request.url);
  let title = url.searchParams.get("title") || siteConfig.title;
  title = decodeURIComponent(title);

  const subtitleParam = url.searchParams.get("subtitle");

  // THE `|` SPLIT IS A FALLBACK NOW, and runs only when the caller did not say
  // what the byline is.
  //
  // It exists because posts once packed `title|author` into one param, and it
  // stays because links already shared out still carry that form — a crawler
  // re-fetches `og:image`, so dropping it would change cards that are out of
  // our hands.
  //
  // But a separator that is also the separator of every browser tab title is a
  // trap, and four routes fell into it: they handed their tab title
  // (「文章 | Posts | 野馬營」) straight to this parameter and got a card signed
  // 「野馬營」. Skipping the split whenever `subtitle` is present is what
  // disarms it — `pageMetadata` always sends one, so nothing we build can be
  // split any more. See src/lib/site-metadata.ts.
  let author = "";
  if (subtitleParam === null) {
    const separator = title.lastIndexOf("|");
    if (separator !== -1) {
      author = title.slice(separator + 1).trim();
      title = title.slice(0, separator).trim();
    }
  }

  const subtitle = subtitleParam
    ? decodeURIComponent(subtitleParam)
    : author || siteConfig.description;

  const fontData = await loadFont(request);
  const backgroundImage = resolveBackgroundImage(url.searchParams.get("image"));

  // Gated on an explicit param rather than on "no image was passed", because
  // every other caller (/, /posts, /riders, /races, /gallery) relies on that
  // case rendering the plain treatment.
  const rainbowSeed =
    url.searchParams.get("variant") === "rainbow"
      ? (url.searchParams.get("seed") ?? title)
      : null;

  const dark = Boolean(backgroundImage) || rainbowSeed !== null;
  const stops = rainbowSeed ? rainbowStops(rainbowSeed) : [];

  // Near-white on near-black is ~15:1, and ink on paper ~14:1. The previous
  // rainbow card put white type straight onto `hsl(… 85% 55%)` behind a 0.30
  // scrim, which lands nearer 2:1 — legible on a 1920px canvas and mush at
  // feed size, which is what the card is actually for.
  const ink = dark ? "#F7F6F4" : "#201E1D";
  const muted = dark ? "rgba(247,246,244,0.66)" : "rgba(32,30,29,0.62)";
  const ground = dark ? "#141317" : "#F3F2F2";

  const fontSize = titleFontSize(title);

  const image = new ImageResponse(
    (
      <div
        tw="flex w-full h-full relative"
        style={{
          background: ground,
          fontFamily: fontData ? "Inter" : "sans-serif",
        }}
      >
        {/* Photo treatment: the picture, then a scrim heavy enough that the
            headline is readable over a bright sky as well as a dark forest. */}
        {backgroundImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- ImageResponse requires img
          <img
            src={backgroundImage}
            alt=""
            width={1920}
            height={1080}
            tw="absolute top-0 left-0 w-full h-full"
            style={{ objectFit: "cover" }}
          />
        ) : null}
        {backgroundImage ? (
          <div
            tw="absolute top-0 left-0 w-full h-full"
            style={{ background: "rgba(15,14,17,0.62)" }}
          />
        ) : null}

        {/* Rainbow treatment, in exactly two layers.

            The spectrum runs HORIZONTALLY across the full card, so every x
            carries exactly one hue and nothing is ever mixed with anything.
            That is the whole reason for this shape. Two earlier attempts used
            soft radial blobs, and both went muddy: overlapping hues composite
            additively toward grey-brown, worst where the hues are far apart
            on the wheel (pink over green reads as olive). Moving the blobs or
            picking adjacent hues only reduced it — with a horizontal sweep it
            cannot happen at all, whatever the seed rotates to.

            It also removes a second defect. Each blob was its own box, and a
            radial gradient that has not reached zero alpha by the box edge
            leaves a hard rectangular seam across the card; the fix for that
            (`closest-side`) then made the corners visibly flat. One
            full-bleed layer has no edges to leak. */}
        {rainbowSeed ? (
          <div
            tw="absolute top-0 left-0 w-full h-full"
            style={{ background: `linear-gradient(100deg, ${stops.join(", ")})` }}
          />
        ) : null}

        {/* The contrast guarantee. A single smooth vertical ramp from a heavy
            tint at the top to *solid* ground by 68%, so the headline always
            sits on ~#141317 — about 15:1 against the type — no matter which
            hue the seed picked. Ending on the flat colour rather than on a
            translucent one is what makes that a guarantee rather than a hope:
            below 68% there is nothing left of the spectrum to bleed through,
            however long the title grows. */}
        {rainbowSeed ? (
          <div
            tw="absolute top-0 left-0 w-full h-full"
            style={{
              background:
                `linear-gradient(180deg, rgba(20,19,23,0.42) 0%,` +
                ` rgba(20,19,23,0.82) 34%, ${ground} 68%)`,
            }}
          />
        ) : null}

        {/* The full-bleed rainbow rule. Crisp, unmissable, and costs the
            headline nothing because it sits above everything. */}
        {rainbowSeed ? (
          <div tw="absolute top-0 left-0 flex w-full" style={{ height: 16 }}>
            {stops.map((stop) => (
              <div key={stop} tw="flex flex-1 h-full" style={{ background: stop }} />
            ))}
          </div>
        ) : null}

        <div
          tw="flex flex-col justify-between relative w-full h-full"
          style={{ padding: "96px 104px 88px" }}
        >
          {/* Lockup. The mark is inlined artwork; the wordmark is live text,
              which the Worker renders correctly — the CJK headline on the
              production card proves a Chinese fallback face is available
              there even though Inter carries no CJK. */}
          <div tw="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse requires img */}
            <img src={markDataUri(dark ? "#F7F6F4" : "#8A3FFA")} alt="" width={72} height={72} />
            <span
              style={{
                color: ink,
                fontSize: 44,
                letterSpacing: "0.06em",
                marginLeft: 20,
              }}
            >
              野馬營
            </span>
          </div>

          <div tw="flex flex-col">
            <div tw="flex" style={{ maxWidth: 1500 }}>
              <span
                style={{
                  color: ink,
                  fontSize,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.14,
                  whiteSpace: "pre-wrap",
                }}
              >
                {title}
              </span>
            </div>

            {/* A short rule tying the byline to the headline. It carries the
                accent colour so the composition has one deliberate spot of
                brand rather than colour smeared everywhere. */}
            <div tw="flex" style={{ marginTop: 44 }}>
              {(rainbowSeed ? stops.slice(0, 4) : ["#8A3FFA"]).map((stop) => (
                <div
                  key={stop}
                  style={{ background: stop, height: 8, width: rainbowSeed ? 42 : 120 }}
                />
              ))}
            </div>

            <div tw="flex" style={{ marginTop: 28 }}>
              <span style={{ color: muted, fontSize: 34, letterSpacing: "0.01em" }}>
                {subtitle}
              </span>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1920,
      height: 1080,
      headers: {
        // Titles change rarely; allow edge/browser reuse for a day, soft-revalidate a week
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
      fonts: fontData
        ? [
            {
              name: "Inter",
              data: fontData,
              style: "normal",
            },
          ]
        : undefined,
    },
  );

  // Buffered rather than returned straight through.
  //
  // `ImageResponse` is a streaming Response and it renders lazily: satori
  // builds an SVG, then a rasteriser turns it into PNG. Anything that throws
  // in there throws *after* the headers are on the wire, so Next logs
  // `failed to pipe response` and the client sees a reset connection — no
  // status, no body, nothing to act on. That is how `/og` presented for this
  // entire investigation: an error whose only description was a rasteriser
  // complaining about an input we could not see, intermittent, and invisible
  // to every guard added upstream of it. Reading the body here moves the
  // failure somewhere it can be caught, named in the log with its cause, and
  // answered with a real HTTP status.
  try {
    const body = await image.arrayBuffer();
    return new Response(body, { headers: image.headers });
  } catch (error) {
    const cause = (error as { cause?: unknown })?.cause;
    console.error(
      `OG render failed: ${error instanceof Error ? error.message : String(error)}` +
        `${cause ? ` | cause: ${cause instanceof Error ? cause.message : String(cause)}` : ""}` +
        `${error instanceof Error && error.stack ? `\n${error.stack}` : ""}`,
    );
    return new Response("OG image unavailable", {
      status: 500,
      headers: { "content-type": "text/plain", "cache-control": "no-store" },
    });
  }
}

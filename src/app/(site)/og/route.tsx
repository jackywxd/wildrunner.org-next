import { ImageResponse } from "next/og";
import { siteConfig } from "@/config/site";

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

function resolveBackgroundImage(imageParam: string | null): string | null {
  if (!imageParam) return null;
  try {
    const imageUrl = decodeURIComponent(imageParam);
    if (!/^https?:\/\//i.test(imageUrl)) return null;
    // ImageResponse fetches remote URLs; avoid inlining large R2 assets as base64.
    return imageUrl;
  } catch {
    return null;
  }
}

function titleFontSize(title: string): string {
  if (title.length > 40) return "4.5rem";
  if (title.length > 24) return "6rem";
  return "8rem";
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
 * The rainbow sweep behind a post that has no picture of its own.
 *
 * Six stops a full colour wheel apart, rotated by a hash of the seed — so
 * every post gets a recognisably different card, and the same post gets the
 * same one forever. That is the same trick badge colour already plays with
 * `hash(event.id) % 360` (races/design-tokens.ts), and it is why the seed is
 * the post *slug*: a retitled post keeps the card it was shared with.
 *
 * `linear-gradient` rather than `conic-gradient`, which would be the obvious
 * choice for a rainbow: all five gradient functions are in Satori's parser
 * set, but only linear and radial appear in its rendering paths (7 and 6
 * references against conic's 1, in next/dist/compiled/@vercel/og), so conic
 * parses and then does not paint.
 */
function rainbowBackground(seed: string): string {
  const base = hash(seed) % 360;
  const stops = [0, 60, 120, 180, 240, 300].map(
    (offset) => `hsl(${(base + offset) % 360} 85% 55%)`,
  );
  return `linear-gradient(135deg, ${stops.join(", ")})`;
}

/**
 * The brand lockup, fetched rather than inlined.
 *
 * It used to be an inline SVG of an older pill-shaped mark that no longer
 * matches the site — SiteLogo has been on /static/brand/ artwork for a while.
 * A PNG rather than the SVG because Satori (what ImageResponse runs on) would
 * have to resolve the wordmark's <text> element, and the font it names is not
 * one of the two we load here.
 *
 * Generated from lockup-horizontal.svg at 2x its intrinsic size, so it stays
 * crisp scaled into the 1200x630 card.
 */
function brandLockupUrl(request: Request) {
  return new URL('/static/brand/lockup-horizontal.png', request.url).href;
}

// OpenNext Cloudflare does not support the Edge runtime; use the default Node/workerd runtime.
export async function GET(request: Request) {
  const url = new URL(request.url);
  let title = url.searchParams.get("title") || siteConfig.title;
  title = decodeURIComponent(title);

  // Posts pass `title|author` in a single param, so the separator and the
  // author were being painted into the headline — and a post with no author
  // got a dangling "|". Split it back out; the author reads as a subtitle,
  // which is what the caller meant.
  let author = "";
  const separator = title.lastIndexOf("|");
  if (separator !== -1) {
    author = title.slice(separator + 1).trim();
    title = title.slice(0, separator).trim();
  }

  const subtitleParam = url.searchParams.get("subtitle");
  const subtitle = subtitleParam
    ? decodeURIComponent(subtitleParam)
    : author || siteConfig.description;

  const fontData = await loadFont(request);
  const backgroundImage = resolveBackgroundImage(
    url.searchParams.get("image")
  );

  // The generated card for a post with no picture anywhere — see
  // `resolvePostOgImage` in src/lib/postOg.ts for when it is reached. Gated
  // on an explicit param rather than on "no image was passed", because every
  // other caller (/, /posts, /riders, /races, /gallery) already relies on
  // that case rendering the plain card.
  const rainbowSeed =
    url.searchParams.get("variant") === "rainbow"
      ? (url.searchParams.get("seed") ?? title)
      : null;
  const onDarkGround = Boolean(backgroundImage) || rainbowSeed !== null;

  const fontSize = titleFontSize(title);

  const subtitleText = (
    <span
      style={{
        fontSize: "2.5rem",
        lineHeight: "4.5rem",
        whiteSpace: "pre-wrap",
        textWrap: "balance",
      }}
    >
      {subtitle}
    </span>
  );

  const image = new ImageResponse(
    (
      <div
        tw="flex flex-col p-12 w-full h-full rounded-none relative overflow-hidden"
        style={{
          background: rainbowSeed
            ? rainbowBackground(rainbowSeed)
            : backgroundImage
              ? "#201E1D"
              : "#F3F2F2",
        }}
      >
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
        {/* A lighter scrim over the rainbow than over a photograph: the
            gradient is the point of that card, and 0.55 mutes it to grey,
            while white text still reads comfortably at 0.3. */}
        {onDarkGround ? (
          <div
            tw="absolute top-0 left-0 w-full h-full"
            style={{
              background: rainbowSeed
                ? "rgba(32, 30, 29, 0.30)"
                : "rgba(32, 30, 29, 0.55)",
            }}
          />
        ) : null}
        <div
          tw="flex flex-col flex-1 w-full h-full relative"
          style={{
            fontFamily: fontData ? "Inter" : "sans-serif",
            fontStyle: "normal",
            color: onDarkGround ? "#F3F2F2" : "#201E1D",
          }}
        >
          <div tw="flex flex-col flex-1 justify-between">
            {/* The rainbow card carries the lockup bottom-right instead, so
                the top slot stays empty rather than showing it twice. */}
            <div tw="flex p-4">
              {rainbowSeed ? null : (
                // eslint-disable-next-line @next/next/no-img-element -- ImageResponse requires img
                <img
                  src={brandLockupUrl(request)}
                  alt=""
                  width={560}
                  height={120}
                />
              )}
            </div>
            <div tw="flex w-full px-4">
              <div tw="flex justify-center w-full">
                <span
                  style={{
                    fontSize,
                    lineHeight: fontSize,
                    letterSpacing: "-0.05em",
                    whiteSpace: "pre-wrap",
                    textWrap: "balance",
                    textAlign: "center",
                  }}
                >
                  {title}
                </span>
              </div>
            </div>
            {rainbowSeed ? (
              <div tw="flex w-full items-end justify-between px-8 py-4">
                {subtitleText}
                {/* On a light plate, not bare: the lockup's wordmark is ink
                    (#201E1D) and its mark tile is purple, so dropped
                    straight onto a saturated gradient it reads as a smudge
                    at thumbnail size. */}
                <div
                  tw="flex rounded-2xl"
                  style={{ background: "#F3F2F2", padding: "18px 28px" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse requires img */}
                  <img
                    src={brandLockupUrl(request)}
                    alt=""
                    width={420}
                    height={90}
                  />
                </div>
              </div>
            ) : (
              <div tw="flex px-8 py-4">{subtitleText}</div>
            )}
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
    }
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

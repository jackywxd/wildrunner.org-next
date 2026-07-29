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

  const fontSize = titleFontSize(title);

  return new ImageResponse(
    (
      <div
        tw="flex flex-col p-12 w-full h-full rounded-none relative overflow-hidden"
        style={{
          background: backgroundImage
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
        {backgroundImage ? (
          <div
            tw="absolute top-0 left-0 w-full h-full"
            style={{ background: "rgba(32, 30, 29, 0.55)" }}
          />
        ) : null}
        <div
          tw="flex flex-col flex-1 w-full h-full relative"
          style={{
            fontFamily: fontData ? "Inter" : "sans-serif",
            fontStyle: "normal",
            color: backgroundImage ? "#F3F2F2" : "#201E1D",
          }}
        >
          <div tw="flex flex-col flex-1 justify-between">
            <div tw="flex p-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse requires img */}
              <img
                src={brandLockupUrl(request)}
                alt=""
                width={560}
                height={120}
              />
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
            <div tw="flex px-8 py-4">
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
    }
  );
}

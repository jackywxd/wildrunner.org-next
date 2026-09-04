import { markDataUri } from "@/lib/brand-mark";
import {
  loadPosterFont,
  renderPoster,
  resolvePosterSubject,
  type PosterSubject,
} from "@/lib/share/poster";

/**
 * The 小紅書 poster: 1080×1440, and deliberately carrying no way back here.
 *
 * NO URL, NO QR CODE, NO CONTACT — and that is compliance, not minimalism.
 * Xiaohongshu suppresses off-site traffic, and its checks include text that
 * OCR finds *inside the image*. A poster with our address on it is a poster
 * that costs the person who posted it reach, or their account.
 *
 * So the brand travels as a **name**. 「野馬營」 and the member's byline are
 * words, not links, and words are not suppressed. That inversion — stop asking
 * the platform to render a card, hand people a picture that already is one —
 * is the entire strategy, borrowed from jackywu.ca where it is already live.
 *
 * 3:4 with 8% clear at top and bottom: that is the crop the feed applies, and
 * anything inside those bands can be cut without warning.
 */
export const dynamic = "force-dynamic";

const SAFE = Math.round(1440 * 0.08);

function Poster({ subject }: { subject: PosterSubject }) {
  const badge = subject.badge;

  return (
    <div
      style={{
        width: 1080,
        height: 1440,
        display: "flex",
        flexDirection: "column",
        background: "#F3F2F2",
        color: "#201E1D",
        padding: `${SAFE}px 88px`,
        fontFamily: "Inter",
      }}
    >
      {/* The lockup, mark and all. The first version of this poster carried
          only the words 「野馬營」 — which is the same absence this site has
          already shipped once, when the card's logo was an LFS pointer satori
          could not decode (see `markDataUri`). Drawn from the shared paths so
          the poster, the share card and the site header cannot drift apart. */}
      <div style={{ display: "flex", alignItems: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse requires img */}
        <img src={markDataUri("#8A3FFA")} alt="" width={56} height={56} />
        <span style={{ marginLeft: 18, fontSize: 34, letterSpacing: "0.18em", opacity: 0.7 }}>
          野馬營
        </span>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: "auto",
          marginBottom: "auto",
          alignItems: "flex-start",
        }}
      >
        {badge ? (
          // The badge redrawn from its own token — see `PosterBadge` for why it
          // is divs rather than the real SVG component.
          <div style={{ display: "flex", flexDirection: "column", marginBottom: 56 }}>
            <div
              style={{
                display: "flex",
                width: 260,
                height: 200,
                alignItems: "center",
                justifyContent: "center",
                background: badge.primary,
                color: badge.ink,
                fontSize: 82,
                fontWeight: 800,
              }}
            >
              {badge.abbr}
            </div>
            <div
              style={{
                display: "flex",
                width: 260,
                height: 64,
                alignItems: "center",
                justifyContent: "center",
                background: badge.secondary,
                color: badge.ink,
                fontSize: 30,
                letterSpacing: "0.08em",
              }}
            >
              {badge.band}
            </div>
          </div>
        ) : subject.photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- ImageResponse requires img
          <img
            src={subject.photo}
            alt=""
            width={904}
            height={560}
            style={{ objectFit: "cover", marginBottom: 56 }}
          />
        ) : null}

        <div style={{ display: "flex", fontSize: 82, fontWeight: 800, lineHeight: 1.2 }}>
          {subject.title}
        </div>

        {subject.facts.length > 0 && (
          <div style={{ display: "flex", marginTop: 28, fontSize: 38, opacity: 0.7 }}>
            {subject.facts.join(" · ")}
          </div>
        )}
      </div>

      {/* The signature. A name, and the only thing on this poster that says
          where it came from. */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {/* A short accent rule over the byline, the same device `/og` signs
            its cards with. The plain purple square that used to sit here was
            standing in for a seal and read as a missing image. */}
        <div style={{ display: "flex", width: 96, height: 6, background: "#8A3FFA" }} />
        <span style={{ marginTop: 22, fontSize: 44, fontWeight: 700 }}>
          {subject.byline ?? "野馬營"}
        </span>
      </div>
    </div>
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  const subject = await resolvePosterSubject(slug);
  if (!subject) return new Response("Not found", { status: 404 });

  return renderPoster(<Poster subject={subject} />, {
    width: 1080,
    height: 1440,
    font: await loadPosterFont(request),
  });
}

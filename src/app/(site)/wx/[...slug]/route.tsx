import {
  loadPosterFont,
  renderPoster,
  resolvePosterSubject,
  type PosterSubject,
} from "@/lib/share/poster";

/**
 * The picture WeChat picks for an in-app share.
 *
 * 600×600, AND IT IS NOT AN `og:image`. WeChat does not read `og:*` for shares
 * made inside the app: it takes the `<title>` and the **first `<img>` in DOM
 * order whose rendered box is at least 300×300**. So the way to control that
 * thumbnail is to put a real, really-loaded image at the top of `<body>` —
 * which is what `WeChatThumb` does, and what this endpoint feeds it.
 *
 * 600 rather than 300 because WeChat downscales again on its side; the label
 * has to survive being read at about 200px, so the type here is set very
 * large and there is very little of it.
 *
 * PNG, not JPEG. WeChat accepts either, and `ImageResponse` only emits PNG —
 * so the reference site's "JPEG or PNG, never WebP" rule is satisfied by the
 * format we already have rather than by adding an encoder.
 */
export const dynamic = "force-dynamic";

function Square({ subject }: { subject: PosterSubject }) {
  const badge = subject.badge;
  const ground = badge?.primary ?? "#F3F2F2";
  const ink = badge ? badge.ink : "#201E1D";

  return (
    <div
      style={{
        width: 600,
        height: 600,
        display: "flex",
        flexDirection: "column",
        background: ground,
        padding: 48,
        color: ink,
        fontFamily: "Inter",
      }}
    >
      {badge ? (
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              width: 96,
              height: 96,
              alignItems: "center",
              justifyContent: "center",
              background: badge.secondary,
              color: badge.ink,
              fontSize: 34,
              fontWeight: 800,
            }}
          >
            {badge.abbr}
          </div>
          <span style={{ marginLeft: 20, fontSize: 40, opacity: 0.85 }}>{badge.band}</span>
        </div>
      ) : (
        <span style={{ fontSize: 30, letterSpacing: "0.14em", opacity: 0.6 }}>野馬營</span>
      )}

      {/* The title is the whole point of this square: it is what a reader sees
          at ~200px in a chat. Two lines at most, very large. */}
      <div
        style={{
          display: "flex",
          marginTop: "auto",
          fontSize: subject.title.length > 14 ? 60 : 76,
          fontWeight: 800,
          lineHeight: 1.15,
        }}
      >
        {subject.title}
      </div>

      <div style={{ display: "flex", marginTop: 24, fontSize: 28, opacity: 0.75 }}>
        {[subject.byline, ...subject.facts].filter(Boolean).slice(0, 2).join(" · ")}
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
  // 404 rather than a generic square: a thumbnail of nothing would be picked
  // by WeChat just as happily as a real one.
  if (!subject) return new Response("Not found", { status: 404 });

  return renderPoster(<Square subject={subject} />, {
    width: 600,
    height: 600,
    font: await loadPosterFont(request),
  });
}

/**
 * Recognising a YouTube video link.
 *
 * Parsing to an id and rebuilding the embed URL, rather than passing the
 * author's URL through to an <iframe src>: the src of a third-party frame
 * is the one place a stray string in `posts.content` would become an
 * arbitrary embedded origin on our own page. Everything here either
 * produces an 11-character id or nothing.
 */

/** YouTube's video id alphabet, and always exactly 11 characters. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

const HOSTS = new Set([
  "youtu.be",
  "www.youtu.be",
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

/**
 * The video id in a YouTube URL, or null for anything else.
 *
 * Covers the four shapes a member is likely to paste — the watch page, a
 * youtu.be share link, an /embed/ URL copied from someone else's page, and
 * a Short. A playlist or channel URL has no single video and returns null,
 * so it stays an ordinary link rather than silently embedding whatever
 * video happens to be first.
 */
export function youTubeVideoId(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  // http is accepted because people paste it; the embed we build is always
  // https regardless.
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!HOSTS.has(url.hostname.toLowerCase())) return null;

  const segments = url.pathname.split("/").filter(Boolean);

  // youtu.be/<id>
  if (url.hostname.toLowerCase().endsWith("youtu.be")) {
    return VIDEO_ID.test(segments[0] ?? "") ? segments[0] : null;
  }

  // youtube.com/watch?v=<id>
  if (segments[0] === "watch") {
    const id = url.searchParams.get("v") ?? "";
    return VIDEO_ID.test(id) ? id : null;
  }

  // youtube.com/embed/<id>, /shorts/<id>, /live/<id>
  if (
    segments.length === 2 &&
    (segments[0] === "embed" ||
      segments[0] === "shorts" ||
      segments[0] === "live")
  ) {
    return VIDEO_ID.test(segments[1]) ? segments[1] : null;
  }

  return null;
}

/**
 * The player URL for an id.
 *
 * `youtube-nocookie.com` rather than `youtube.com`: the ordinary player
 * writes tracking cookies for every visitor who merely loads a page
 * containing it, before anyone presses play. This site shows no cookie
 * banner, so the quieter host is the honest default.
 */
export function youTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}

/**
 * The single YouTube URL a paragraph consists of, or null.
 *
 * A second concern from the URL parsing above — this one walks a Lexical
 * paragraph rather than a string — but it lives here so that the article
 * renderer and the member's preview share one rule. They did not: the public
 * page embedded, the preview showed the raw text, and a member had no way to
 * tell what publishing would do until they published.
 *
 * This is the case that actually matters for members: the editor has no
 * autolink, so a pasted URL stays plain text rather than becoming a `link`
 * node. Deliberately strict — the paragraph must be nothing but the URL, so
 * a sentence that happens to mention a video keeps its sentence.
 *
 * Typed structurally rather than against Lexical's own node types: both
 * renderers already carry their own local `JsonNode` shape, and importing an
 * editor type into either of them would drag the editor bundle with it.
 */
export function soleYouTubeUrl(node: {
  children?: { type?: string; text?: unknown }[];
}): string | null {
  const children = node.children ?? [];
  // A non-text child contributes a space, so one sitting *between* text nodes
  // leaves whitespace the test below catches, rather than having its content
  // silently dropped.
  const text = children
    .map((child) => (child.type === "text" ? String(child.text ?? "") : " "))
    .join("")
    .trim();
  // Any whitespace left after trimming means the paragraph holds something
  // besides the URL - a sentence mentioning a video keeps its sentence.
  //
  // Measured, because the wording here used to claim more than the code does:
  // `trim()` also eats the space a LEADING or TRAILING non-text child
  // contributed, so a paragraph of "<url><br>" still embeds. That is the
  // common shape — paste a URL, press shift+enter — and embedding it is the
  // wanted answer, so the behaviour stands and this note records its edge:
  // a trailing `link` node's text would go with it. Since the member's
  // preview now renders this rule too, that case is at least visible before
  // publishing rather than a surprise afterwards.
  if (!text || /\s/.test(text)) return null;
  return youTubeVideoId(text);
}

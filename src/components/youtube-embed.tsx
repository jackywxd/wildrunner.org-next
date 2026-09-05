import { youTubeEmbedUrl } from "@/lib/youtube";

/**
 * A YouTube link, shown as the video.
 *
 * `youtube-nocookie.com` and a rebuilt URL — see src/lib/youtube.ts for why
 * the author's own string never reaches the iframe. `loading="lazy"` keeps
 * a post with several videos from opening several player connections before
 * the reader has scrolled to any of them.
 *
 * The wrapper is a `<span class="block">`, not a `<div>`, because the `link`
 * and `autolink` converters substitute this for an *inline* node — one that
 * sits inside the paragraph Lexical wrapped it in. A `<div>` there is a div
 * inside a `<p>`, which the parser closes the paragraph to escape: the
 * server's HTML and the client's tree then disagree and hydration fails for
 * the whole page. `<span>` is phrasing content, so it is legal in both
 * positions, and `block` restores the layout the `<div>` had.
 *
 * Deliberately NOT `"use client"`: it is pure markup with no hooks and no
 * event handlers, and it has to be usable from both the public article
 * renderer (a server component) and the member's preview (a client one).
 * Those two used to disagree about YouTube entirely — the public page
 * embedded, the preview showed a bare link — which is the drift
 * ContentPreview's own header warns about.
 */
/**
 * `title` IS A REQUIRED PROP RATHER THAN A DICTIONARY READ. This renders in
 * three worlds and no single accessor reaches all of them: the public article
 * (Server Component, inside the provider), `/print/posts/...` (Server
 * Component under a *different* root layout, with no provider at all), and
 * the member editor's preview (Client Component, also outside it). A hook
 * throws in two of those and `getDictionary()` cannot be awaited inside
 * Lexical's synchronous converters. Having each caller say the word is the
 * only shape that is correct everywhere — and with no default, a new call
 * site cannot forget to.
 */
export function YouTubeEmbed({
  title,
  videoId,
}: {
  title: string;
  videoId: string;
}) {
  return (
    <span
      data-testid="youtube-embed"
      data-video-id={videoId}
      className="my-6 block aspect-video w-full"
    >
      <iframe
        src={youTubeEmbedUrl(videoId)}
        title={title}
        loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="h-full w-full border-0"
      />
    </span>
  );
}

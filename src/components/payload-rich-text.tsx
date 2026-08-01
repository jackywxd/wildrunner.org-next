import Image from "next/image";
import type { ReactNode } from "react";

import type { Media, Post } from "@/payload-types";
import { mediaImageSrc } from "@/lib/cf-image";
import { youTubeEmbedUrl, youTubeVideoId } from "@/lib/youtube";
import {
  RichText,
  type JSXConvertersFunction,
} from "@payloadcms/richtext-lexical/react";

type JsonNode = {
  type: string;
  children?: JsonNode[];
  [key: string]: unknown;
};

/**
 * Hand back to the converter we are overriding.
 *
 * A JSXConverter entry is allowed to be a plain node as well as a function,
 * so it cannot simply be called — and the three overrides below only want
 * to intercept YouTube links, not to reimplement paragraphs and anchors.
 */
function orDefault<Args>(
  converter: ((args: Args) => ReactNode) | ReactNode | undefined,
  args: Args,
): ReactNode {
  return typeof converter === "function"
    ? (converter as (a: Args) => ReactNode)(args)
    : ((converter as ReactNode) ?? null);
}

/**
 * A YouTube link, shown as the video.
 *
 * `youtube-nocookie.com` and a rebuilt URL — see src/lib/youtube.ts for why
 * the author's own string never reaches the iframe. `loading="lazy"` keeps
 * a post with several videos from opening several player connections before
 * the reader has scrolled to any of them.
 */
function YouTubeEmbed({ videoId }: { videoId: string }) {
  return (
    <div
      data-testid="youtube-embed"
      data-video-id={videoId}
      className="my-6 aspect-video w-full"
    >
      <iframe
        src={youTubeEmbedUrl(videoId)}
        title="YouTube 影片"
        loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="h-full w-full border-0"
      />
    </div>
  );
}

/**
 * The single YouTube URL a paragraph consists of, or null.
 *
 * This is the case that actually matters for members: the editor has no
 * autolink, so a pasted URL stays plain text rather than becoming a `link`
 * node. Deliberately strict — the paragraph must be nothing but the URL, so
 * a sentence that happens to mention a video keeps its sentence.
 */
function soleYouTubeUrl(node: JsonNode): string | null {
  const children = node.children ?? [];
  // A non-text child contributes a space, so a paragraph holding the URL
  // *and* an image or a line break fails the whitespace test below rather
  // than having its other content silently dropped.
  const text = children
    .map((child) => (child.type === "text" ? String(child.text ?? "") : " "))
    .join("")
    .trim();
  // Any whitespace left after trimming means the paragraph holds something
  // besides the URL - a sentence mentioning a video keeps its sentence.
  if (!text || /\s/.test(text)) return null;
  return youTubeVideoId(text);
}

/**
 * Renders inline images through next/image instead of the default
 * converter's plain <img>.
 *
 * The default emits the R2 URL directly, which skips the IMAGES binding
 * entirely — no resizing, no AVIF/WebP negotiation, and the browser pulls
 * the full-size original (these are 1024px+ webp files). Gallery images
 * already went through next/image; only rich-text bodies were bypassing it.
 */
const converters: JSXConvertersFunction = ({ defaultConverters }) => ({
  ...defaultConverters,

  /**
   * A paragraph that is nothing but a YouTube URL becomes the video.
   *
   * Anything else falls straight through to the default converter rather
   * than being reimplemented here — the default has a `<p><br></p>` case
   * for empty paragraphs that is easy to forget and annoying to rediscover.
   */
  paragraph: (args) => {
    const videoId = soleYouTubeUrl(args.node as unknown as JsonNode);
    if (videoId) return <YouTubeEmbed videoId={videoId} />;
    return orDefault(defaultConverters.paragraph, args);
  },

  /**
   * And a real `link` node pointing at one, which is what a post written in
   * /admin has (its editor autolinks a pasted URL).
   */
  link: (args) => {
    const url = (args.node as { fields?: { url?: string } }).fields?.url;
    const videoId = url ? youTubeVideoId(url) : null;
    if (videoId) return <YouTubeEmbed videoId={videoId} />;
    return orDefault(defaultConverters.link, args);
  },
  autolink: (args) => {
    const url = (args.node as { fields?: { url?: string } }).fields?.url;
    const videoId = url ? youTubeVideoId(url) : null;
    if (videoId) return <YouTubeEmbed videoId={videoId} />;
    return orDefault(defaultConverters.autolink, args);
  },

  /**
   * Table cells, with the design system's border instead of the default
   * converter's hard-coded `border: 1px solid #ccc`.
   *
   * That literal is the same grey in both themes: against the dark
   * background it is a near-invisible line, so a table read as a floating
   * grid of text with no structure. Everything else about the default is
   * kept — the `th`/`td` choice from `headerState`, the colSpan/rowSpan
   * handling, and the author's own cell background colour when they set one.
   */
  tablecell: ({ node, nodesToJSX }) => {
    const cell = node as unknown as {
      backgroundColor?: string | null;
      colSpan?: number;
      headerState?: number;
      rowSpan?: number;
    };
    const Tag = (cell.headerState ?? 0) > 0 ? "th" : "td";
    return (
      <Tag
        className="border border-border px-3 py-2 align-top"
        colSpan={cell.colSpan && cell.colSpan > 1 ? cell.colSpan : undefined}
        rowSpan={cell.rowSpan && cell.rowSpan > 1 ? cell.rowSpan : undefined}
        style={{ backgroundColor: cell.backgroundColor || undefined }}
      >
        {nodesToJSX({ nodes: node.children })}
      </Tag>
    );
  },
  upload: ({ node }) => {
    const value = node.value as Media | number | null | undefined;
    if (!value || typeof value !== "object" || !value.url) return null;

    const alt = value.alt ?? "";
    // Dimensions come from the migration (Velite resolved them) or from
    // Payload's own upload handling; fall back to a 3:2 box rather than
    // omitting them, since next/image requires both.
    const width = value.width ?? 1200;
    const height = value.height ?? 800;

    // Through mediaImageSrc, not value.url: media uploaded outside
    // production keeps Payload's own absolute
    // `<serverURL>/api/media/file/<name>` URL, and next/image rejects an
    // absolute URL whose host isn't in images.remotePatterns — "localhost"
    // never will be. Migrated media (images.wildrunner.org) is unaffected,
    // which is why this only began failing once posts could carry images
    // uploaded from the member editor.
    const src = mediaImageSrc(value);
    if (!src) return null;

    return (
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes="(min-width: 768px) 768px, 100vw"
        className="h-auto w-full rounded-lg"
        placeholder={value.blurDataURL ? "blur" : undefined}
        blurDataURL={value.blurDataURL ?? undefined}
      />
    );
  },
});

type PayloadRichTextProps = {
  data: Post["content"];
  className?: string;
};

export function PayloadRichText({ data, className }: PayloadRichTextProps) {
  return (
    <div className={className}>
      <RichText data={data} converters={converters} />
    </div>
  );
}

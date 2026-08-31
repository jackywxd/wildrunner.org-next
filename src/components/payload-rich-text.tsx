import Image from "next/image";
import type { ReactNode } from "react";

import type { Media, Post } from "@/payload-types";
import { mediaImageSrc } from "@/lib/cf-image";
import { soleYouTubeUrl, youTubeVideoId } from "@/lib/youtube";
import { YouTubeEmbed } from "@/components/youtube-embed";
import { StreamVideoPlayer } from "@/components/stream-video-player";
import { mediaToSiteVideo } from "@/lib/media/site-video";
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
  /**
   * An uploaded file. Images through next/image; videos through the same
   * player the gallery uses.
   *
   * The video branch is new, and its absence was silent rather than loud: a
   * video upload node used to fall through to `<Image>` and become an
   * `<img src="….mp4">`. With `images.loader: "custom"` (next.config.ts) the
   * request never reaches `/_next/image`, so it answers 200 `video/mp4` and
   * the browser simply fails to decode it — Chromium logs nothing for that,
   * so the page held a blank 3:2 box that no assertion and no console guard
   * in this repo could see.
   *
   * Safe to return a block element here *because* Payload's
   * `UploadServerNode.isInline()` is `false` — an upload is never a child of
   * a paragraph. That is not true of `YouTubeEmbed` above, which the `link`
   * and `autolink` converters substitute for an inline node, and which is a
   * `<span class="block">` for exactly that reason. So do not reuse
   * `StreamVideoPlayer` from those three converters: its transcoding branch
   * returns a `<div>`, and a `<div>` inside a `<p>` breaks hydration for the
   * whole page.
   *
   * No `refreshStreamReady` call, unlike the video share page: that is a
   * write, and an article can hold several videos. The gallery's own video
   * strip does not do it either.
   */
  upload: ({ node }) => {
    const value = node.value as Media | number | null | undefined;
    if (!value || typeof value !== "object" || !value.url) return null;

    if (value.mimeType?.startsWith("video/")) {
      const video = mediaToSiteVideo(value);
      return video ? <StreamVideoPlayer video={video} /> : null;
    }

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

  /**
   * `Code` blocks (`BlocksFeature({ blocks: [CodeBlock()] })` in
   * `payload.config.ts`), which `defaultConverters` has no entry for at
   * all — verified against
   * `node_modules/@payloadcms/richtext-lexical/dist/features/converters/
   * lexicalToJsx/converter/defaultConverters.js`. Without this, the
   * dispatcher (`converter/index.js`) logs a `console.error` and renders
   * the literal text "unknown node" for any post containing one. No
   * migrated post ever exercised this — 0 of 15 in `.velite/posts.json`
   * contain a fenced code block — which is why it went unnoticed until the
   * MDX importer (`@/lib/mdx-import`) made a code block reachable through
   * the member editor for the first time.
   */
  blocks: {
    Code: ({ node }: { node: { fields?: { code?: string; language?: string } } }) => {
      const fields = node.fields ?? {};
      if (!fields.code) return null;
      return (
        <pre className="overflow-x-auto rounded-lg bg-secondary p-4 text-sm">
          <code
            className={fields.language ? `language-${fields.language}` : undefined}
          >
            {fields.code}
          </code>
        </pre>
      );
    },
    /**
     * Raw HTML/SVG a member embedded via the MDX importer
     * (`src/lib/mdx-import/html-embed.ts`), already sanitized at import
     * time — see that file's header for exactly what it allows and why.
     * This converter trusts that sanitization and does not repeat it; the
     * only writer of this field is the importer.
     */
    HtmlEmbed: ({ node }: { node: { fields?: { html?: string } } }) => {
      const html = node.fields?.html;
      if (!html) return null;
      return <div dangerouslySetInnerHTML={{ __html: html }} />;
    },
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

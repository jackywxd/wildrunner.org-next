"use client";

import type { ReactNode } from "react";
import { mediaImageSrc } from "@/lib/cf-image";
import { useMediaById } from "@/lib/members/use-media";
import { mediaToSiteVideo } from "@/lib/media/site-video";
import { StreamVideoPlayer } from "@/components/stream-video-player";
import { YouTubeEmbed } from "@/components/youtube-embed";
import { soleYouTubeUrl, youTubeVideoId } from "@/lib/youtube";
import type { PayloadContent } from "@/lib/editor/serialize";

type JsonNode = {
  type: string;
  children?: JsonNode[];
  [key: string]: unknown;
};

const FORMAT_BOLD = 1;
const FORMAT_ITALIC = 2;
const FORMAT_STRIKETHROUGH = 4;
const FORMAT_CODE = 16;

/**
 * A read-only render of a member's document, used by the import flow to ask
 * "does this look like your document" and by the editor's preview button to
 * ask "is this what it will look like published".
 *
 * Deliberately not `PayloadRichText` (`@/components/payload-rich-text`):
 * that component's converters have no `blocks` entry, so the `Code` node
 * the importer can produce would hit its `console.error` + "unknown node"
 * fallback in the member's own browser — which would fail the e2e console
 * guard in `e2e/helpers/test.ts` — and it would drag `next/image` and the
 * public converter set into a route that only previews.
 *
 * Started life as `ImportPreview` under posts/. It moved here when the
 * editor needed the same thing, rather than growing a second renderer that
 * would drift from this one: two previews of the same document disagreeing
 * about how it looks is worse than either being imperfect.
 *
 * It emits bare tags and hangs no typography on them. Everything below is
 * styled by `.article-body` in src/styles/globals.css — the same rules the
 * published page uses — because a preview whose job is "is this what it will
 * look like published" has to be styled by the thing that styles the
 * published page, not by a second opinion. Its own classes were that second
 * opinion: headings came out bold but at body size, which is exactly the
 * defect M-TYPO was written from.
 */
function renderText(node: JsonNode, key: number): ReactNode {
  const format = typeof node.format === "number" ? node.format : 0;
  let content: ReactNode = String(node.text ?? "");
  if (format & FORMAT_CODE) content = <code>{content}</code>;
  if (format & FORMAT_STRIKETHROUGH) content = <s>{content}</s>;
  if (format & FORMAT_ITALIC) content = <em>{content}</em>;
  if (format & FORMAT_BOLD) content = <strong>{content}</strong>;
  return <span key={key}>{content}</span>;
}

function renderInline(nodes: JsonNode[] | undefined): ReactNode {
  return (nodes ?? []).map((node, index) => {
    switch (node.type) {
      case "text":
        return renderText(node, index);
      case "linebreak":
        return <br key={index} />;
      // `autolink` alongside `link` because the published page treats them
      // identically and this function's `default` returned null for it — so
      // an autolinked URL rendered as *nothing at all* in the preview, which
      // was a silent drop quite apart from the YouTube case.
      case "link":
      case "autolink": {
        const fields = node.fields as { url?: string } | undefined;
        const videoId = fields?.url ? youTubeVideoId(fields.url) : null;
        if (videoId) return <YouTubeEmbed key={index} videoId={videoId} />;
        return (
          <a key={index} href={fields?.url ?? "#"}>
            {renderInline(node.children)}
          </a>
        );
      }
      default:
        return null;
    }
  });
}

/**
 * An `upload` node holds a bare media id, so the picture has to be fetched.
 *
 * A component rather than inline markup because that fetch is a hook, and a
 * hook cannot live inside the `switch` of a plain render function.
 *
 * Plain `<img>`, not `next/image`: this is the same reason the header gives
 * for not reusing the public renderer, and the preview is transient — it is
 * not worth a second image pipeline with its own layout rules to show a
 * member what they already have on screen in the editor beside it.
 */
function PreviewUpload({ value }: { value: number | string }) {
  const media = useMediaById(value);
  const src = media ? mediaImageSrc(media) : "";

  if (!src) {
    return (
      <span className="block border border-dashed border-border px-3 py-6 text-center text-xs text-foreground/40">
        圖片載入中…
      </span>
    );
  }

  // `compact`, unlike the published page. This preview re-renders on every
  // keystroke (M-PREVIEW-T1 asserts exactly that), so `preload="metadata"`
  // here would open a media request per edit; `compact` is `preload="none"`
  // and `loading="lazy"`.
  if (media?.mimeType?.startsWith("video/")) {
    const video = mediaToSiteVideo(media);
    if (video) return <StreamVideoPlayer video={video} compact />;
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={media?.alt ?? ""} className="h-auto max-w-full" />;
}

function renderBlocks(nodes: JsonNode[] | undefined): ReactNode {
  return (nodes ?? []).map((node, index) => {
    switch (node.type) {
      case "heading": {
        const tag = node.tag as string | undefined;
        const Tag = (tag && /^h[1-6]$/.test(tag) ? tag : "h2") as
          | "h1"
          | "h2"
          | "h3"
          | "h4"
          | "h5"
          | "h6";
        return (
          <Tag key={index}>{renderInline(node.children)}</Tag>
        );
      }
      case "paragraph": {
        // The same rule the published page applies, from the same function —
        // this preview's whole job is "is this what it will look like
        // published", and it used to answer wrongly for a pasted YouTube URL.
        const videoId = soleYouTubeUrl(node);
        if (videoId) return <YouTubeEmbed key={index} videoId={videoId} />;
        return <p key={index}>{renderInline(node.children)}</p>;
      }
      case "quote":
        return (
          <blockquote key={index}>{renderInline(node.children)}</blockquote>
        );
      case "horizontalrule":
        return <hr key={index} />;
      case "list": {
        const Tag = node.listType === "number" ? "ol" : "ul";
        return (
          <Tag key={index}>{renderBlocks(node.children)}</Tag>
        );
      }
      case "listitem":
        return (
          <li key={index}>
            {node.checked !== undefined && (
              <input type="checkbox" checked={Boolean(node.checked)} readOnly className="mr-1" />
            )}
            {node.children?.some((child) => child.type === "list")
              ? renderInline(node.children?.filter((child) => child.type !== "list"))
              : renderInline(node.children)}
            {node.children?.filter((child) => child.type === "list").map((list, i) => (
              <div key={i}>{renderBlocks([list])}</div>
            ))}
          </li>
        );
      case "table":
        return (
          <table key={index} className="text-left">
            <tbody>{renderBlocks(node.children)}</tbody>
          </table>
        );
      case "tablerow":
        return <tr key={index}>{renderBlocks(node.children)}</tr>;
      case "tablecell": {
        const Cell = node.headerState ? "th" : "td";
        return (
          <Cell key={index}>{renderBlocks(node.children)}</Cell>
        );
      }
      case "upload": {
        const value = node.value;
        // Only a bare id is renderable. At depth >= 1 Payload would have
        // replaced it with the whole Media object, which never reaches here
        // — `loadPost` reads at depth 0 — but a populated value must fall
        // through to nothing rather than render `[object Object]`.
        if (typeof value !== "number" && typeof value !== "string") return null;
        return <PreviewUpload key={index} value={value} />;
      }
      case "block": {
        const fields = node.fields as
          | { blockType?: string; code?: string; html?: string; language?: string }
          | undefined;
        if (fields?.blockType === "Code") {
          return (
            <pre key={index}>
              <code className={fields.language ? `language-${fields.language}` : undefined}>
                {fields.code}
              </code>
            </pre>
          );
        }
        if (fields?.blockType === "HtmlEmbed" && fields.html) {
          // Already sanitized by `src/lib/mdx-import/html-embed.ts` at
          // import time — this preview and the public page
          // (`payload-rich-text.tsx`) both trust that, neither re-sanitizes.
          return <div key={index} dangerouslySetInnerHTML={{ __html: fields.html }} />;
        }
        return null;
      }
      default:
        return null;
    }
  });
}

export function ContentPreview({
  className,
  content,
}: {
  className?: string;
  content: PayloadContent;
}) {
  const root = content.root as unknown as JsonNode;
  return (
    <div className={className ?? "article-body"}>{renderBlocks(root.children)}</div>
  );
}

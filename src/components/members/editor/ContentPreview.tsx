"use client";

import type { ReactNode } from "react";
import { mediaImageSrc } from "@/lib/cf-image";
import { useMediaById } from "@/lib/members/use-media";
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
 */
function renderText(node: JsonNode, key: number): ReactNode {
  const format = typeof node.format === "number" ? node.format : 0;
  let content: ReactNode = String(node.text ?? "");
  if (format & FORMAT_CODE) content = <code className="bg-secondary px-1">{content}</code>;
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
      case "link": {
        const fields = node.fields as { url?: string } | undefined;
        return (
          <a
            key={index}
            href={fields?.url ?? "#"}
            className="text-primary underline"
          >
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
          <Tag key={index} className="font-heading font-semibold">
            {renderInline(node.children)}
          </Tag>
        );
      }
      case "paragraph":
        return <p key={index}>{renderInline(node.children)}</p>;
      case "quote":
        return (
          <blockquote key={index} className="border-l-2 border-border pl-3 text-foreground/70">
            {renderInline(node.children)}
          </blockquote>
        );
      case "horizontalrule":
        return <hr key={index} className="border-border" />;
      case "list": {
        const Tag = node.listType === "number" ? "ol" : "ul";
        return (
          <Tag key={index} className={Tag === "ol" ? "list-decimal pl-5" : "list-disc pl-5"}>
            {renderBlocks(node.children)}
          </Tag>
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
          <table key={index} className="w-full border-collapse text-left">
            <tbody>{renderBlocks(node.children)}</tbody>
          </table>
        );
      case "tablerow":
        return <tr key={index}>{renderBlocks(node.children)}</tr>;
      case "tablecell": {
        const Cell = node.headerState ? "th" : "td";
        return (
          <Cell key={index} className="border border-border px-2 py-1">
            {renderBlocks(node.children)}
          </Cell>
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
            <pre key={index} className="overflow-x-auto bg-secondary p-3 text-sm">
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
    <div className={className ?? "prose max-w-none space-y-3"}>
      {renderBlocks(root.children)}
    </div>
  );
}

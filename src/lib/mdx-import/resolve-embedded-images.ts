import { newObjectIdHex } from "@/lib/editor/object-id";

import type { PayloadContent } from "@/lib/editor/serialize";
import type { ImportWarning } from "./types";

type JsonNode = {
  type: string;
  children?: JsonNode[];
  [key: string]: unknown;
};

/**
 * Uploads one decoded image and returns the created media id, or throws.
 * Injected rather than called directly so this module stays a pure tree
 * walk with no network dependency of its own — `ImportPost.tsx` supplies
 * the real implementation (`POST /api/media`, matching
 * `UploadDropzone.tsx`'s small-file path); tests supply a fake.
 */
export type EmbeddedImageUploader = (params: {
  alt: string;
  bytes: Uint8Array;
  mimeType: string;
}) => Promise<{ id: number | string }>;

const DATA_URI = /^data:([^;,]+)(;base64)?,([\s\S]*)$/;

function decodeDataUri(dataUri: string): { bytes: Uint8Array; mimeType: string } | null {
  const match = DATA_URI.exec(dataUri);
  if (!match) return null;
  const [, mimeType, isBase64, payload] = match;
  // Only base64-encoded data URIs are handled — a percent-encoded
  // (`data:image/svg+xml,%3Csvg...`) URI is rare for a raster image and
  // decoding it correctly needs different logic; it falls through to the
  // same "could not embed" outcome as any other unsupported form.
  if (!isBase64) return null;
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mimeType };
}

function textPlaceholder(alt: string): JsonNode {
  return {
    detail: 0,
    format: 0,
    mode: "normal",
    style: "",
    text: `［圖片未匯入：${alt}］`,
    type: "text",
    version: 1,
  };
}

async function resolveOne(
  node: JsonNode,
  uploadImage: EmbeddedImageUploader,
  warnings: ImportWarning[],
): Promise<JsonNode> {
  const dataUri = String(node.dataUri ?? "");
  const alt = String(node.alt ?? "") || "圖片";
  const decoded = decodeDataUri(dataUri);

  if (!decoded) {
    warnings.push({
      code: "image-embed-failed",
      message: `圖片「${alt}」的格式無法解析，已略過`,
    });
    return textPlaceholder(alt);
  }

  try {
    const uploaded = await uploadImage({ alt, bytes: decoded.bytes, mimeType: decoded.mimeType });
    warnings.push({ code: "image-embedded", message: `圖片「${alt}」已自動上傳` });
    return {
      type: "upload",
      version: 3,
      format: "",
      relationTo: "media",
      value: uploaded.id,
      id: newObjectIdHex(),
    };
  } catch (error) {
    // Never blocks the rest of the import: a quota refusal or network
    // failure on one image degrades to the same placeholder a
    // never-embedded image gets, rather than failing the whole document.
    warnings.push({
      code: "image-embed-failed",
      message: `圖片「${alt}」上傳失敗：${(error as Error).message || "未知錯誤"}`,
    });
    return textPlaceholder(alt);
  }
}

async function walk(
  node: JsonNode,
  uploadImage: EmbeddedImageUploader,
  warnings: ImportWarning[],
): Promise<JsonNode> {
  if (node.type === "pending-embedded-image") {
    return resolveOne(node, uploadImage, warnings);
  }
  if (!Array.isArray(node.children)) return node;
  const children = await Promise.all(
    node.children.map((child) => walk(child, uploadImage, warnings)),
  );
  return { ...node, children };
}

/**
 * Replaces every `pending-embedded-image` marker `to-lexical.ts` produced
 * for a base64 `data:` image with either a real Lexical `upload` node (on
 * a successful upload) or the same text placeholder a non-embedded image
 * gets (on failure) — so this function's own output is guaranteed to
 * never contain a `pending-embedded-image` node, the same structural
 * guarantee `toPayloadContent` makes for `member-pending-upload` in the
 * live editor (`serialize.ts`).
 *
 * `mdastToLexical` deliberately does not do this itself: it is synchronous
 * and network-free by design (`docs/testing-strategy.md`'s cheapest-level
 * rule — 19 unit tests exercise it with zero I/O). Uploading is the one
 * part of this feature that cannot be, so it is a second, explicit,
 * async pass over the tree the synchronous core already built.
 */
export async function resolveEmbeddedImages(
  content: PayloadContent,
  uploadImage: EmbeddedImageUploader,
): Promise<{ content: PayloadContent; warnings: ImportWarning[] }> {
  const warnings: ImportWarning[] = [];
  const root = await walk(content.root as unknown as JsonNode, uploadImage, warnings);
  return { content: { root: root as unknown as PayloadContent["root"] }, warnings };
}

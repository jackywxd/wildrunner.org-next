import Image from "next/image";

import type { Media, Post } from "@/payload-types";
import { mediaImageSrc } from "@/lib/cf-image";
import {
  RichText,
  type JSXConvertersFunction,
} from "@payloadcms/richtext-lexical/react";

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

import type { RenderImageContext, RenderImageProps } from "react-photo-album";
import "react-photo-album/rows.css";
import Image from "next/image";

type GalleryPhoto = {
  src: string;
  width: number;
  height: number;
  blurDataURL?: string;
};

/** First N album tiles get priority for LCP; the rest stay lazy. */
const PRIORITY_COUNT = 3;

export function NextJsImage(
  { alt = "", title, sizes }: RenderImageProps,
  { photo, width, height, index }: RenderImageContext
) {
  const galleryPhoto = photo as GalleryPhoto;
  const hasBlur = Boolean(galleryPhoto.blurDataURL);
  const priority = index < PRIORITY_COUNT;

  return (
    <div
      style={{
        width: "100%",
        position: "relative",
        aspectRatio: `${width} / ${height}`,
      }}
    >
      <Image
        fill
        src={galleryPhoto.src}
        alt={alt}
        title={title}
        sizes={sizes}
        className="object-cover rounded-sm"
        priority={priority}
        loading={priority ? undefined : "lazy"}
        placeholder={hasBlur ? "blur" : "empty"}
        blurDataURL={hasBlur ? galleryPhoto.blurDataURL : undefined}
      />
    </div>
  );
}

/** @deprecated Prefer NextJsImage — kept as alias for existing imports */
export const LazyImage = NextJsImage;

export default NextJsImage;

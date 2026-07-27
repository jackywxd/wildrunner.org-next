"use client";

import React, { useMemo } from "react";
import Image from "next/image";
import { RdPhoto } from "@/lib/veliteUtils";
import { useWindowSize } from "usehooks-ts";
import { calculateDisplayedDimensions } from "@/lib/utils";

interface IPhotoCardProps {
  item: RdPhoto;
  maxWidth?: number;
  maxHeight?: number;
  isMobile?: boolean;
  priority?: boolean;
  className?: string;
}

const PhotoCard: React.FC<IPhotoCardProps> = ({
  item: photo,
  maxWidth,
  maxHeight,
  priority = false,
  className,
}) => {
  const { src, slug, width, height, blurDataURL } = photo;
  const { width: windowWidth, height: windowHeight } = useWindowSize();

  const { displayedWidth, displayedHeight } = useMemo(() => {
    return calculateDisplayedDimensions(
      width,
      height,
      maxWidth ?? windowWidth,
      maxHeight ?? windowHeight
    );
  }, [width, height, maxWidth, windowWidth, maxHeight, windowHeight]);

  const hasBlur = Boolean(blurDataURL);
  const sizes =
    maxWidth != null
      ? `${Math.ceil(maxWidth)}px`
      : "(max-width: 768px) 90vw, 400px";

  return (
    <div
      key={`photo-container-${slug}`}
      className={className}
      style={{
        width: displayedWidth || undefined,
        height: displayedHeight || undefined,
      }}
    >
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          width: displayedWidth || "100%",
          height: displayedHeight || "100%",
        }}
      >
        <Image
          src={src}
          alt="封面图片"
          width={Math.max(1, Math.round(displayedWidth || width))}
          height={Math.max(1, Math.round(displayedHeight || height))}
          sizes={sizes}
          priority={priority}
          loading={priority ? undefined : "lazy"}
          placeholder={hasBlur ? "blur" : "empty"}
          blurDataURL={hasBlur ? blurDataURL : undefined}
          className="rounded-2xl object-cover w-full h-full"
          style={{ margin: 0 }}
        />
      </div>
    </div>
  );
};

export default React.memo(PhotoCard);

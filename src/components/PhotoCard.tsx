"use client";

import React, { useRef, useMemo, useEffect, useState } from "react";
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
  isMobile = false,
  priority = true,
  className,
}) => {
  const { src, slug, width, height } = photo;
  const [isInView, setIsInView] = useState(isMobile);

  const cardRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const { width: windowWidth, height: windowHeight } = useWindowSize();

  const { displayedWidth, displayedHeight } = useMemo(() => {
    return calculateDisplayedDimensions(
      width,
      height,
      maxWidth ?? windowWidth,
      maxHeight ?? windowHeight
    );
  }, [width, height, maxWidth, windowWidth, maxHeight, windowHeight]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && cardRef.current) {
          setIsInView(true);
          observer.unobserve(cardRef.current);
        }
      },
      {
        rootMargin: "100px",
        threshold: 0.1,
      }
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => {
      if (cardRef.current) {
        observer.unobserve(cardRef.current);
      }
    };
  }, []);

  return (
    <div ref={cardRef} key={`photo-container-${slug}`} className={className}>
      {isInView ? (
        <div className="relative rounded-2xl">
          <img
            ref={imgRef}
            src={src}
            alt={`封面图片`}
            className="rounded-2xl transition-opacity duration-300"
            width={displayedWidth}
            height={displayedHeight}
            loading="lazy"
            style={{
              margin: 0,
              width: displayedWidth,
              height: displayedHeight,
              opacity: 0,
            }}
            onLoad={(e) => {
              const img = e.target as HTMLImageElement;
              img.style.opacity = "1";
              const blurDiv = img.nextElementSibling as HTMLDivElement;
              if (blurDiv) {
                blurDiv.style.opacity = "0";
              }
            }}
          />
          <div
            className="absolute inset-0 bg-gray-200 rounded-2xl transition-opacity duration-300"
            style={{
              backgroundImage: `url(${photo.blurDataURL || ""})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(20px)",
            }}
          />
        </div>
      ) : // if is not inView, it won't be seen anyway
      null}
    </div>
  );
};

export default React.memo(PhotoCard);

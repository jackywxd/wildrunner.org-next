"use client";

import React, { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface BlurImageProps {
  src: string;
  blurDataURL?: string;
  alt: string;
  title?: string;
  sizes?: string;
  className?: string;
  priority?: boolean;
}

const BlurImage: React.FC<BlurImageProps> = ({
  src,
  blurDataURL,
  alt,
  title,
  sizes = "(max-width: 1280px) 100vw, 1280px",
  className,
  priority = false,
}) => {
  const [loaded, setLoaded] = useState(false);
  const hasBlur = Boolean(blurDataURL);

  return (
    <div className={cn("relative w-full h-full overflow-hidden", className)}>
      <Image
        src={src}
        alt={alt}
        title={title}
        fill
        sizes={sizes}
        priority={priority}
        loading={priority ? undefined : "lazy"}
        placeholder={hasBlur ? "blur" : "empty"}
        blurDataURL={hasBlur ? blurDataURL : undefined}
        className={cn(
          "object-cover transition-opacity duration-300",
          loaded || hasBlur ? "opacity-100" : "opacity-0"
        )}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
};

export default BlurImage;

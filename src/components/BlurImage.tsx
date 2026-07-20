import React from "react";

interface BlurImageProps {
  src: string;
  blurDataURL?: string;
  alt: string;
  title?: string;
  sizes?: string;
}

const BlurImage: React.FC<BlurImageProps> = ({
  src,
  blurDataURL,
  alt,
  title,
  sizes,
}) => {
  return (
    <div className="relative w-full h-full">
      <img
        src={src}
        alt={alt}
        title={title}
        sizes={sizes}
        loading="lazy"
        className="absolute inset-0 w-full h-full object-cover"
        style={{
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
        className="absolute inset-0 bg-gray-200 transition-opacity duration-300 ease-in-out rounded-lg"
        style={{
          backgroundImage: `url(${blurDataURL || ""})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(20px)",
        }}
      />
    </div>
  );
};

export default BlurImage;

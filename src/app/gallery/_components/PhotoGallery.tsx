"use client";

import { useState, useEffect } from "react";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";

// import optional lightbox plugins
import Fullscreen from "yet-another-react-lightbox/plugins/fullscreen";
import Slideshow from "yet-another-react-lightbox/plugins/slideshow";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/plugins/thumbnails.css";

import React from "react";
import PhotoAlbum from "react-photo-album";
import type { Gallery } from "#site/content";
import { LazyImage } from "@/app/gallery/_components/NextJsImage";

interface Photo {
  src: string;
  width: number;
  height: number;
  blurDataURL: string;
}

export const PhotoGallery: React.FC<{ gallery: Gallery }> = ({ gallery }) => {
  const [index, setIndex] = useState(-1);
  const [photos, setPhotos] = useState<Photo[]>([]);

  useEffect(() => {
    // 初始只加载前3张图片
    const initialPhotos = gallery.images.slice(0, 10).map((img) => ({
      src: img.src,
      width: img.width,
      height: img.height,
      blurDataURL: img.blurDataURL,
    }));
    setPhotos(initialPhotos);

    // 延迟加载剩余图片
    const loadRemainingPhotos = () => {
      const remainingPhotos = gallery.images.slice(10).map((img) => ({
        src: img.src,
        width: img.width,
        height: img.height,
        blurDataURL: img.blurDataURL,
      }));
      setPhotos((prevPhotos) => [...prevPhotos, ...remainingPhotos]);
    };

    const timer = setTimeout(loadRemainingPhotos, 1000);
    return () => clearTimeout(timer);
  }, [gallery]);

  return (
    <>
      <PhotoAlbum
        layout="rows"
        targetRowHeight={350}
        photos={photos}
        render={{ image: LazyImage }}
        defaultContainerWidth={1280}
        sizes={{ size: "calc(1280px)" }}
        onClick={({ index }) => setIndex(index)}
      />
      <Lightbox
        slides={photos}
        open={index >= 0}
        index={index}
        close={() => setIndex(-1)}
        // enable optional lightbox plugins
        plugins={[Fullscreen, Slideshow, Thumbnails, Zoom]}
      />
    </>
  );
};

export default PhotoGallery;

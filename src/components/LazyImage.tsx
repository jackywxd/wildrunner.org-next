import React, { useEffect, useRef, useState } from "react";

const LazyImage = ({ src, alt, ...props }: { src: string; alt: string }) => {
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && imgRef.current) {
          setIsInView(true);
          observer.unobserve(imgRef.current);
        }
      },
      {
        rootMargin: "100px",
        threshold: 0.1,
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => {
      if (imgRef.current) {
        observer.unobserve(imgRef.current);
      }
    };
  }, []);

  return (
    <div ref={imgRef}>
      {isInView ? (
        <img src={src} alt={alt} {...props} />
      ) : (
        <div style={{ height: "200px", background: "#f0f0f0" }}>Loading...</div>
      )}
    </div>
  );
};

export default LazyImage;

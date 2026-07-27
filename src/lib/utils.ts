import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { SitePost } from "@/lib/content-types";

type Posts = SitePost[];

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(input: string | number) {
  const date = new Date(input);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Function to filter posts based on search parameters
export function filterPosts(
  posts: Posts,
  params: {
    column?: string;
    category?: string;
    tag?: string;
  },
): Posts {
  if (!params.column && !params.category && !params.tag) {
    return posts;
  }
  // Legacy Velite column/category filters are not modeled in Payload yet.
  return posts;
}

export function calculateDisplayedDimensions(
  imageWidth: number,
  imageHeight: number,
  maxWidth: number,
  maxHeight: number
): { displayedWidth: number; displayedHeight: number } {
  if (imageWidth <= maxWidth && imageHeight <= maxHeight) {
    return {
      displayedWidth: imageWidth,
      displayedHeight: imageHeight,
    };
  }

  const aspectRatio = imageWidth / imageHeight;
  let displayedWidth = maxWidth;
  let displayedHeight = maxWidth / aspectRatio;

  if (displayedHeight > maxHeight) {
    displayedHeight = maxHeight;
    displayedWidth = maxHeight * aspectRatio;
  }

  return {
    displayedWidth: displayedWidth,
    displayedHeight: displayedHeight,
  };
}

export function fetcher<JSON = any>(input: string, init?: any): Promise<JSON> {
  if (/^\//.test(input)) input = process.env.NEXT_PUBLIC_SITE_URL! + input;
  return fetch(input, init).then((res) => res.json());
}

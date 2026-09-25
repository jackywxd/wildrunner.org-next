import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import type { SitePost } from "@/lib/content-types";

type Posts = SitePost[];

/**
 * `twMerge` taught the one size `tailwind.config.ts` adds.
 *
 * It resolves conflicts by class *group*, and a `text-*` it does not
 * recognise as a size it files as a colour. So `cn("text-tag", "text-primary")`
 * — the shape every tone-coloured tag on /races takes — came back as
 * `text-primary` alone: the size silently dropped, every tag back at the
 * inherited 16px, with no error anywhere.
 */
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: ["tag"] }] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(input: string | number) {
  const date = new Date(input);
  // 「2024年10月13日」, not "October 13, 2024" beside 「發表於」 on a
  // Chinese page. The digits and 年月日 are the same in both scripts.
  return date.toLocaleDateString("zh-Hant", {
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

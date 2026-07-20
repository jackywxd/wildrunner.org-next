import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { posts } from "#site/content";

type Posts = typeof posts;

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
  }
): Posts {
  const columns = params.column ? params.column.split(",") : [];
  const categories = params.category ? params.category.split(",") : [];

  return posts.filter((post) => {
    const columnMatch =
      columns.length > 0
        ? columns.some((col) => post.columns.includes(col))
        : true;
    const categoryMatch =
      categories.length > 0
        ? categories.some((cat) => post.categories.includes(cat))
        : true;

    return columnMatch && categoryMatch;
  });
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

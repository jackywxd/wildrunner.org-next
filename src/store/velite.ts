import {
  posts,
  Post,
  authors,
  Author,
  galleries,
  Gallery,
} from "#site/content";

export function getPostBySlug(slug: string): Post | undefined {
  return posts.find((post) => post.slug === slug);
}

export function getPostsByColumn(column: string): typeof posts {
  return posts.filter((post) => post.columns.includes(column));
}

export function getPostsByCategory(category: string): typeof posts {
  return posts.filter((post) => post.categories.includes(category));
}

export function getPostsByAuthor(author: string): typeof posts {
  return posts.filter((post) => post.author.includes(author));
}

export function getAuthorBySlug(slug: string): Author | undefined {
  return authors.find((author) => author.slug === slug);
}

export function getGalleryBySlug(slug: string): Gallery | undefined {
  return galleries.find((gallery) => gallery.slug === slug);
}

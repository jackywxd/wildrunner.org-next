/**
 * Idempotent Velite (.velite JSON) → Payload migration.
 *
 * Usage:
 *   pnpm migrate:velite -- --dry-run
 *   pnpm migrate:velite
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getPayload } from "payload";
import { getPlatformProxy } from "wrangler";
import {
  convertMarkdownToLexical,
  type LexicalRichTextAdapter,
} from "@payloadcms/richtext-lexical";

import { videoIdFromFilename } from "../src/lib/videoId";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const veliteDir = path.join(root, ".velite");

const dryRun = process.argv.includes("--dry-run");
const remote = process.argv.includes("--remote");

type VelitePost = {
  title: string;
  slug: string;
  description?: string;
  seoDescription?: string;
  author?: string;
  featured?: boolean;
  date?: string;
  published?: boolean;
  raw?: string;
  image?: {
    src: string;
    width?: number;
    height?: number;
    filename?: string;
  };
};

type VeliteGallery = {
  name: string;
  slug: string;
  created?: string;
  images: {
    filename: string;
    src: string;
    featured?: boolean;
    width?: number;
    height?: number;
    blurDataURL?: string;
  }[];
  videos?: {
    filename: string;
    src: string;
    mimeType?: string;
    id?: string;
  }[];
};

type VeliteAuthor = {
  name: string;
  slug: string;
  bio?: string;
};

type VeliteGlobals = {
  heroTitleEn?: string;
  heroTitleZh?: string;
  metadata?: {
    title?: { default?: string; template?: string };
    description?: string;
  };
  social?: { github?: string };
  topNavItems?: { label: string; href: string; icon?: string }[];
};

async function readJson<T>(file: string): Promise<T> {
  const raw = await fs.readFile(path.join(veliteDir, file), "utf8");
  return JSON.parse(raw) as T;
}

const mediaUrlCache = new Map<string, number>();

function migrationFilename(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname
    .replace(/^\/+/, "")
    .replaceAll("/", "--")
    .replace(/[^a-zA-Z0-9._-]/g, "-");
}

async function ensureMediaFromUrl(
  payload: Awaited<ReturnType<typeof getPayload>>,
  url: string,
  alt: string,
  meta?: {
    width?: number;
    height?: number;
    mimeType?: string;
    blurDataURL?: string;
  },
): Promise<number | null> {
  if (mediaUrlCache.has(url)) {
    return mediaUrlCache.get(url)!;
  }

  const name = migrationFilename(url);
  const existing = await payload.find({
    collection: "media",
    limit: 1,
    where: { filename: { equals: name } },
  });
  if (existing.docs[0]?.id) {
    mediaUrlCache.set(url, existing.docs[0].id);
    return existing.docs[0].id;
  }

  if (dryRun) {
    mediaUrlCache.set(url, -1);
    return -1;
  }

  const response = await fetch(url);
  if (!response.ok) {
    console.warn(`Skip media (fetch ${response.status}): ${url}`);
    return null;
  }
  const data = Buffer.from(await response.arrayBuffer());
  const mimeType =
    meta?.mimeType ??
    response.headers.get("content-type") ??
    "application/octet-stream";

  const doc = await payload.create({
    collection: "media",
    data: {
      alt,
      width: meta?.width,
      height: meta?.height,
      blurDataURL: meta?.blurDataURL,
    },
    file: {
      data,
      mimetype: mimeType,
      name,
      size: data.length,
    },
    context: { skipStreamIngest: true },
  });

  mediaUrlCache.set(url, doc.id);
  return doc.id;
}

async function migrateAuthors(
  payload: Awaited<ReturnType<typeof getPayload>>,
  authors: VeliteAuthor[],
) {
  const map = new Map<string, number>();
  for (const author of authors) {
    const found = await payload.find({
      collection: "authors",
      limit: 1,
      where: { slug: { equals: author.slug } },
    });
    if (found.docs[0]) {
      map.set(author.slug, found.docs[0].id);
      continue;
    }
    if (dryRun) {
      map.set(author.slug, -1);
      continue;
    }
    const doc = await payload.create({
      collection: "authors",
      data: {
        name: author.name,
        slug: author.slug,
        bio: author.bio?.includes("jsx") ? undefined : author.bio,
      },
    });
    map.set(author.slug, doc.id);
  }
  return map;
}

function normalizeMdx(raw: string): string {
  return raw
    .replace(
      /<YouTube\s+id=["']([^"']+)["']\s*\/>/g,
      "https://www.youtube.com/watch?v=$1",
    )
    .replace(/<([A-Z][A-Za-z0-9]*)[^>]*\/>/g, "[Unsupported component: $1]");
}

function postContentFromRaw(
  editorConfig: LexicalRichTextAdapter["editorConfig"],
  raw?: string,
) {
  const text = (raw ?? "").trim();
  if (!text) {
    return convertMarkdownToLexical({
      editorConfig,
      markdown: "（迁移占位正文）",
    });
  }
  return convertMarkdownToLexical({
    editorConfig,
    markdown: normalizeMdx(text),
  });
}

async function main() {
  const [posts, galleries, authors, globals] = await Promise.all([
    readJson<VelitePost[]>("posts.json"),
    readJson<VeliteGallery[]>("galleries.json"),
    readJson<VeliteAuthor[]>("authors.json"),
    readJson<VeliteGlobals>("globals.json"),
  ]);

  const sourceCounts = {
    posts: posts.length,
    galleries: galleries.length,
    images: galleries.reduce(
      (count, gallery) => count + (gallery.images?.length ?? 0),
      0,
    ),
    videos: galleries.reduce(
      (count, gallery) => count + (gallery.videos?.length ?? 0),
      0,
    ),
    authors: authors.length,
    globals: 1,
  };

  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, source: sourceCounts }, null, 2));
    assertThresholds(sourceCounts);
    return;
  }

  if (remote) {
    Object.assign(process.env, { NODE_ENV: "production" });
  }
  const { default: config } = await import("@payload-config");
  const payload = await getPayload({ config });
  const editorConfig = (
    payload.config.editor as LexicalRichTextAdapter
  ).editorConfig;
  const platform = await getPlatformProxy<CloudflareEnv>({
    remoteBindings: remote,
  });
  const authorMap = await migrateAuthors(payload, authors);

  if (!dryRun) {
    await payload.updateGlobal({
      slug: "site",
      data: {
        heroTitleEn: globals.heroTitleEn,
        heroTitleZh: globals.heroTitleZh,
        metadata: {
          titleDefault: globals.metadata?.title?.default,
          titleTemplate: globals.metadata?.title?.template,
          description: globals.metadata?.description,
        },
        social: {
          github: globals.social?.github,
        },
        topNavItems: globals.topNavItems ?? [],
      },
    });
  }

  let postsCreated = 0;
  for (const post of posts) {
    const existing = await payload.find({
      collection: "posts",
      limit: 1,
      where: { slug: { equals: post.slug } },
    });
    if (existing.docs[0]) continue;

    const authorEntry = post.author
      ? authors.find((a) => a.name === post.author)
      : undefined;
    const authorId = authorEntry
      ? authorMap.get(authorEntry.slug)
      : undefined;
    const imageId = post.image?.src
      ? await ensureMediaFromUrl(payload, post.image.src, post.title, {
          width: post.image.width,
          height: post.image.height,
        })
      : null;

    if (dryRun) {
      postsCreated += 1;
      continue;
    }

    await payload.create({
      collection: "posts",
      data: {
        title: post.title,
        slug: post.slug,
        description: post.description || post.seoDescription || post.title,
        featured: Boolean(post.featured),
        publishedAt: post.date,
        author: authorId,
        image: imageId && imageId > 0 ? imageId : undefined,
        content: postContentFromRaw(editorConfig, post.raw),
        _status: post.published ? "published" : "draft",
      },
    });
    postsCreated += 1;
  }

  let galleriesCreated = 0;
  let imageCount = 0;
  let videoCount = 0;
  const streamPending: string[] = [];

  for (const gallery of galleries) {
    const existing = await payload.find({
      collection: "galleries",
      limit: 1,
      where: { slug: { equals: gallery.slug } },
    });
    if (existing.docs[0]) continue;

    const images: { media: number; featured?: boolean }[] = [];
    for (const image of gallery.images ?? []) {
      const mediaId = await ensureMediaFromUrl(
        payload,
        image.src,
        `${gallery.name} ${image.filename}`,
        {
          width: image.width,
          height: image.height,
          blurDataURL: image.blurDataURL,
        },
      );
      if (mediaId && mediaId > 0) {
        images.push({ media: mediaId, featured: Boolean(image.featured) });
        imageCount += 1;
      }
    }

    const videos: { media: number; videoId?: string }[] = [];
    for (const video of gallery.videos ?? []) {
      const mediaId = await ensureMediaFromUrl(
        payload,
        video.src,
        `${gallery.name} ${video.filename}`,
        { mimeType: video.mimeType ?? "video/mp4" },
      );
      if (mediaId && mediaId > 0) {
        let streamId: string | undefined;
        let streamReady = false;
        try {
          const streamVideo = await platform.env.STREAM.upload(video.src, {
            meta: { name: video.filename },
          });
          streamId = streamVideo.id;
          streamReady = streamVideo.readyToStream;
          await payload.update({
            collection: "media",
            id: mediaId,
            data: { streamId, streamReady },
            overrideAccess: true,
          });
        } catch (error) {
          console.warn(`Stream ingest pending: ${video.src}`, error);
        }
        videos.push({
          media: mediaId,
          videoId: video.id ?? videoIdFromFilename(video.filename),
        });
        videoCount += 1;
        if (!streamId) streamPending.push(video.src);
      }
    }

    const coverSrc = gallery.images?.[0]?.src;
    const coverId = coverSrc
      ? await ensureMediaFromUrl(payload, coverSrc, gallery.name)
      : null;

    if (dryRun) {
      galleriesCreated += 1;
      continue;
    }

    await payload.create({
      collection: "galleries",
      data: {
        name: gallery.name,
        slug: gallery.slug,
        featured: gallery.images.some((image) => image.featured),
        eventDate: gallery.created,
        cover: coverId && coverId > 0 ? coverId : undefined,
        images,
        videos,
        _status: "published",
      },
    });
    galleriesCreated += 1;
  }

  const report = {
    dryRun,
    remote,
    source: sourceCounts,
    posts: postsCreated,
    galleries: galleriesCreated,
    images: imageCount,
    videos: videoCount,
    streamPending: streamPending.length,
    authors: authors.length,
    globals: 1,
    manualReview: posts
      .filter((post) => /<(?!YouTube\b)[A-Z][A-Za-z0-9]*/.test(post.raw ?? ""))
      .map((post) => post.slug),
  };

  console.log(JSON.stringify(report, null, 2));
  await fs.mkdir(path.join(root, "reports"), { recursive: true });
  await fs.writeFile(
    path.join(root, "reports", "payload-migration.json"),
    JSON.stringify(report, null, 2),
  );
  assertThresholds(sourceCounts);
}

function assertThresholds(counts: {
  posts: number;
  galleries: number;
  images: number;
  videos: number;
  authors: number;
  globals: number;
}) {
  const expected = {
    posts: 15,
    galleries: 20,
    images: 398,
    videos: 22,
    authors: 1,
    globals: 1,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (counts[key as keyof typeof counts] !== value) {
      throw new Error(
        `Migration source count mismatch for ${key}: expected ${value}, got ${counts[key as keyof typeof counts]}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

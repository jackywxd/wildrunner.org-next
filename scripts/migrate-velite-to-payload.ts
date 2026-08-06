/**
 * Idempotent Velite (.velite JSON) → Payload migration.
 *
 * Usage:
 *   pnpm migrate:velite -- --dry-run
 *   pnpm migrate:velite
 *   pnpm migrate:velite -- --remote --skip-videos
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
/**
 * Re-apply content to documents that already exist, instead of skipping
 * them. Needed whenever the conversion itself changes (e.g. inline images
 * that previously migrated as literal markdown text) — the plain idempotent
 * run skips the whole document and would never pick the fix up.
 */
const refreshContent = process.argv.includes("--refresh-content");
const skipVideos = process.argv.includes("--skip-videos");
/**
 * Cloudflare Stream ingest is opt-in: it bills per stored minute and the
 * site plays gallery videos straight from R2. Without this every migration
 * run fires 22 uploads that fail on quota and log an error each. Pass
 * --with-stream (after buying capacity) to ingest.
 */
const withStream = process.argv.includes("--with-stream");

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
  /** Compiled MDX; carries the resolved absolute URLs `raw` lacks. */
  body?: string;
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

const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  avif: "image/avif",
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mov: "video/quicktime",
};

function mimeTypeFromUrl(url: string): string {
  const ext = url.split(".").pop()?.split("?")[0]?.toLowerCase() ?? "";
  return MIME_TYPES_BY_EXTENSION[ext] ?? "application/octet-stream";
}

/**
 * Registers a Media doc that points at an object already sitting in R2 from
 * the original Velite build. Deliberately does NOT fetch or re-upload the
 * file — the r2Storage plugin only intercepts uploads that carry a `file`,
 * so passing plain field data (including `url`) leaves it untouched (see
 * @payloadcms/plugin-cloud-storage's beforeChange/afterRead url hooks, which
 * only override `url` when a `generateFileURL` adapter option is set, which
 * this project's plugin config does not set).
 *
 * IMPORTANT: this must go through `payload.db.create` (the raw database
 * adapter), NOT `payload.create`. Payload's core `generateFileData` treats
 * any create on an upload-enabled collection that includes a `url` field as
 * a "paste URL to upload" request and fetches + re-uploads it regardless of
 * whether `file` was passed — `payload.db.create` skips that document
 * operation logic entirely and just inserts the row.
 */
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

  const doc = await payload.db.create({
    collection: "media",
    data: {
      alt,
      url,
      filename: name,
      mimeType: meta?.mimeType ?? mimeTypeFromUrl(url),
      width: meta?.width,
      height: meta?.height,
      blurDataURL: meta?.blurDataURL,
    },
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

let inlineImagesConverted = 0;
const inlineImagesUnresolved: string[] = [];

type ResolvedInlineImage = {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  blurDataURL?: string;
};

/**
 * Pulls already-resolved image URLs out of Velite's *compiled* MDX.
 *
 * `post.raw` keeps the author's original relative references
 * (`![官方相片](1351735193109_.pic.jpg)`), which point at nothing once the
 * content leaves the repo. Velite's build already did the work of resolving
 * them — including converting to .webp and generating a blur placeholder —
 * but only in the compiled `body`, as JSX calls:
 *
 *   l(i.img,{src:"https://images.wildrunner.org/posts/2024/…/x.pic.webp",
 *            alt:"官方相片",width:"1024",height:"1536",blurdataurl:"data:…"})
 *
 * Keyed on the filename stem rather than document order: the compiled body
 * also contains the cover image, so positional matching would shift every
 * image in a post by one.
 */
function resolvedInlineImages(body?: string): Map<string, ResolvedInlineImage> {
  const map = new Map<string, ResolvedInlineImage>();
  if (!body) return map;

  // The compiled MDX minifies its component namespace to a single-letter
  // alias that differs per file (i.img in one post, a.img in another), so
  // match any identifier rather than a fixed one.
  const imgCall = /\w+\.img\s*,\s*\{([^}]*)\}/g;
  const attr = (source: string, name: string) =>
    source.match(new RegExp(`${name}\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`))?.[1];

  for (const match of body.matchAll(imgCall)) {
    const props = match[1];
    const src = attr(props, "src");
    if (!src) continue;

    const stem = stemFromUrl(src);
    if (!stem || map.has(stem)) continue;

    const width = Number(attr(props, "width"));
    const height = Number(attr(props, "height"));
    map.set(stem, {
      src,
      alt: attr(props, "alt"),
      width: Number.isFinite(width) ? width : undefined,
      height: Number.isFinite(height) ? height : undefined,
      blurDataURL: attr(props, "blurdataurl"),
    });
  }

  return map;
}

/** Filename without directory or extension, for matching raw <-> resolved. */
function stemFromUrl(value: string): string {
  const withoutQuery = value.split("?")[0] ?? "";
  const base = decodeURIComponent(withoutQuery.split("/").pop() ?? "");
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

async function postContentFromRaw(
  payload: Awaited<ReturnType<typeof getPayload>>,
  editorConfig: LexicalRichTextAdapter["editorConfig"],
  post: VelitePost,
) {
  const text = (post.raw ?? "").trim();
  if (!text) {
    return convertMarkdownToLexical({
      editorConfig,
      markdown: "（迁移占位正文）",
    });
  }

  const resolved = resolvedInlineImages(post.body);
  let markdown = normalizeMdx(text);

  // Rewrite each inline image to Payload's own upload-import placeholder,
  // `![relationTo:id]()`, which its UploadMarkdownTransformer turns into a
  // real upload node. Without this the markdown converter has no way to
  // resolve the reference and leaves the literal `![alt](file.jpg)` text
  // sitting in the body.
  const replacements: { from: string; to: string }[] = [];
  for (const match of markdown.matchAll(MARKDOWN_IMAGE)) {
    const [full, alt, ref] = match;
    const info = resolved.get(stemFromUrl(ref));
    if (!info) {
      inlineImagesUnresolved.push(`${post.slug}: ${ref}`);
      continue;
    }

    const mediaId = await ensureMediaFromUrl(
      payload,
      info.src,
      alt || info.alt || post.title,
      {
        width: info.width,
        height: info.height,
        blurDataURL: info.blurDataURL,
      },
    );
    if (!mediaId || mediaId <= 0) {
      inlineImagesUnresolved.push(`${post.slug}: ${info.src}`);
      continue;
    }

    replacements.push({ from: full, to: `![media:${mediaId}]()` });
    inlineImagesConverted += 1;
  }

  for (const { from, to } of replacements) {
    markdown = markdown.replace(from, to);
  }

  return convertMarkdownToLexical({ editorConfig, markdown });
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

  // Before the dry-run return, deliberately. `--dry-run --remote` reports what
  // it *would* do to a remote database, and until this moved up it never
  // checked that the remote it named was real — so the one combination a
  // person runs to be careful was the one that validated nothing. It also made
  // the check below unreachable from any command that does not write.
  const remoteTarget = remote ? (process.env.CLOUDFLARE_ENV ?? "staging") : null;
  if (remoteTarget !== null && remoteTarget !== "staging" && remoteTarget !== "production") {
    console.error(
      `CLOUDFLARE_ENV must be "staging" or "production", got "${remoteTarget}".`,
    );
    process.exit(1);
  }

  if (dryRun) {
    console.log(
      JSON.stringify(
        { dryRun: true, source: sourceCounts, target: remoteTarget ?? "local" },
        null,
        2,
      ),
    );
    assertThresholds(sourceCounts);
    return;
  }

  if (remote) {
    // NODE_ENV alone is not enough. payload.config resolves bindings with
    // `getPlatformProxy({ environment: process.env.CLOUDFLARE_ENV,
    // remoteBindings: isProduction })` — without CLOUDFLARE_ENV it silently
    // picks the *default* environment's local D1, so `--remote` would report
    // a perfect migration while writing every row to the local database and
    // leaving the remote one untouched. Default to staging, but respect an
    // explicit CLOUDFLARE_ENV so this can target production at cutover.
    //
    // "production" has to become *absent*, not be passed through. wrangler
    // names the top-level environment by its absence — `wrangler.jsonc` has
    // exactly one `env` section, `staging` — so `environment: "production"`
    // resolves to nothing and dies with "No environment found in
    // configuration with name production". The previous version passed it
    // straight through, which meant the production path this very comment
    // advertises failed on its first line. See AGENTS.md, "The two
    // environment variables".
    const target = remoteTarget!;
    Object.assign(process.env, { NODE_ENV: "production" });
    if (target === "production") {
      delete process.env.CLOUDFLARE_ENV;
    } else {
      process.env.CLOUDFLARE_ENV = target;
    }
    console.log(`[migrate:velite] target: ${target} (remote)`);
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
  let postsRefreshed = 0;
  for (const post of posts) {
    const existing = await payload.find({
      collection: "posts",
      limit: 1,
      where: { slug: { equals: post.slug } },
    });
    if (existing.docs[0]) {
      if (!refreshContent || dryRun) continue;

      // Content-only update: leaves ownership, status and publish date
      // alone, so re-running this can't undo editorial changes made in the
      // admin or reassign a post away from its owner.
      await payload.update({
        collection: "posts",
        id: existing.docs[0].id,
        data: { content: await postContentFromRaw(payload, editorConfig, post) },
        overrideAccess: true,
      });
      postsRefreshed += 1;
      continue;
    }

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
        content: await postContentFromRaw(payload, editorConfig, post),
        _status: post.published ? "published" : "draft",
      },
    });
    postsCreated += 1;
  }

  let galleriesCreated = 0;
  let galleriesRefreshed = 0;
  let imageCount = 0;
  let videoCount = 0;
  const streamPending: string[] = [];

  for (const gallery of galleries) {
    const existing = await payload.find({
      collection: "galleries",
      limit: 1,
      where: { slug: { equals: gallery.slug } },
      depth: 0,
    });
    const existingGallery = existing.docs[0];

    // A gallery that already exists but has no videos: the original
    // migration ran with --skip-videos, so the images are right and only
    // the video list is missing. Fill just that in rather than skipping the
    // whole document (which is why the plain re-run added nothing).
    if (existingGallery) {
      const alreadyHasVideos = (existingGallery.videos ?? []).length > 0
      if (skipVideos || dryRun || alreadyHasVideos || !(gallery.videos ?? []).length) {
        continue;
      }

      const refreshedVideos: { media: number; videoId?: string }[] = [];
      for (const video of gallery.videos ?? []) {
        const mediaId = await ensureMediaFromUrl(
          payload,
          video.src,
          `${gallery.name} ${video.filename}`,
          { mimeType: video.mimeType ?? "video/mp4" },
        );
        if (!mediaId || mediaId <= 0) continue;

        let streamId: string | undefined;
        try {
          if (!withStream) throw new Error("Stream ingest disabled (--with-stream)");
          const streamVideo = await platform.env.STREAM.upload(video.src, {
            meta: { name: video.filename },
          });
          streamId = streamVideo.id;
          await payload.update({
            collection: "media",
            id: mediaId,
            data: { streamId, streamReady: streamVideo.readyToStream },
            overrideAccess: true,
          });
        } catch (error) {
          console.warn(`Stream ingest pending: ${video.src}`, error);
        }

        refreshedVideos.push({
          media: mediaId,
          videoId: video.id ?? videoIdFromFilename(video.filename),
        });
        videoCount += 1;
        if (!streamId) streamPending.push(video.src);
      }

      if (refreshedVideos.length) {
        await payload.update({
          collection: "galleries",
          id: existingGallery.id,
          data: { videos: refreshedVideos },
          overrideAccess: true,
        });
        galleriesRefreshed += 1;
      }
      continue;
    }

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
    for (const video of skipVideos ? [] : (gallery.videos ?? [])) {
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
          if (!withStream) throw new Error("Stream ingest disabled (--with-stream)");
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
    postsRefreshed,
    galleries: galleriesCreated,
    galleriesRefreshed,
    images: imageCount,
    videos: videoCount,
    streamPending: streamPending.length,
    inlineImagesConverted,
    inlineImagesUnresolved,
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

main()
  .then(() => {
    // Booting Payload from the CLI leaves something on the event loop, so a
    // script that has finished its work still never returns — it prints its
    // success line and sits there, which looks exactly like a hang. AGENTS.md
    // records the ten minutes that cost. Now that CI runs this as a step, a
    // missing exit would burn the job's whole timeout instead.
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

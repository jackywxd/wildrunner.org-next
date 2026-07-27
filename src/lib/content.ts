import type {
  Author,
  Gallery,
  Media,
  Post,
  Site as SiteGlobal,
} from "@/payload-types";
import { mediaDimensions, mediaImageSrc } from "@/lib/cf-image";
import type {
  SiteGallery,
  SiteGlobals,
  SitePhoto,
  SitePost,
  SiteVideo,
} from "@/lib/content-types";
import { postSlugParams } from "@/lib/content-paths";
import { getPayloadClient } from "@/lib/payload";
import { videoIdFromFilename } from "@/lib/videoId";

function isMedia(value: unknown): value is Media {
  return Boolean(value && typeof value === "object" && "url" in value);
}

function isAuthor(value: unknown): value is Author {
  return Boolean(value && typeof value === "object" && "name" in value);
}

export function mapMediaToSiteImage(media: Media | null | undefined) {
  const src = mediaImageSrc(media);
  if (!src) return undefined;
  const { width, height } = mediaDimensions(media);
  return { src, width, height };
}

function mapMediaToPhoto(
  media: Media,
  featured: boolean,
): SitePhoto | null {
  const src = mediaImageSrc(media);
  if (!src) return null;
  const { width, height } = mediaDimensions(media);
  const filename = media.filename ?? src.split("/").pop() ?? "image";
  return {
    filename,
    src,
    slug: src,
    featured,
    width,
    height,
    blurDataURL: media.blurDataURL ?? undefined,
    blurWidth: 20,
    blurHeight: Math.max(1, Math.round((height / width) * 20)),
  };
}

function mapGalleryVideo(
  media: Media,
  videoId?: string | null,
): SiteVideo | null {
  const src = mediaImageSrc(media);
  if (!src) return null;
  const filename = media.filename ?? "video";
  const id = videoId?.trim() || videoIdFromFilename(filename);
  return {
    mediaId: media.id,
    id,
    filename,
    src,
    slug: filename,
    mimeType: media.mimeType ?? "video/mp4",
    size: media.filesize ?? undefined,
    extension: filename.includes(".")
      ? filename.split(".").pop()!
      : undefined,
    streamId: media.streamId,
    streamReady: Boolean(media.streamReady),
  };
}

export function mapPayloadGallery(doc: Gallery): SiteGallery {
  const images: SitePhoto[] = [];
  const featuredStems: string[] = [];

  for (const row of doc.images ?? []) {
    const media = row.media;
    if (!isMedia(media)) continue;
    const photo = mapMediaToPhoto(media, Boolean(row.featured));
    if (!photo) continue;
    images.push(photo);
    if (row.featured) {
      featuredStems.push(photo.filename.replace(/\.[^.]+$/, ""));
    }
  }

  const videos: SiteVideo[] = [];
  for (const row of doc.videos ?? []) {
    const media = row.media;
    if (!isMedia(media)) continue;
    const video = mapGalleryVideo(media, row.videoId);
    if (video) videos.push(video);
  }

  const coverMedia = isMedia(doc.cover) ? doc.cover : undefined;

  return {
    slug: doc.slug,
    name: doc.name,
    location: doc.location,
    created: doc.createdAt,
    eventDate: doc.eventDate,
    isFeatured: Boolean(doc.featured),
    featured: featuredStems,
    cover: coverMedia ? mapMediaToSiteImage(coverMedia) : null,
    images,
    videos,
  };
}

export function mapPayloadPost(doc: Post): SitePost {
  const author = isAuthor(doc.author) ? doc.author : undefined;
  const imageMedia = isMedia(doc.image) ? doc.image : undefined;
  const params = postSlugParams(doc.slug);

  return {
    id: doc.id,
    title: doc.title,
    slug: doc.slug,
    slugAsParams: params,
    description: doc.description,
    date: doc.publishedAt ?? doc.createdAt,
    published: doc._status === "published",
    featured: Boolean(doc.featured),
    author: author?.name,
    authorSlug: author?.slug,
    image: imageMedia ? mapMediaToSiteImage(imageMedia) : undefined,
    content: doc.content,
  };
}

export function mapSiteGlobal(doc: SiteGlobal): SiteGlobals {
  return {
    heroTitleEn: doc.heroTitleEn ?? "Run wild, run free",
    heroTitleZh: doc.heroTitleZh ?? "心如野馬，馳騁天下",
    metadata: {
      titleDefault: doc.metadata?.titleDefault ?? "野馬營",
      titleTemplate: doc.metadata?.titleTemplate ?? "%s | 野馬營",
      description: doc.metadata?.description ?? "",
    },
    social: {
      github: doc.social?.github,
    },
    topNavItems: doc.topNavItems ?? [],
  };
}

const defaultGlobals: SiteGlobals = {
  heroTitleEn: "Run wild, run free",
  heroTitleZh: "心如野馬，馳騁天下",
  metadata: {
    titleDefault: "野馬營",
    titleTemplate: "%s | 野馬營",
    description: "",
  },
  social: {},
  topNavItems: [
    { label: "文章", href: "/posts", icon: "rss" },
    { label: "相册", href: "/gallery", icon: "image" },
    { label: "关于", href: "/about", icon: "about" },
  ],
};

export async function getSiteGlobals(): Promise<SiteGlobals> {
  const payload = await getPayloadClient();
  const site = await payload.findGlobal({
    slug: "site",
    depth: 0,
  });
  return site ? mapSiteGlobal(site) : defaultGlobals;
}

export async function getPublishedPosts(): Promise<SitePost[]> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "posts",
    depth: 2,
    limit: 500,
    sort: "-publishedAt",
    where: {
      _status: {
        equals: "published",
      },
    },
  });
  return result.docs.map(mapPayloadPost);
}

export async function getPostBySlugParam(
  slugParam: string,
): Promise<SitePost | null> {
  const payload = await getPayloadClient();
  const attempts = [
    slugParam,
    `posts/${slugParam}`,
    slugParam.replace(/^posts\//, ""),
  ];

  for (const slug of attempts) {
    const result = await payload.find({
      collection: "posts",
      depth: 2,
      limit: 1,
      where: {
        and: [
          { slug: { equals: slug } },
          { _status: { equals: "published" } },
        ],
      },
    });
    if (result.docs[0]) {
      return mapPayloadPost(result.docs[0]);
    }
  }
  return null;
}

export async function getPublishedPostSlugs(): Promise<string[]> {
  const posts = await getPublishedPosts();
  return posts.map((p) => p.slugAsParams);
}

export async function getPublishedGalleries(): Promise<SiteGallery[]> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "galleries",
    depth: 2,
    limit: 200,
    sort: "-createdAt",
    where: {
      _status: {
        equals: "published",
      },
    },
  });
  return result.docs.map(mapPayloadGallery);
}

export async function getGalleryBySlug(
  slug: string,
): Promise<SiteGallery | null> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "galleries",
    depth: 2,
    limit: 1,
    where: {
      and: [{ slug: { equals: slug } }, { _status: { equals: "published" } }],
    },
  });
  const doc = result.docs[0];
  return doc ? mapPayloadGallery(doc) : null;
}

export function getGalleryVideo(
  gallery: SiteGallery,
  videoId: string,
): { gallery: SiteGallery; video: SiteVideo } | undefined {
  const decoded = decodeURIComponent(videoId);
  const video = gallery.videos.find(
    (v) => v.id === decoded || v.id === videoId,
  );
  if (!video) return undefined;
  return { gallery, video };
}

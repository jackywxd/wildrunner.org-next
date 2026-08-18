import type { Media, Post } from "@/payload-types";
import { mediaImageSrc } from "@/lib/cf-image";
import type { SitePost } from "@/lib/content-types";

/**
 * What a post's social card points at, in three steps: its own cover image,
 * then the first picture in its body, then a generated card.
 *
 * The middle step exists because the member editor has never exposed the
 * top-level `image` field — grep `PostEditor.tsx` for it and there is
 * nothing. Every post written through the members area (and everything the
 * MDX importer creates) therefore has no cover, and fell all the way to the
 * flat generated card even when the article was full of photographs. The 15
 * Velite-era imports all carry `image`, which is why this went unnoticed:
 * measured 2026-08-18, 9 of 9 published posts had one, so step two and three
 * had no subjects at all until members started writing.
 *
 * DELIBERATELY NOT IN `mapPayloadPost`. `SitePost.image` is rendered as a
 * cover *on the article page itself* (posts/[...slug]/page.tsx), so deriving
 * a fallback into that field would make the first body picture appear twice
 * — once as the header image, once again in the body where the author put
 * it. The fallback belongs to `generateMetadata` and nowhere else.
 */

/** Only the fields this walk needs; `content` is loosely-typed JSON. */
type ContentNode = {
  type?: string;
  value?: unknown;
  children?: ContentNode[];
};

/**
 * The first *image* in the body, in document order.
 *
 * Videos are skipped rather than treated as pictures: `media` holds 23 of
 * them (22 `video/mp4` + 1 `video/quicktime`, measured 2026-08-18), a member
 * can embed one anywhere in a post, and handing a crawler an mp4 as
 * `og:image` produces a broken card rather than a video preview.
 *
 * Reads `node.value` as a populated document, which it is: the detail query
 * (`getPostBySlugParam`) runs at `depth: 1`, and Payload's `UploadFeature`
 * replaces every upload node's `value` with the whole Media document at that
 * depth. Verified against the live site rather than assumed — a post with
 * body images ships 15 `<img>` tags and 142 CDN references, which the public
 * `upload` converter could not produce from a bare id. An upload whose media
 * did not come back populated is skipped, not treated as the answer.
 */
export function firstContentImageSrc(
  content: Post["content"] | undefined,
): string | undefined {
  const root = (content as { root?: ContentNode } | null | undefined)?.root;
  return root ? findFirstImage(root) : undefined;
}

function findFirstImage(node: ContentNode): string | undefined {
  if (node.type === "upload") {
    const media = node.value;
    if (media && typeof media === "object") {
      const doc = media as Media;
      if (doc.mimeType?.startsWith("image/")) {
        const src = mediaImageSrc(doc);
        if (src) return src;
      }
    }
    // Falls through to the sibling scan below: an upload that is a video, or
    // one whose media is missing, is not a reason to stop looking.
  }

  for (const child of node.children ?? []) {
    const found = findFirstImage(child);
    if (found) return found;
  }
  return undefined;
}

/**
 * `mediaImageSrc` strips our own origin, so media served from this site
 * comes back as a path. A crawler reading `og:image` has no page context to
 * resolve that against, so every candidate is absolutised here.
 */
export function absoluteImageUrl(src: string, baseURL: string): string {
  if (/^https?:\/\//i.test(src)) return src;
  const origin = baseURL.replace(/\/$/, "");
  return `${origin}${src.startsWith("/") ? src : `/${src}`}`;
}

/**
 * The generated card, for a post with no picture anywhere.
 *
 * `seed` is the post slug, and it only varies the colours — see the `/og`
 * route. Passing the slug rather than the title means a retitled post keeps
 * the card it has been shared with.
 */
export function rainbowOgUrl(opts: {
  baseURL: string;
  title: string;
  author?: string;
  seed: string;
}): string {
  const params = new URLSearchParams();
  // The route splits `title|author` back apart on the last `|`; keeping that
  // convention here means the rainbow card and the plain card lay out their
  // headline and byline identically.
  params.set("title", `${opts.title}|${opts.author ?? ""}`);
  params.set("variant", "rainbow");
  params.set("seed", opts.seed);
  return `${opts.baseURL.replace(/\/$/, "")}/og?${params.toString()}`;
}

/** The whole chain, as `generateMetadata` wants it. */
export function resolvePostOgImage(
  post: Pick<SitePost, "image" | "content" | "slug" | "title" | "author">,
  baseURL: string,
): string {
  if (post.image?.src) return absoluteImageUrl(post.image.src, baseURL);

  const bodyImage = firstContentImageSrc(post.content);
  if (bodyImage) return absoluteImageUrl(bodyImage, baseURL);

  return rainbowOgUrl({
    author: post.author,
    baseURL,
    seed: post.slug,
    title: post.title,
  });
}

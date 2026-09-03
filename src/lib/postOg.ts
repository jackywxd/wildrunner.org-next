import type { Media, Post } from "@/payload-types";
import { mediaImageSrc } from "@/lib/cf-image";
import { absoluteImageUrl, type OgCard } from "@/lib/og-card";
import type { SitePost } from "@/lib/content-types";

export { absoluteImageUrl };

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
 * them (22 `video/mp4` + 1 `video/quicktime`, measured 2026-08-18), one can
 * sit anywhere in a post body, and handing a crawler an mp4 as `og:image`
 * produces a broken card rather than a video preview.
 *
 * "A member can embed one" is what this used to say, and it was not true —
 * the member editor filters every insertion route to `image/*`
 * (ImageInsertPlugin.tsx). A video reaches `posts.content` from /admin, whose
 * editor has Payload's unrestricted `UploadFeature`, or from a hand-built
 * write to /api/posts, which `guardPostContent` allows because it checks only
 * that the node's `value` is an id. The skip below is right either way, and
 * more load-bearing since the public `upload` converter started rendering
 * those videos as players instead of broken images.
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
 * The whole chain, as `generateMetadata` wants it.
 *
 * A CARD, NOT A URL, since #143. It used to return the finished `og:image`
 * string, which meant the caller could not tell a photograph from a generated
 * card — and `pageMetadata` needs to know, because the two take different
 * routes to a URL. Returning the decision instead of its result also puts the
 * ladder itself in one readable place.
 */
export function resolvePostOgCard(
  post: Pick<SitePost, "image" | "content" | "slug" | "title" | "author">,
): OgCard {
  if (post.image?.src) return { kind: "photo", src: post.image.src };

  const bodyImage = firstContentImageSrc(post.content);
  if (bodyImage) return { kind: "photo", src: bodyImage };

  // The slug, not the title: a retitled post keeps the card it was already
  // shared with. `rainbowOgUrl` used to build the URL here; the byline it
  // carried is now `pageMetadata`'s `subtitle`, which every card gets.
  return { kind: "rainbow", seed: post.slug };
}

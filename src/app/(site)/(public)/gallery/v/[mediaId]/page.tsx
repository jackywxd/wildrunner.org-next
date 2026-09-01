import { permanentRedirect } from "next/navigation";

/**
 * Compatibility redirect for the old video-only share URL.
 *
 * `/gallery/v/[mediaId]` used to be the page itself; it is now
 * `/gallery/m/[mediaId]`, which serves photos too. This route stays only for
 * links already shared or indexed under the old path — nothing new should
 * point here (see GalleryVideos.tsx's shareHref, which points at /gallery/m/
 * directly). Id validation is not duplicated here: an invalid id just
 * redirects to a target that 404s on its own.
 */

export const dynamic = "force-dynamic";

export default async function GalleryVideoByIdRedirect({
  params,
}: {
  params: Promise<{ mediaId: string }>;
}) {
  const { mediaId } = await params;
  permanentRedirect(`/gallery/m/${mediaId}`);
}

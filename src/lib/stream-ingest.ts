import type { PayloadRequest } from "payload";
import { getCloudflareContext } from "@opennextjs/cloudflare";

type IngestArgs = {
  mediaId: number | string;
  filename?: string;
  url?: string;
  req: PayloadRequest;
};

/**
 * Copy R2 video object into Cloudflare Stream when API credentials are configured.
 * Returns Stream UID or null when skipped / pending.
 */
export async function ingestVideoToStream(
  args: IngestArgs,
): Promise<{ id: string; readyToStream: boolean } | null> {
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.STREAM_INGEST_IN_DEV !== "true"
  ) {
    return null;
  }

  const source = args.url?.trim();
  if (!source) {
    return null;
  }

  const sourceUrl = source.startsWith("http")
    ? source
    : new URL(source, process.env.NEXT_PUBLIC_SITE_URL).toString();

  return ingestSourceVideo(sourceUrl, args.filename);
}

export async function ingestSourceVideo(
  sourceUrl: string,
  filename?: string,
): Promise<{ id: string; readyToStream: boolean } | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const video = await env.STREAM.upload(sourceUrl, {
      meta: { name: filename ?? "wildrunner-video" },
    });
    return { id: video.id, readyToStream: video.readyToStream };
  } catch (error) {
    console.warn("Stream ingest error", error);
    return null;
  }
}

export async function refreshStreamReady(
  mediaId: number,
  streamId: string,
): Promise<boolean> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const video = await env.STREAM.video(streamId).details();
    if (video.readyToStream) {
      const { getPayloadClient } = await import("@/lib/payload");
      const payload = await getPayloadClient();
      await payload.update({
        collection: "media",
        id: mediaId,
        data: { streamReady: true },
        overrideAccess: true,
      });
    }
    return video.readyToStream;
  } catch (error) {
    console.warn("Stream status refresh error", error);
    return false;
  }
}

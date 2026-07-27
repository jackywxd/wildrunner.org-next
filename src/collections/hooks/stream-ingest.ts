import type { CollectionAfterChangeHook } from "payload";

import { ingestVideoToStream } from "@/lib/stream-ingest";

export const streamIngestOnUpload: CollectionAfterChangeHook = async ({
  doc,
  req,
  operation,
}) => {
  if (req.context.skipStreamIngest) return doc;
  if (operation !== "create" && operation !== "update") return doc;
  const mime = doc.mimeType as string | undefined;
  if (!mime?.startsWith("video/")) return doc;
  if (doc.streamId) return doc;

  const stream = await ingestVideoToStream({
    mediaId: doc.id,
    filename: doc.filename as string | undefined,
    url: doc.url as string | undefined,
    req,
  });

  if (!stream) return doc;

  await req.payload.update({
    collection: "media",
    id: doc.id,
    data: {
      streamId: stream.id,
      streamReady: stream.readyToStream,
    },
    req,
  });

  return {
    ...doc,
    streamId: stream.id,
    streamReady: stream.readyToStream,
  };
};

const STREAM_CUSTOMER =
  process.env.NEXT_PUBLIC_CF_STREAM_CUSTOMER_CODE?.trim() || "";

/** HLS / iframe embed for Cloudflare Stream when `streamId` is set. */
export function streamIframeSrc(streamId?: string | null): string | null {
  if (!streamId?.trim()) return null;
  const id = streamId.trim();
  if (STREAM_CUSTOMER) {
    return `https://customer-${STREAM_CUSTOMER}.cloudflarestream.com/${id}/iframe`;
  }
  return `https://iframe.cloudflarestream.com/${id}`;
}

export function streamHlsUrl(streamId?: string | null): string | null {
  if (!streamId?.trim()) return null;
  const id = streamId.trim();
  if (STREAM_CUSTOMER) {
    return `https://customer-${STREAM_CUSTOMER}.cloudflarestream.com/${id}/manifest/video.m3u8`;
  }
  return `https://videodelivery.net/${id}/manifest/video.m3u8`;
}

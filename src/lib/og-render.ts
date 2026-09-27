/**
 * What every share-card route does around its own drawing: load the face,
 * and hand the PNG back whole. `/og` and `/og/timeline` both need exactly
 * this, and a route module can export nothing but its handlers.
 */

export async function loadOgFont(request: Request): Promise<ArrayBuffer | null> {
  try {
    // Serve from public/ so the font is available via Workers Assets in production
    // and via Next static files in local `next dev`.
    const fontUrl = new URL("/fonts/Inter-Regular.ttf", request.url);
    const res = await fetch(fontUrl);
    if (!res.ok) {
      console.warn(`OG font fetch failed: ${res.status} ${fontUrl.href}`);
      return null;
    }
    return res.arrayBuffer();
  } catch (error) {
    console.warn("OG font load error:", error);
    return null;
  }
}

/**
 * Buffered rather than returned straight through.
 *
 * `ImageResponse` is a streaming Response and it renders lazily: satori
 * builds an SVG, then a rasteriser turns it into PNG. Anything that throws
 * in there throws *after* the headers are on the wire, so Next logs
 * `failed to pipe response` and the client sees a reset connection — no
 * status, no body, nothing to act on. That is how `/og` presented for this
 * entire investigation: an error whose only description was a rasteriser
 * complaining about an input we could not see, intermittent, and invisible
 * to every guard added upstream of it. Reading the body here moves the
 * failure somewhere it can be caught, named in the log with its cause, and
 * answered with a real HTTP status.
 */
export async function bufferOgImage(image: Response): Promise<Response> {
  try {
    const body = await image.arrayBuffer();
    return new Response(body, { headers: image.headers });
  } catch (error) {
    const cause = (error as { cause?: unknown })?.cause;
    console.error(
      `OG render failed: ${error instanceof Error ? error.message : String(error)}` +
        `${cause ? ` | cause: ${cause instanceof Error ? cause.message : String(cause)}` : ""}` +
        `${error instanceof Error && error.stack ? `\n${error.stack}` : ""}`,
    );
    return new Response("OG image unavailable", {
      status: 500,
      headers: { "content-type": "text/plain", "cache-control": "no-store" },
    });
  }
}

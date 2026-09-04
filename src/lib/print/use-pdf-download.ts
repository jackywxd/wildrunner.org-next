"use client";

import { useState } from "react";

import { filenameFromDisposition } from "@/lib/print/filename";

/**
 * "Give me this page as a PDF file", for any page that has a PDF endpoint.
 *
 * SHARED BY THE ARTICLE AND 穿越時光, and what is shared is the behaviour
 * rather than the button. Neither page's control looks like the other's — the
 * print page is neutral paper-styled chrome, the timeline uses the site's own
 * tokens — but every non-obvious thing about pressing it is identical, and
 * none of it is obvious:
 *
 *   - **A fetch, not a link.** `<a download>` would be one line, but Browser
 *     Rendering is absent everywhere except a deploy — in dev and CI the
 *     endpoint answers 503 — and a link turns that into a page of JSON in a
 *     new tab. Reading the response is what lets the reader be told, where
 *     they pressed, that this environment has no renderer.
 *   - **A visible wait.** A long article is tens of seconds of browser time,
 *     and a button that looks idle for that long reads as broken.
 *   - **A name from the response**, so the server stays the only place that
 *     decides what the file is called.
 *   - **The object URL released on a later task**, never in the same one as
 *     the click.
 *
 * Two copies of that would drift, and the half that drifts is always the
 * failure path — the half nobody looks at until it is the only thing on
 * screen. The markup stays at the call sites, which is also what keeps every
 * `data-testid` a literal string `pnpm assert:schema-screen` can find.
 */
export function usePdfDownload(href: string) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setDownloading(true);
    setError(null);
    try {
      const response = await fetch(href, { credentials: "same-origin" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "PDF 產生失敗，請稍後再試。");
        return;
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download =
        filenameFromDisposition(response.headers.get("Content-Disposition")) ??
        "";
      anchor.click();
      // Released on a later task, never in the same one as the click: the
      // download starts asynchronously, and a URL withdrawn before it begins
      // takes the file with it.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch {
      setError("PDF 產生失敗，請稍後再試。");
    } finally {
      setDownloading(false);
    }
  }

  return { download, downloading, error };
}

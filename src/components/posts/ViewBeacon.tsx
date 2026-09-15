"use client";

import { useEffect } from "react";

import { shouldReportView } from "@/lib/posts/view-beacon-key";

/**
 * Tells the server this article was read, once per browser session.
 *
 * WHY THE BROWSER REPORTS THIS AT ALL. The article page is prerendered into
 * the R2 incremental cache, so a cache hit serves bytes without running any
 * application code — a counter in the page component would count edits, not
 * readers. `src/endpoints/recordPostView.ts` has the longer version.
 *
 * RENDERS NOTHING. It is mounted for its effect, which also means it never
 * shifts the layout of the article it is measuring.
 *
 * `keepalive` SO THE REPORT SURVIVES THE READER LEAVING. Without it a browser
 * may cancel an in-flight fetch on navigation, which would systematically
 * under-count exactly the readers who bounce — the ones an author most wants
 * to know about. `sendBeacon` would do the same job but cannot be pointed at a
 * POST with no body on every browser, and this endpoint wants neither a body
 * nor a content type.
 *
 * FAILURE IS SILENT, ON PURPOSE. A view count is not worth an error in a
 * reader's console, and `e2e/helpers/test.ts` fails any spec whose page logs
 * one — so a network blip here would turn into a red article spec that has
 * nothing to do with articles.
 */
export function ViewBeacon({ postId }: { postId: number }) {
  useEffect(() => {
    // `window.sessionStorage` is the throwing access, so it happens inside the
    // helper's try rather than here.
    let storage: Storage | null = null;
    try {
      storage = window.sessionStorage;
    } catch {
      storage = null;
    }

    if (!shouldReportView(storage, postId)) return;

    void fetch(`/api/posts/${postId}/view`, {
      method: "post",
      keepalive: true,
    }).catch(() => {
      /* a read nobody counted is not worth telling the reader about */
    });
  }, [postId]);

  return null;
}

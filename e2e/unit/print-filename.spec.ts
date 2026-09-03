import { expect, test } from "@playwright/test";

import {
  contentDisposition,
  filenameFromDisposition,
  pdfFilename,
} from "@/lib/print/filename";

/**
 * U-PDFNAME — what the downloaded article is called.
 *
 * THIS EXISTS BECAUSE THE FIRST REAL PDF OFF THIS ROUTE WAS CALLED
 * `wildrunner.org_print_posts_untitled1788141898685.pdf`. Every title in this
 * corpus is Traditional Chinese and a `Content-Disposition` header may not
 * carry a non-ASCII byte, so getting the name right is entirely about the
 * RFC 5987 `filename*` half — which is also the half no route test can see,
 * since a browser only ever shows you the file it saved.
 *
 * The second claim here is not about names at all. Post titles are written by
 * members, and a header ends at a CRLF: a title carrying one would let its
 * author append headers of their own to every download of that article.
 */

test.describe("U-PDFNAME the downloaded article's filename", () => {
  test("U-PDFNAME-1: a Chinese title survives, and the ASCII half is still usable", () => {
    const header = contentDisposition(pdfFilename("野馬營 2024 UTMB 賽記"));

    // The half every browser since IE11 actually reads.
    expect(header).toContain(
      "filename*=UTF-8''%E9%87%8E%E9%A6%AC%E7%87%9F%202024%20UTMB%20%E8%B3%BD%E8%A8%98.pdf",
    );
    // ...and the half for anything that does not. Stripping this title to
    // ASCII leaves "2024 UTMB .pdf", which is a name — the fallback is for
    // titles that strip to nothing at all.
    expect(header).toContain('filename="2024 UTMB .pdf"');

    expect(contentDisposition(pdfFilename("野馬營"))).toContain(
      'filename="wildrunner-article.pdf"',
    );
  });

  test("U-PDFNAME-2: a title cannot inject a header", () => {
    // What a member could type into the title field. Both halves of the
    // header are built from the cleaned name, so neither can carry it.
    const header = contentDisposition(
      pdfFilename('壞\r\nX-Injected: yes\r\n"quoted"/slashed'),
    );

    expect(header).not.toContain("\r");
    expect(header).not.toContain("\n");
    // The colon goes with the control characters — a filesystem refuses it
    // too — so what is left cannot be read as a header field at all.
    expect(header).not.toContain("X-Injected:");
    // The quoted half is what a bare `"` would end early. Exactly the two
    // this code opened and closed.
    expect(header.match(/"/g)).toHaveLength(2);
    // The words survive; only the characters that are punctuation to a header
    // or a filesystem are dropped.
    expect(pdfFilename('壞\r\n"quoted"/slashed')).toBe("壞 quoted slashed.pdf");
  });

  test("U-PDFNAME-3: the client reads back exactly what the server chose", () => {
    // The download button has a blob, which has no name; it takes one from
    // this header. A round trip that loses anything means a member saves a
    // file called something the server did not pick.
    for (const title of [
      "野馬營 2024 UTMB 賽記",
      "It's a (long) run *really*",
      "野馬營",
    ]) {
      const name = pdfFilename(title);
      expect(filenameFromDisposition(contentDisposition(name))).toBe(name);
    }

    // RFC 5987's attr-char set excludes these four, and `encodeURIComponent`
    // leaves them alone — so they are encoded by hand and a strict parser
    // still gets a value it accepts.
    expect(contentDisposition("it's (a) *run*.pdf")).toContain(
      "filename*=UTF-8''it%27s%20%28a%29%20%2Arun%2A.pdf",
    );

    // A header we did not write is not guessed at: the caller lets the
    // browser name the file rather than inventing one.
    expect(filenameFromDisposition(null)).toBeNull();
    expect(filenameFromDisposition("attachment")).toBeNull();
  });
});

/**
 * What the downloaded PDF is called.
 *
 * THE FILENAME IS THE WHOLE POINT OF THE HEADER, and it is not a Latin string.
 * Every title in this corpus is Traditional Chinese, and a `Content-Disposition`
 * value may not carry a non-ASCII byte — so `filename="野馬營.pdf"` either
 * arrives mangled or is dropped, and the browser names the file after the URL
 * instead. That is the same failure the first real print off this route
 * produced from the other direction: the print page had no `<title>`, so
 * Chrome's own "Save as PDF" wrote `wildrunner.org_print_posts_untitled…pdf`.
 *
 * RFC 5987/6266 is the answer and it needs BOTH halves:
 *
 *   attachment; filename="wildrunner-article.pdf"; filename*=UTF-8''%E9%87%8E…
 *
 * `filename*` is what every browser since IE11 actually uses; the plain
 * `filename` exists for anything that does not understand the extended form,
 * which is why its value has to survive being stripped to ASCII rather than
 * becoming `.pdf`.
 *
 * THE SANITISING IS NOT COSMETIC. A response header is terminated by CRLF, so
 * a title carrying one would let whoever wrote that title append headers of
 * their own — and post titles are member-supplied. A quote ends the quoted
 * string the same way. Both are removed before either half is built, so
 * neither encoding path can carry them.
 *
 * Pure, so the unit lane exercises every rule with no route and no browser.
 */

/** Used when a title has nothing an ASCII-only client could keep. */
const FALLBACK = "wildrunner-article";

/**
 * The name a saved file should have.
 *
 * Control characters (CRLF among them), quotes and the path separators a
 * filesystem refuses collapse to a space rather than vanishing, so a title
 * that used one as a separator does not run together.
 */
export function pdfFilename(title: string): string {
  const cleaned = title
    .replace(/[\u0000-\u001f\u007f"\\/:*?<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${cleaned || FALLBACK}.pdf`;
}

/**
 * Percent-encode for RFC 5987's `ext-value`.
 *
 * `encodeURIComponent` is close but leaves `'`, `(`, `)` and `*` alone, and
 * none of those is an `attr-char` — a name containing one would produce a
 * header a strict parser is entitled to reject.
 */
const rfc5987 = (value: string) =>
  encodeURIComponent(value).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/** The whole `Content-Disposition` value, both halves. */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\u0020-\u007e]/g, "").trim();
  // A Chinese title strips to nothing but its extension, and here that is the
  // common case rather than an edge one.
  const plain = ascii === ".pdf" || ascii === "" ? `${FALLBACK}.pdf` : ascii;
  return `attachment; filename="${plain}"; filename*=UTF-8''${rfc5987(filename)}`;
}

/**
 * Read the name back out of the header.
 *
 * The download button fetches the PDF rather than following a link — it has to
 * be able to tell the member why nothing downloaded when the renderer is
 * unavailable — and a blob has no name of its own, so the client has to supply
 * one. Taking it from the response is what keeps the server the only place
 * that decides what the file is called.
 */
export function filenameFromDisposition(header: string | null): string | null {
  const extended = header?.match(/filename\*=UTF-8''([^;]+)/i);
  if (extended) {
    try {
      return decodeURIComponent(extended[1]);
    } catch {
      // A header we did not write, or one mangled in transit. The caller then
      // lets the browser name the file itself rather than inventing one.
      return null;
    }
  }
  return header?.match(/filename="([^"]*)"/i)?.[1] ?? null;
}

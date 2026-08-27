/**
 * The failure notice's body.
 *
 * Only the template is unit-tested. Whether the mail is actually delivered
 * is Resend's job, and whether it is *sent* depends on a real API key that
 * CI deliberately does not have — staging's `RESEND_API_KEY` is empty on
 * purpose (AGENTS.md), so a test asserting a send would be asserting the
 * absence of a key. What is ours, and what a member would see broken, is the
 * text: the name of their video and the link back to the media library.
 *
 * `@playwright/test` rather than `../helpers/test`: nothing here touches
 * `page`, and that helper's console-guard fixture depends on it.
 */
import { expect, test } from "@playwright/test";

import { transcodeFailedEmailHTML } from "@/lib/media/transcode-notify";

test.describe("U-NOTIFY the transcode failure notice", () => {
  test("U-NOTIFY-1: the notice names the video and links back to the library", () => {
    // Protects against the mail that says something failed without saying
    // what — which for a member who uploaded eight clips in one sitting is
    // indistinguishable from no mail at all.
    const html = transcodeFailedEmailHTML(
      "Mt Fuji 100 2025",
      "http://localhost:3000/members/media",
    );

    expect(html).toContain("Mt Fuji 100 2025");
    expect(html).toContain('href="http://localhost:3000/members/media"');
    // The original is kept, and saying so is the difference between "retry
    // this" and "your upload is gone".
    expect(html).toContain("原始檔案還在");
  });

  test("U-NOTIFY-3: the reason the container gave is in the message", () => {
    // "轉檔失敗" alone tells a member nothing to act on, and the reasons
    // differ in what they imply: a file ffmpeg cannot read is theirs to
    // re-export, while an instances-exceeded error means try again later and
    // says nothing about their video. Without the reason, both read the same.
    const html = transcodeFailedEmailHTML(
      "Mt Fuji 100",
      "https://wildrunner.org/members/media",
      "ffmpeg exited 1: moov atom not found",
    );

    expect(html).toContain("失敗原因");
    expect(html).toContain("moov atom not found");
  });

  test("U-NOTIFY-4: no reason means no empty block, and markup in one is escaped", () => {
    // An empty 失敗原因 heading over a blank box looks like the mail broke.
    // And the text is machine output from a file the member chose, so it is
    // not ours to trust as markup.
    const without = transcodeFailedEmailHTML("clip", "https://example.com/m");
    expect(without).not.toContain("失敗原因");

    const withMarkup = transcodeFailedEmailHTML(
      "clip",
      "https://example.com/m",
      "<script>alert(1)</script>",
    );
    expect(withMarkup).toContain("&lt;script&gt;");
    expect(withMarkup).not.toContain("<script>");
  });

  test("U-NOTIFY-2: a name carrying markup reaches the reader as text", () => {
    // Filenames are member-supplied and land in an HTML email. Without
    // escaping, `<` opens a tag in the recipient's mail client and takes the
    // rest of the sentence with it — the reader loses the name of the very
    // video the mail is about.
    const html = transcodeFailedEmailHTML(
      '<b>a & b" c</b>',
      "https://wildrunner.org/members/media",
    );

    expect(html).toContain("&lt;b&gt;a &amp; b&quot; c&lt;/b&gt;");
    expect(html).not.toContain("<b>");
  });
});

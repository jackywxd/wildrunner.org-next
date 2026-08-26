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

import { expect, test } from "@playwright/test";

import { soleYouTubeUrl, youTubeEmbedUrl, youTubeVideoId } from "@/lib/youtube";

/**
 * U-YT — the URL shapes a member might paste.
 *
 * A member pastes whatever the YouTube app gave them: a share link, a mobile
 * URL, a Shorts link, a watch URL with a timestamp and a playlist hanging off
 * it. Each has to resolve to the same eleven characters, and anything that is
 * not a YouTube video has to resolve to nothing — because the answer is fed
 * straight into an iframe `src`.
 *
 * This was previously covered by rendering a post and looking at the DOM,
 * which needs a server, a browser and a fixture per URL shape. It is a string
 * function.
 */
test.describe("U-YT youtube url parsing", () => {
  const ID = "dQw4w9WgXcQ";

  test("U-YT-1: every share shape a member might paste resolves to one id", () => {
    for (const url of [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtube.com/watch?v=${ID}`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://music.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/live/${ID}`,
      `https://www.youtube-nocookie.com/embed/${ID}`,
    ]) {
      expect(youTubeVideoId(url), url).toBe(ID);
    }
  });

  test("U-YT-2: the extra query parameters YouTube adds are ignored", () => {
    // What the share sheet actually produces: a timestamp, a playlist, a
    // referrer tag. The id is still the id.
    expect(youTubeVideoId(`https://www.youtube.com/watch?v=${ID}&t=42s`)).toBe(ID);
    expect(
      youTubeVideoId(`https://www.youtube.com/watch?v=${ID}&list=PL123&index=2`),
    ).toBe(ID);
    expect(youTubeVideoId(`https://youtu.be/${ID}?si=abcdef`)).toBe(ID);
  });

  test("U-YT-3: whitespace and http survive, because people paste both", () => {
    expect(youTubeVideoId(`  https://youtu.be/${ID}  `)).toBe(ID);
    // http is accepted on input; the embed built from it is always https.
    expect(youTubeVideoId(`http://www.youtube.com/watch?v=${ID}`)).toBe(ID);
  });

  test("U-YT-4: anything that is not a YouTube video resolves to null", () => {
    for (const url of [
      "https://vimeo.com/123456789",
      // A look-alike host. This is the case that decides whether an attacker
      // can choose the iframe's origin.
      `https://youtube.com.evil.example/watch?v=${ID}`,
      `javascript:alert(1)//youtube.com/watch?v=${ID}`,
      "https://www.youtube.com/watch?v=tooshort",
      "https://www.youtube.com/",
      "https://www.youtube.com/channel/UC123",
      "not a url at all",
      "",
    ]) {
      expect(youTubeVideoId(url), url).toBeNull();
    }
  });

  test("U-YT-5: the embed we build never points at the host that was pasted", () => {
    // youtube-nocookie regardless of input, and rebuilt from the id rather
    // than from the author's string — so no query parameter of theirs reaches
    // the iframe.
    expect(youTubeEmbedUrl(ID)).toBe(
      `https://www.youtube-nocookie.com/embed/${ID}`,
    );
  });
});

/**
 * The paragraph rule, which the public article page and the member's preview
 * now share. It had no test at all while it was a private function inside
 * `payload-rich-text.tsx` — moving it here is what made one possible.
 */
const paragraph = (...children: { type: string; text?: string }[]) => ({ children });
const textNode = (text: string) => ({ type: "text", text });

test.describe("U-YT-PARA a paragraph that is nothing but a YouTube URL", () => {
  test("U-YT-PARA-1: a lone URL becomes the video", () => {
    expect(soleYouTubeUrl(paragraph(textNode("https://youtu.be/dQw4w9WgXcQ")))).toBe(
      "dQw4w9WgXcQ",
    );
    // Split across text nodes, which is what typing rather than pasting
    // produces once a format mark lands mid-URL.
    expect(
      soleYouTubeUrl(paragraph(textNode("https://youtu.be/"), textNode("dQw4w9WgXcQ"))),
    ).toBe("dQw4w9WgXcQ");
  });

  test("U-YT-PARA-2: a sentence mentioning a video keeps its sentence", () => {
    // The strictness is the feature. Anything but the bare URL and the
    // paragraph renders as prose — otherwise a member's own words vanish.
    expect(
      soleYouTubeUrl(paragraph(textNode("看這個 https://youtu.be/dQw4w9WgXcQ"))),
    ).toBeNull();
    expect(soleYouTubeUrl(paragraph(textNode("")))).toBeNull();
    expect(soleYouTubeUrl({})).toBeNull();
  });

  test("U-YT-PARA-3: only a non-text child BETWEEN text disqualifies", () => {
    // Written the other way round first, asserting that any non-text sibling
    // disqualifies — which is what the function's comment claimed and not what
    // it does. `trim()` removes the space a leading or trailing child
    // contributed, so those still embed. Pinned as measured rather than as
    // intended, because "paste a URL, press shift+enter" is the common shape
    // and embedding it is the answer people want.
    const url = textNode("https://youtu.be/dQw4w9WgXcQ");
    expect(soleYouTubeUrl(paragraph(url, { type: "linebreak" }))).toBe("dQw4w9WgXcQ");
    expect(soleYouTubeUrl(paragraph({ type: "linebreak" }, url))).toBe("dQw4w9WgXcQ");

    // Split by something in the middle, and it is prose again.
    expect(
      soleYouTubeUrl(
        paragraph(textNode("https://youtu.be/"), { type: "linebreak" }, textNode("dQw4w9WgXcQ")),
      ),
    ).toBeNull();
  });

  test("U-YT-PARA-4: a URL that is not a video is left as a link", () => {
    expect(
      soleYouTubeUrl(paragraph(textNode("https://www.youtube.com/@someclub"))),
    ).toBeNull();
    expect(soleYouTubeUrl(paragraph(textNode("https://wildrunner.org/posts/x")))).toBeNull();
  });
});

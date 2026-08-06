import { expect, test } from "@playwright/test";

import { youTubeEmbedUrl, youTubeVideoId } from "@/lib/youtube";

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

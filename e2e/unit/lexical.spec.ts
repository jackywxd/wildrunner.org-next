import { expect, test } from "@playwright/test";

import { lexicalParagraph, paragraphsToLexical } from "@/lib/lexical-helpers";

/**
 * U-LEX — the shape the editor expects.
 *
 * These helpers build the Lexical document that the AI endpoint and every
 * fixture write straight into `posts.content`. A wrong shape does not throw:
 * Payload stores it, and the post renders blank. That is the failure being
 * bought here, and it is invisible from any assertion about text on a page.
 */
test.describe("U-LEX lexical helpers", () => {
  test("U-LEX-1: a paragraph is a well-formed root with the text inside it", () => {
    const doc = lexicalParagraph("野馬營") as {
      root: { type: string; children: { type: string; children: { text: string }[] }[] };
    };
    expect(doc.root.type).toBe("root");
    expect(doc.root.children).toHaveLength(1);
    expect(doc.root.children[0].type).toBe("paragraph");
    expect(doc.root.children[0].children[0].text).toBe("野馬營");
  });

  test("U-LEX-2: many paragraphs stay in order and stay separate", () => {
    const doc = paragraphsToLexical(["one", "two", "three"]) as {
      root: { children: { children: { text: string }[] }[] };
    };
    expect(doc.root.children).toHaveLength(3);
    expect(doc.root.children.map((p) => p.children[0].text)).toEqual([
      "one",
      "two",
      "three",
    ]);
  });

  test("U-LEX-3: an empty body is still a valid document", () => {
    // The AI endpoint can return nothing. A root with no children renders as
    // an empty post; a malformed root renders as a crash.
    const doc = paragraphsToLexical([]) as { root: { type: string; children: unknown[] } };
    expect(doc.root.type).toBe("root");
    expect(Array.isArray(doc.root.children)).toBe(true);
  });
});

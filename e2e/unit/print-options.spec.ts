import { expect, test } from "@playwright/test";

import {
  parsePrintOptions,
  printsPhotos,
  withoutUploads,
} from "@/lib/print/options";

/**
 * U-PRINT — what a printed article is, decided from two query parameters.
 *
 * The rule with consequences is the third template: `compact` is worth a menu
 * entry only because it drops the photographs, and it drops them by removing
 * the nodes rather than hiding them — so the images are never requested. On
 * the seeded corpus that is 111 uploads across 15 posts that a compact print
 * does not fetch.
 */

const doc = (children: unknown[]) =>
  ({ root: { type: "root", children } }) as never;

test.describe("U-PRINT the print page's two menus", () => {
  test("U-PRINT-1: each template brings its own face, and the font menu overrides it", () => {
    // The two menus are independent — somebody who wants a serif compact
    // print may have one — but each template still has an opinion.
    expect(parsePrintOptions({ template: "magazine" })).toEqual({
      font: "serif",
      template: "magazine",
    });
    expect(parsePrintOptions({ template: "standard" })).toEqual({
      font: "sans",
      template: "standard",
    });
    expect(parsePrintOptions({ template: "compact", font: "serif" })).toEqual({
      font: "serif",
      template: "compact",
    });
  });

  test("U-PRINT-2: an unknown value prints the article rather than an error", () => {
    // Same rule as /api/gallery/wall's `parseArrangement`. A stale bookmark, a
    // hand-typed URL, or a template renamed later must still put the article
    // on paper — that is the page's job.
    expect(parsePrintOptions({ template: "broadsheet" })).toEqual({
      font: "sans",
      template: "standard",
    });
    expect(parsePrintOptions({ font: "comic" }).font).toBe("sans");
    expect(parsePrintOptions({})).toEqual({
      font: "sans",
      template: "standard",
    });
  });

  test("U-PRINT-3: a repeated parameter takes the first, not the array", () => {
    // `?template=a&template=b` arrives as an array. Without this it would
    // compare an array against the allowed list, miss, and silently fall back
    // — the right answer for the wrong reason, which stops being right the
    // day someone links `?font=serif&font=serif`.
    expect(
      parsePrintOptions({ template: ["magazine", "compact"] }).template,
    ).toBe("magazine");
    expect(parsePrintOptions({ font: ["serif"] }).font).toBe("serif");
  });

  test("U-PRINT-4: only compact leaves the photographs off the paper", () => {
    expect(printsPhotos("standard")).toBe(true);
    expect(printsPhotos("magazine")).toBe(true);
    expect(printsPhotos("compact")).toBe(false);
  });

  test("U-PRINT-5: the images are removed from the body, not hidden", () => {
    // `display: none` still fetches a `next/image`. Removing the node is what
    // makes a compact print cost nothing in photographs.
    const body = doc([
      { type: "paragraph", children: [{ type: "text", text: "跑完了。" }] },
      { type: "upload", value: 12, relationTo: "media" },
      { type: "paragraph", children: [{ type: "text", text: "很累。" }] },
    ]);

    const stripped = JSON.stringify(withoutUploads(body));
    expect(stripped).not.toContain("upload");
    // ...and the words either side survive, in order.
    expect(stripped.indexOf("跑完了")).toBeLessThan(stripped.indexOf("很累"));
  });

  test("U-PRINT-6: stripping copies, it never edits the post it was given", () => {
    // The body comes from a `React.cache`'d query and is shared with anything
    // else rendering that post in the same request — the article page itself,
    // when both run. Mutating it would take the images off the screen too.
    const body = doc([{ type: "upload", value: 1 }]);
    const before = JSON.stringify(body);
    withoutUploads(body);
    expect(JSON.stringify(body)).toBe(before);
  });

  test("U-PRINT-7: a post with no body is not an error", () => {
    expect(withoutUploads(undefined)).toBeUndefined();
  });
});

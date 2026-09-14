import { expect, test } from "@playwright/test";

import {
  IMAGE_WIDTHS,
  imageWidthClass,
  imageWidthOf,
  imageWidthSizes,
  withImageWidth,
} from "@/lib/editor/image-width";
import { roundTripPayloadContent } from "@/lib/editor/serialize";
import type { JsonNode, PayloadContent } from "@/lib/editor/serialize";

/**
 * U-IMGWIDTH — how wide a picture is, and what that costs to deliver.
 *
 * Two failures this pins down, and neither is visible on a screen.
 *
 * The first is the `sizes` attribute drifting from the class. The layout
 * would still look right while a phone downloaded the full-bleed file to
 * show it at 40% — the exact opposite of what the feature is for, and
 * nothing on the page would say so. The golden table below is there so a
 * change to one derivation without the other fails here.
 *
 * The second is the stored shape. The choice lives inside the upload node's
 * `fields`, which `roundTripPayloadContent` — the whole fidelity contract
 * between this editor and Payload — has to carry unchanged. If it did not,
 * every save would quietly reset every picture to full width.
 */

const upload = (fields: unknown): JsonNode => ({
  type: "upload",
  relationTo: "media",
  value: 7,
  version: 3,
  format: "",
  id: "6890c0ffee00000000000001",
  fields,
});

const document = (children: JsonNode[]): PayloadContent => ({
  root: { type: "root", format: "", indent: 0, version: 1, direction: "ltr", children },
});

// `textFormat` and `textStyle` are on every paragraph Lexical exports, so a
// fixture without them fails the round trip on the prose rather than on the
// picture — which is what the first draft of this spec did.
const paragraph = (text: string): JsonNode => ({
  type: "paragraph",
  format: "",
  indent: 0,
  version: 1,
  direction: "ltr",
  textFormat: 0,
  textStyle: "",
  children: [
    { type: "text", text, format: 0, style: "", mode: "normal", detail: 0, version: 1 },
  ],
});

test.describe("U-IMGWIDTH how wide a picture sits, and what it costs", () => {
  test("U-IMGWIDTH-1: everything written before this feature is full width", () => {
    // The three shapes real content actually carries.
    expect(imageWidthOf(undefined)).toBe("full");
    expect(imageWidthOf(null)).toBe("full");
    expect(imageWidthOf({})).toBe("full");

    // And a value this version does not know is still a picture that has to
    // draw, so it lands on the default rather than nowhere.
    expect(imageWidthOf({ width: "enormous" })).toBe("full");
    expect(imageWidthOf({ width: 0.5 })).toBe("full");
  });

  test("U-IMGWIDTH-2: the class and the sizes say the same thing", () => {
    // Golden, not derived in the test: deriving it here would re-implement
    // the thing under test and agree with any mistake it makes.
    const expected: Record<string, { className: string; sizes: string }> = {
      full: {
        className: "w-full",
        // The value the public converter has always declared. A picture at
        // the default must ask for exactly what it asked for before.
        sizes: "(min-width: 768px) 768px, 100vw",
      },
      medium: {
        // Full width on a phone on purpose — 60% of 375px is a thumbnail.
        className: "mx-auto w-full md:w-3/5",
        sizes: "(min-width: 768px) 461px, 100vw",
      },
      small: {
        className: "mx-auto w-3/5 md:w-2/5",
        sizes: "(min-width: 768px) 307px, 60vw",
      },
    };

    for (const width of IMAGE_WIDTHS) {
      expect(imageWidthClass(width), `${width} class`).toBe(expected[width].className);
      expect(imageWidthSizes(width), `${width} sizes`).toBe(expected[width].sizes);
    }
  });

  test("U-IMGWIDTH-3: the choice survives the round trip Payload and the editor share", () => {
    const content = document([
      paragraph("圖片前面"),
      upload({ width: "small" }),
      paragraph("圖片後面"),
    ]);

    // Deep equality is the contract — not "the key is still somewhere".
    expect(roundTripPayloadContent(content)).toEqual(content);
  });

  test("U-IMGWIDTH-4: a full-width picture stores nothing, so old posts stay byte-identical", () => {
    // Writing `"full"` would change every default image the first time its
    // post was saved, and `roundTripPayloadContent` compares whole documents.
    expect(withImageWidth(null, "full")).toBeUndefined();
    expect(withImageWidth({ width: "small" }, "full")).toBeUndefined();

    expect(withImageWidth(null, "medium")).toEqual({ width: "medium" });
    expect(withImageWidth({ width: "medium" }, "small")).toEqual({ width: "small" });

    // Anything else on the node is not ours to drop.
    expect(withImageWidth({ caption: "沙灘" }, "small")).toEqual({
      caption: "沙灘",
      width: "small",
    });
    expect(withImageWidth({ caption: "沙灘" }, "full")).toEqual({ caption: "沙灘" });
  });
});

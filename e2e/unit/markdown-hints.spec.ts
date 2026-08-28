import { expect, test } from "@playwright/test";

import {
  EXPECTED_TRANSFORMER_TALLY,
  MARKDOWN_HINTS,
} from "@/components/members/editor/MarkdownHints";
import { MEMBER_MARKDOWN_TRANSFORMERS } from "@/lib/editor/markdown-transformers";

/**
 * U-MDHINT — the hints under the editor describe the editor that exists.
 *
 * The hint list is hand-written, and hand-written documentation of a code
 * list rots. This is the mechanism that stops it: the transformer list and
 * the hints cannot drift without a red test.
 *
 * The failure being prevented is specific and quiet. Registering a
 * transformer whose syntax nobody documents leaves a working feature
 * invisible — the exact state this feature was built to fix. Removing one
 * while leaving its hint is worse: a member types `` ``` ``, gets a literal
 * backtick, and concludes the hints lie. `markdown-transformers.ts` already
 * carries the same rule about its own relationship to EDITOR_NODES.
 *
 * Asserting a tally rather than a total is deliberate. Swapping one
 * transformer for another of a different kind changes which syntax works
 * while leaving the count identical, and that is the change most likely to
 * slip through.
 */

test.describe("U-MDHINT markdown hints match the editor", () => {
  test("U-MDHINT-1: the transformer population is the one the hints were written against", () => {
    const tally: Record<string, number> = {};
    for (const transformer of MEMBER_MARKDOWN_TRANSFORMERS) {
      tally[transformer.type] = (tally[transformer.type] ?? 0) + 1;
    }

    // If this fails, a transformer was added or removed. Read
    // MarkdownHints.tsx's mapping comment, update the list if the change
    // added or removed a *syntax*, then update this tally.
    expect(tally).toEqual({ ...EXPECTED_TRANSFORMER_TALLY });
  });

  test("U-MDHINT-2: nothing the editor refuses is advertised", () => {
    // The three @lexical/markdown transformers this editor deliberately does
    // not register, by the syntax a member would type. A hint for any of
    // them would be teaching a shortcut that produces literal punctuation.
    const unsupported = ["```", "- [ ]", "- [x]", "=="];
    const advertised = MARKDOWN_HINTS.map((hint) => hint.syntax);

    for (const syntax of unsupported) {
      expect(advertised, `${syntax} is not registered in this editor`).not.toContain(syntax);
    }
  });

  test("U-MDHINT-3: every hint carries both halves", () => {
    // A hint with no label is a syntax nobody can act on, and one with no
    // syntax is a claim with no instruction. Cheap to assert, and the kind
    // of thing a hurried edit leaves behind.
    expect(MARKDOWN_HINTS.length).toBeGreaterThan(0);
    for (const hint of MARKDOWN_HINTS) {
      expect(hint.syntax.trim(), JSON.stringify(hint)).not.toBe("");
      expect(hint.label.trim(), JSON.stringify(hint)).not.toBe("");
    }
  });
});

"use client";

import { useState } from "react";

/**
 * What the editor already understands, said out loud.
 *
 * `MarkdownShortcutPlugin` has been registered with
 * `MEMBER_MARKDOWN_TRANSFORMERS` since the editor was built, so typing
 * `## ` really does make a heading — but nothing on screen has ever said
 * so, which makes a working feature indistinguishable from a missing one.
 *
 * EVERY LINE HERE MUST BE SOMETHING THAT WORKS. Listing syntax the editor
 * ignores is worse than listing nothing: a member who types ```` ``` ````
 * and gets a literal backtick learns that the hints lie, and stops reading
 * them. The three shortcuts @lexical/markdown offers that this editor
 * deliberately does *not* register — code blocks, checklists, highlight —
 * are absent for exactly that reason, and markdown-transformers.ts explains
 * why each is excluded.
 *
 * Kept in sync by `U-MDHINT` rather than by hope: that spec asserts the
 * shape of the transformer list, so adding or removing one fails CI until
 * somebody has looked at this file. The transformers module says the same
 * thing about its own relationship to EDITOR_NODES — "the two have to
 * agree, and a divergence should be visible in one place".
 */

export type MarkdownHint = {
  /** The literal a member types. */
  syntax: string;
  /** What it produces, in the site's own language. */
  label: string;
};

/**
 * Nine hints for thirteen transformers, and the difference is not an
 * oversight: bold, italic and bold-italic each ship a `*` and a `_` variant,
 * which are the same feature spelled two ways. Showing both spellings would
 * pad the list without teaching anything.
 *
 *   HEADING                                    -> # 標題
 *   UNORDERED_LIST                             -> - 項目
 *   ORDERED_LIST                               -> 1. 項目
 *   QUOTE                                      -> > 引言
 *   BOLD_STAR, BOLD_UNDERSCORE                 -> **粗體**
 *   ITALIC_STAR, ITALIC_UNDERSCORE             -> *斜體*
 *   BOLD_ITALIC_STAR, BOLD_ITALIC_UNDERSCORE   -> ***粗斜體***
 *   STRIKETHROUGH                              -> ~~刪除線~~
 *   INLINE_CODE                                -> `程式碼`
 *   MEMBER_LINK                                -> [文字](網址)
 */
export const MARKDOWN_HINTS: MarkdownHint[] = [
  { syntax: "# ", label: "標題（## 為次級標題）" },
  { syntax: "- ", label: "項目符號" },
  { syntax: "1. ", label: "編號清單" },
  { syntax: "> ", label: "引言" },
  { syntax: "**粗體**", label: "粗體" },
  { syntax: "*斜體*", label: "斜體" },
  { syntax: "***粗斜體***", label: "粗斜體" },
  { syntax: "~~刪除線~~", label: "刪除線" },
  { syntax: "`程式碼`", label: "行內程式碼" },
  { syntax: "[文字](網址)", label: "連結" },
];

/**
 * The transformer population these hints were written against.
 *
 * A tally by kind rather than a bare total, so that swapping one transformer
 * for another of a different kind — the change most likely to add or remove
 * a *syntax* — is caught even though the count is unchanged. `U-MDHINT`
 * asserts it.
 */
export const EXPECTED_TRANSFORMER_TALLY = {
  element: 4,
  "text-format": 8,
  "text-match": 1,
} as const;

export function MarkdownHints() {
  const [open, setOpen] = useState(false);

  return (
    <div className="text-xs text-foreground/50" data-testid="markdown-hints">
      <button
        type="button"
        data-testid="markdown-hints-toggle"
        onClick={() => setOpen((value) => !value)}
        className="hover:text-primary"
      >
        {open ? "收起 Markdown 語法" : "可以直接用 Markdown 語法輸入"}
      </button>

      {open && (
        <ul
          data-testid="markdown-hints-list"
          className="mt-2 flex flex-wrap gap-x-4 gap-y-1"
        >
          {MARKDOWN_HINTS.map((hint) => (
            <li key={hint.syntax} className="flex items-center gap-1.5">
              <code className="bg-secondary px-1 py-0.5 text-foreground/70">
                {hint.syntax}
              </code>
              <span>{hint.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

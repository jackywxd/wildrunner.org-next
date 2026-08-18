import type { PayloadContent } from "@/lib/editor/serialize";

/**
 * Every reason the converter could not carry something across exactly.
 * Each is surfaced to the member so a gap in the imported document has an
 * explanation instead of just being missing.
 */
export type ImportWarningCode =
  | "image-not-imported"
  | "image-embedded"
  | "image-embed-failed"
  | "unsupported-component"
  | "unsupported-syntax"
  | "unknown-code-language"
  | "code-block-not-editable"
  | "html-embedded"
  | "frontmatter-unparsed";

export type ImportWarning = {
  code: ImportWarningCode;
  message: string;
  /** The original text the warning is about, if it is short enough to show. */
  detail?: string;
};

export type ImportResult = {
  content: PayloadContent;
  description: string;
  /** ISO date string, or null when no frontmatter date parsed. */
  publishedAt: string | null;
  /** "" means: leave the field blank and let `derivePostSlug` fill it. */
  slug: string;
  title: string;
  warnings: ImportWarning[];
};

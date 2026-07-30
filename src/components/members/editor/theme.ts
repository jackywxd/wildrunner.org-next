import type { EditorThemeClasses } from "@payloadcms/richtext-lexical/lexical";

/**
 * Tailwind classes Lexical hangs on the nodes it renders. Border radius is
 * globally 0 in this design system (tailwind.config.ts), so nothing here
 * uses rounded-*.
 */
export const editorTheme: EditorThemeClasses = {
  paragraph: "mb-3 leading-relaxed",
  quote: "border-l-2 border-primary pl-4 my-4 text-foreground/70",
  heading: {
    h1: "font-heading text-3xl font-semibold mt-8 mb-3",
    h2: "font-heading text-2xl font-semibold mt-6 mb-2",
    h3: "font-heading text-xl font-semibold mt-5 mb-2",
    h4: "font-heading text-lg font-semibold mt-4 mb-2",
    h5: "font-heading text-base font-semibold mt-3 mb-1",
    h6: "font-heading text-sm font-semibold mt-3 mb-1",
  },
  list: {
    ul: "list-disc pl-6 mb-3 space-y-1",
    ol: "list-decimal pl-6 mb-3 space-y-1",
    listitem: "leading-relaxed",
    nested: {
      listitem: "list-none",
    },
  },
  link: "text-primary underline underline-offset-4",
  text: {
    bold: "font-semibold",
    italic: "italic",
    underline: "underline underline-offset-4",
    strikethrough: "line-through",
    code: "font-code bg-secondary px-1 py-0.5 text-[0.9em]",
  },
};

export function lexicalParagraph(text: string) {
  return {
    root: {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", text, version: 1 }],
          direction: null,
          format: "",
          indent: 0,
          version: 1,
        },
      ],
      direction: null,
      format: "",
      indent: 0,
      version: 1,
    },
  };
}

export function paragraphsToLexical(paragraphs: string[]) {
  return {
    root: {
      type: "root",
      children: paragraphs.map((text) => ({
        type: "paragraph",
        children: [{ type: "text", text, version: 1 }],
        direction: null,
        format: "",
        indent: 0,
        version: 1,
      })),
      direction: null,
      format: "",
      indent: 0,
      version: 1,
    },
  };
}

import type { PayloadContent } from "./serialize";

/**
 * The exact shape Lexical produces for an empty document, matching what
 * Payload's own editor writes for a blank `content` field. `content` is
 * `required: true` on Posts, so a newly created post needs a real value
 * rather than null.
 */
export function emptyContent(): PayloadContent {
  return {
    root: {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [],
          direction: null,
          format: "",
          indent: 0,
          version: 1,
          textFormat: 0,
          textStyle: "",
        },
      ],
      direction: null,
      format: "",
      indent: 0,
      version: 1,
    },
  };
}

import {
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  HEADING,
  INLINE_CODE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  ORDERED_LIST,
  QUOTE,
  STRIKETHROUGH,
  UNORDERED_LIST,
} from '@payloadcms/richtext-lexical/lexical/markdown'
import { $createTextNode } from '@payloadcms/richtext-lexical/lexical'

import { $createMemberLinkNode, $isMemberLinkNode, MemberLinkNode } from './nodes'

import type { Transformer, TextMatchTransformer } from '@payloadcms/richtext-lexical/lexical/markdown'
import type { LexicalNode } from '@payloadcms/richtext-lexical/lexical'

/**
 * The markdown shortcuts the member editor understands.
 *
 * Hand-picked rather than `TRANSFORMERS`, because a transformer declares the
 * node classes it needs in `dependencies` and the markdown plugin throws at
 * registration if one of them is not in the editor's node set. The stock
 * list pulls in four this editor deliberately does not register:
 *
 *   CODE       -> CodeNode      (no code block in the member editor)
 *   CHECK_LIST -> checked list items (not offered in the slash menu either)
 *   HIGHLIGHT  -> MarkNode
 *   LINK       -> @lexical/link's LinkNode, whose serialized shape is NOT
 *                 the one Payload stores (see link-node.ts) — replaced below
 *
 * Keeping this list next to EDITOR_NODES rather than inside the plugin is
 * deliberate: the two have to agree, and a divergence should be visible in
 * one place.
 */

/**
 * `[text](url)`, producing Payload's link shape instead of @lexical/link's.
 *
 * Modelled on @lexical/markdown's own LINK transformer, minus the title
 * support (Payload's `fields` has nowhere to put a title, so accepting the
 * syntax would silently drop it).
 */
const MEMBER_LINK: TextMatchTransformer = {
  dependencies: [MemberLinkNode],
  export: (node: LexicalNode) => {
    if (!$isMemberLinkNode(node)) return null
    return `[${node.getTextContent()}](${node.getFields().url})`
  },
  importRegExp: /\[([^[]+)\]\(([^()\s]+)\)/,
  regExp: /\[([^[]+)\]\(([^()\s]+)\)$/,
  replace: (textNode, match) => {
    const [, text, url] = match
    const link = $createMemberLinkNode({ linkType: 'custom', newTab: false, url })
    const child = $createTextNode(text)
    // Format carried over from the matched text so `**[bold](url)**` keeps
    // its bold rather than resetting inside the link.
    child.setFormat(textNode.getFormat())
    link.append(child)
    textNode.replace(link)
  },
  trigger: ')',
  type: 'text-match',
}

export const MEMBER_MARKDOWN_TRANSFORMERS: Transformer[] = [
  // Element transformers first: @lexical/markdown tries them in order, and a
  // text-format transformer would otherwise consume the `#` in `# heading`.
  HEADING,
  QUOTE,
  UNORDERED_LIST,
  ORDERED_LIST,
  MEMBER_LINK,
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  STRIKETHROUGH,
  INLINE_CODE,
]

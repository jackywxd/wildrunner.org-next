import { CodeBlock } from '@payloadcms/richtext-lexical'
import type { Block } from 'payload'

import { HtmlEmbedBlock } from '@/blocks/HtmlEmbedBlock'

/**
 * The blocks the rich-text editor registers, as one list both the config and
 * the tests read.
 *
 * WHY THIS IS NOT JUST INLINE IN `payload.config.ts`. The MDX importer emits
 * `{type: 'block', fields: {blockType: 'Code'}}` for every fenced code block,
 * and nothing connected that string to the list of blocks actually
 * registered. `U-MDX-17` looked like it covered this — "every emitted node
 * type is one the member editor recognizes" — but it compares the node's
 * `type`, which is the literal `'block'` for all of them, and never its
 * `blockType`. So removing `CodeBlock()` from the feature list would have
 * left every test green while the public page rendered the literal text
 * "unknown node" for any post containing a diagram or a snippet: the
 * dispatcher in `@payloadcms/richtext-lexical`'s `lexicalToJsx` converter
 * has no entry for an unregistered block and logs a `console.error` instead.
 *
 * That is not hypothetical in the way most such gaps are. `payload-rich-text.tsx`
 * carries a comment recording that its `Code` converter was added only after
 * the importer made code blocks reachable for the first time — 0 of the 15
 * migrated posts contained one, so the gap sat unnoticed until a member could
 * produce one. The same blind spot, one layer down, is what this list closes.
 *
 * Importing this rather than `payload.config.ts` is deliberate: that module
 * acquires Cloudflare bindings in a top-level `await`, so importing it boots a
 * miniflare over the local SQLite file. This one pulls in a block definition
 * and a type, which is why the unit lane can read it.
 */
export const EDITOR_BLOCKS: Block[] = [CodeBlock(), HtmlEmbedBlock]

/** Every `blockType` the editor can render. See `EDITOR_BLOCKS`. */
export const EDITOR_BLOCK_SLUGS = new Set(EDITOR_BLOCKS.map((block) => block.slug))

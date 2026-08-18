import type { Block } from 'payload'

/**
 * Holds a block of raw HTML/SVG that has already been through
 * `src/lib/mdx-import/html-embed.ts`'s sanitizer at import time — the only
 * place that ever writes this field. There is no live editing surface for
 * it: like `CodeBlock`'s output before it, an `HtmlEmbed` block round-trips
 * opaquely through the member editor via `unknown-passthrough`
 * (`src/lib/editor/nodes/unknown-node.ts`) — `block` is not in
 * `RECOGNIZED_TYPES` regardless of which registered block a given node is.
 *
 * Registered as a real Payload Block (`BlocksFeature({ blocks: [CodeBlock(),
 * HtmlEmbedBlock] })` in `payload.config.ts`) rather than reused as an
 * unregistered `blockType` string inside the existing `Code` block shape:
 * measured directly against this Payload version (3.87.0) — a `POST
 * /api/posts` carrying a `block` node whose `fields.blockType` matches no
 * configured block at all is accepted anyway, so nothing here relies on
 * that. `blockValidationHOC` (`@payloadcms/richtext-lexical/dist/features/
 * blocks/server/validate.js`) not enforcing this today is a gap in this
 * version, not a guarantee — registering the block properly means this
 * content type stays valid if that gap is ever closed upstream.
 *
 * `html` is `type: 'code'` with `language: 'html'` purely so an admin
 * looking at this block in `/admin` sees syntax-highlighted markup instead
 * of a bare textarea — the field is still just a string.
 */
export const HtmlEmbedBlock: Block = {
  slug: 'HtmlEmbed',
  fields: [
    {
      name: 'html',
      type: 'code',
      admin: {
        language: 'html',
      },
      required: true,
    },
  ],
}

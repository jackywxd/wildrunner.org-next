import { HeadingNode, QuoteNode } from '@payloadcms/richtext-lexical/lexical/rich-text'
import { ListItemNode, ListNode } from '@payloadcms/richtext-lexical/lexical/list'

import { MemberHorizontalRuleNode } from './horizontal-rule-node'
import { MemberLinkNode } from './link-node'
import { MemberUploadNode } from './upload-node'
import { UnknownNode } from './unknown-node'

import type { Klass, LexicalNode } from '@payloadcms/richtext-lexical/lexical'

/**
 * The complete node set for the member editor.
 *
 * `paragraph`, `text`, `root`, and `linebreak` need no entry: Lexical's
 * `createEditor()` registers those unconditionally, and they already
 * serialize identically to Payload's corpus because both editors use the
 * same stock classes for them (only `heading`/`quote`/`list`/`listitem`/
 * `link`/`upload`/`horizontalrule` are Payload-feature-specific, and
 * `link`/`upload`/`horizontalrule` are Payload's own classes, not
 * @lexical/*'s stock ones — see each file's comment for why).
 *
 * `RECOGNIZED_TYPES` is this array's type strings, used by
 * `serialize.ts:fromPayloadContent` to decide what needs to be swapped for
 * `UnknownNode` before Lexical's parser ever sees it.
 */
export const EDITOR_NODES: Array<Klass<LexicalNode>> = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  MemberLinkNode,
  MemberUploadNode,
  MemberHorizontalRuleNode,
  UnknownNode,
]

export const RECOGNIZED_TYPES = new Set<string>([
  'root',
  'paragraph',
  'text',
  'linebreak',
  ...EDITOR_NODES.map((nodeClass) => nodeClass.getType()),
])

export {
  MemberHorizontalRuleNode,
  $createMemberHorizontalRuleNode,
  $isMemberHorizontalRuleNode,
} from './horizontal-rule-node'
export {
  MemberLinkNode,
  $createMemberLinkNode,
  $isMemberLinkNode,
  type MemberLinkFields,
} from './link-node'
export {
  MemberUploadNode,
  $createMemberUploadNode,
  $isMemberUploadNode,
  type UploadData,
} from './upload-node'
export { UnknownNode, $createUnknownNode, $isUnknownNode } from './unknown-node'

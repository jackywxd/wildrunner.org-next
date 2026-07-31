import { HeadingNode, QuoteNode } from '@payloadcms/richtext-lexical/lexical/rich-text'
import { ListItemNode, ListNode } from '@payloadcms/richtext-lexical/lexical/list'
// The one Lexical package imported directly rather than through
// @payloadcms/richtext-lexical's proxy: it has no `./lexical/table` export
// (only `./lexical/react/LexicalTablePlugin`). Safe because both resolve to
// the same 0.41.0 instance — scripts/assert-lexical-single-copy.mjs keeps
// that true, and Payload's own EXPERIMENTAL_TableFeature registers these
// very classes server-side, so the serialized shape matches exactly.
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table'

import { MemberHorizontalRuleNode } from './horizontal-rule-node'
import { MemberLinkNode } from './link-node'
import { MemberUploadNode } from './upload-node'
import { PendingUploadNode } from './pending-upload-node'
import { UnknownNode } from './unknown-node'

import type { Klass, LexicalNode } from '@payloadcms/richtext-lexical/lexical'

/**
 * The complete node set for the member editor.
 *
 * `paragraph`, `text`, `root`, and `linebreak` need no entry: Lexical's
 * `createEditor()` registers those unconditionally, and they already
 * serialize identically to Payload's corpus because both editors use the
 * same stock classes for them (only `heading`/`quote`/`list`/`listitem`/
 * `table`/`tablerow`/`tablecell`/`link`/`upload`/`horizontalrule` are
 * Payload-feature-specific, and of those only `link`/`upload`/
 * `horizontalrule` are Payload's own classes rather than @lexical/*'s stock
 * ones — see each file's comment for why. `table` is stock on both sides:
 * Payload's EXPERIMENTAL_TableFeature registers @lexical/table's classes
 * unchanged, so a table typed in /admin and one typed here serialize
 * identically).
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
  TableNode,
  TableRowNode,
  TableCellNode,
  MemberLinkNode,
  MemberUploadNode,
  MemberHorizontalRuleNode,
  // Registered so the editor can create one mid-upload. It never appears in
  // stored content: `toPayloadContent` throws on sight of it.
  PendingUploadNode,
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
export {
  PendingUploadNode,
  $createPendingUploadNode,
  $isPendingUploadNode,
  type PendingUploadData,
} from './pending-upload-node'
export { UnknownNode, $createUnknownNode, $isUnknownNode } from './unknown-node'

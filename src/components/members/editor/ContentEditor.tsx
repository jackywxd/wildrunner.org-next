"use client";

import { useCallback, useRef, useState } from "react";
import { LexicalComposer } from "@payloadcms/richtext-lexical/lexical/react/LexicalComposer";
import { RichTextPlugin } from "@payloadcms/richtext-lexical/lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@payloadcms/richtext-lexical/lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@payloadcms/richtext-lexical/lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@payloadcms/richtext-lexical/lexical/react/LexicalListPlugin";
import { TabIndentationPlugin } from "@payloadcms/richtext-lexical/lexical/react/LexicalTabIndentationPlugin";
import { TablePlugin } from "@payloadcms/richtext-lexical/lexical/react/LexicalTablePlugin";
import { MarkdownShortcutPlugin } from "@payloadcms/richtext-lexical/lexical/react/LexicalMarkdownShortcutPlugin";
import { OnChangePlugin } from "@payloadcms/richtext-lexical/lexical/react/LexicalOnChangePlugin";
import { LexicalErrorBoundary } from "@payloadcms/richtext-lexical/lexical/react/LexicalErrorBoundary";
import { EditorRefPlugin } from "@payloadcms/richtext-lexical/lexical/react/LexicalEditorRefPlugin";
import type { LexicalEditor } from "@payloadcms/richtext-lexical/lexical";

import { EDITOR_NODES } from "@/lib/editor/nodes";
import {
  fromPayloadContent,
  toPayloadContent,
  type PayloadContent,
} from "@/lib/editor/serialize";
import { editorTheme } from "./theme";
import { SlashMenuPlugin } from "./SlashMenuPlugin";
import { SelectionToolbarPlugin } from "./SelectionToolbarPlugin";
import { ImageInsertPlugin } from "./ImageInsertPlugin";
import { TableToolbarPlugin } from "./TableToolbarPlugin";
import { DraggableBlockPlugin } from "./DraggableBlockPlugin";
import { FixedToolbarPlugin } from "./FixedToolbarPlugin";
import { MEMBER_MARKDOWN_TRANSFORMERS } from "@/lib/editor/markdown-transformers";

export type ContentEditorHandle = {
  /** Current document in Payload's stored shape. Throws if an upload is pending. */
  read: () => PayloadContent;
  /** Replace the whole document, e.g. with an AI-generated draft. */
  replace: (content: PayloadContent) => void;
};

/**
 * The Notion-style editing surface.
 *
 * `initialContent` goes through `fromPayloadContent` first, so any node
 * type this editor has no class for is parked in an UnknownNode rather than
 * throwing inside Lexical's parser — and comes back out byte-identical on
 * save. That is the guarantee the Phase B harness pins down and F2-T2
 * re-checks through the real UI.
 */
export function ContentEditor({
  initialContent,
  onChange,
  onPendingChange,
  handleRef,
}: {
  initialContent: PayloadContent;
  onChange: () => void;
  onPendingChange: (count: number) => void;
  handleRef: React.MutableRefObject<ContentEditorHandle | null>;
}) {
  const editorRef = useRef<LexicalEditor | null>(null);

  handleRef.current = {
    read: () => {
      const editor = editorRef.current;
      if (!editor) throw new Error("Editor is not ready");
      // toPayloadContent throws if a pending upload is still in the tree.
      return toPayloadContent(
        editor.getEditorState().toJSON() as unknown as PayloadContent,
      );
    },
    replace: (content) => {
      const editor = editorRef.current;
      if (!editor) throw new Error("Editor is not ready");
      // In Payload's admin the equivalent needs a dispatchFields UPDATE with
      // both value and initialValue, because its Lexical field only remounts
      // the editor when initialValue changes (see AIAssistField). Owning the
      // editor directly makes it a plain state swap.
      editor.setEditorState(
        editor.parseEditorState(JSON.stringify(fromPayloadContent(content))),
      );
    },
  };

  const initialConfig = useRef({
    namespace: "wildrunner-member-editor",
    nodes: EDITOR_NODES,
    theme: editorTheme,
    editorState: JSON.stringify(fromPayloadContent(initialContent)),
    onError: (error: Error) => {
      throw error;
    },
  }).current;

  const handleChange = useCallback(() => onChange(), [onChange]);

  // State, not a ref: DraggableBlockPlugin measures against this element and
  // has to re-render once it exists. A ref would still be null on the render
  // that mounts the plugin, so the handle would never appear.
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);

  return (
    <LexicalComposer initialConfig={initialConfig}>
      {/* Above the relative box, not inside it: these are docked, and a
          child of the positioned wrapper would sit under the floating
          selection toolbar's coordinate space. */}
      <FixedToolbarPlugin />
      <TableToolbarPlugin />
      {/* relative: the selection toolbar and the drag handle both position
          themselves against this box. pl-6 is the gutter the handle lives
          in — without it the handle sits on top of the first character of
          every block it is offered for. */}
      <div className="relative pl-6" ref={setAnchor}>
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              data-testid="editor-content"
              className="min-h-[24rem] outline-none [&_*]:outline-none"
              aria-label="文章內容"
            />
          }
          placeholder={
            <div className="pointer-events-none absolute left-6 top-0 text-foreground/30">
              開始書寫，或輸入「/」插入區塊…
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <ListPlugin />
        <TabIndentationPlugin />
        {/* hasHorizontalScroll wraps the table in a scroll container rather
            than letting a wide table push the whole editor sideways. Cell
            merge and background colour stay on so a table an admin built in
            /admin with either still edits correctly here. */}
        <TablePlugin
          hasCellBackgroundColor
          hasCellMerge
          hasHorizontalScroll
        />
        {/* A hand-picked transformer subset, not the stock TRANSFORMERS —
            see markdown-transformers.ts for which four are excluded and
            why. Passing the stock list throws at registration, because a
            transformer declares the node classes it needs and four of them
            are not in EDITOR_NODES. */}
        <MarkdownShortcutPlugin transformers={MEMBER_MARKDOWN_TRANSFORMERS} />
        <SlashMenuPlugin />
        <SelectionToolbarPlugin />
        <ImageInsertPlugin onPendingChange={onPendingChange} />
        <DraggableBlockPlugin anchorElem={anchor} />
        <OnChangePlugin ignoreSelectionChange onChange={handleChange} />
        <EditorRefPlugin editorRef={editorRef} />
      </div>
    </LexicalComposer>
  );
}

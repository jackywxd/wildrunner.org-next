"use client";

import { useCallback, useRef } from "react";
import { LexicalComposer } from "@payloadcms/richtext-lexical/lexical/react/LexicalComposer";
import { RichTextPlugin } from "@payloadcms/richtext-lexical/lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@payloadcms/richtext-lexical/lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@payloadcms/richtext-lexical/lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@payloadcms/richtext-lexical/lexical/react/LexicalListPlugin";
import { TabIndentationPlugin } from "@payloadcms/richtext-lexical/lexical/react/LexicalTabIndentationPlugin";
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
import { PasteImagePlugin } from "./PasteImagePlugin";

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

  return (
    <LexicalComposer initialConfig={initialConfig}>
      {/* relative: the selection toolbar positions itself against this box */}
      <div className="relative">
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              data-testid="editor-content"
              className="min-h-[24rem] outline-none [&_*]:outline-none"
              aria-label="文章內容"
            />
          }
          placeholder={
            <div className="pointer-events-none absolute left-0 top-0 text-foreground/30">
              開始書寫，或輸入「/」插入區塊…
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <ListPlugin />
        <TabIndentationPlugin />
        <SlashMenuPlugin />
        <SelectionToolbarPlugin />
        <PasteImagePlugin onPendingChange={onPendingChange} />
        <OnChangePlugin ignoreSelectionChange onChange={handleChange} />
        <EditorRefPlugin editorRef={editorRef} />
      </div>
    </LexicalComposer>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLexicalComposerContext } from "@payloadcms/richtext-lexical/lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
} from "@payloadcms/richtext-lexical/lexical";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
  type HeadingTagType,
} from "@payloadcms/richtext-lexical/lexical/rich-text";
import { $setBlocksType } from "@payloadcms/richtext-lexical/lexical/selection";
import {
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
} from "@payloadcms/richtext-lexical/lexical/list";
import {
  $findMatchingParent,
  mergeRegister,
} from "@payloadcms/richtext-lexical/lexical/utils";
import { INSERT_TABLE_COMMAND } from "@lexical/table";
import { INSERT_IMAGE_FILES_COMMAND } from "./ImageInsertPlugin";
import {
  INSERT_VIDEO_FILE_COMMAND,
  OPEN_MEDIA_PICKER_COMMAND,
} from "./VideoInsertPlugin";

/**
 * The always-visible toolbar.
 *
 * Every block type here is also reachable through `/` and through markdown
 * shortcuts, so this adds no capability — it adds discoverability, which
 * was the actual gap: headings and lists have been available since the
 * editor shipped, behind a slash key nothing on screen mentioned.
 *
 * The floating selection toolbar stays: it handles inline formatting on an
 * existing selection, where reaching for a fixed bar means losing sight of
 * the text being formatted. Mainstream editors ship both for that reason.
 */

type BlockKind = "h1" | "h2" | "h3" | "paragraph" | "quote" | "ul" | "ol";

const BLOCK_LABELS: Record<BlockKind, string> = {
  h1: "標題 1",
  h2: "標題 2",
  h3: "標題 3",
  ol: "編號清單",
  paragraph: "內文",
  quote: "引言",
  ul: "項目清單",
};

export function FixedToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const [block, setBlock] = useState<BlockKind>("paragraph");
  /**
   * Whether there is anything to go back to, straight from the history
   * plugin rather than guessed at. A button that is always live promises an
   * undo that does nothing on a fresh document, and the member cannot tell
   * that from one that silently failed.
   */
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const sync = useCallback(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    const anchor = selection.anchor.getNode();

    const list = $findMatchingParent(anchor, (node) => $isListNode(node));
    if (list && $isListNode(list)) {
      setBlock(list.getListType() === "number" ? "ol" : "ul");
      return;
    }
    // getTopLevelElement rather than the parent: inside a table cell the
    // immediate parent is the cell, and the heading sits below it.
    const element = anchor.getTopLevelElement() ?? anchor;
    if ($isHeadingNode(element)) {
      const tag = element.getTag();
      setBlock(tag === "h1" || tag === "h2" || tag === "h3" ? tag : "paragraph");
      return;
    }
    setBlock($isQuoteNode(element) ? "quote" : "paragraph");
  }, []);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(sync);
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          editor.getEditorState().read(sync);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      // False, not handled: HistoryPlugin is the one that acts on these.
      // Returning true would take the announcement away from it and the
      // buttons would be the only thing in the editor that knew.
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        (value) => {
          setCanUndo(value);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        CAN_REDO_COMMAND,
        (value) => {
          setCanRedo(value);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor, sync]);

  function applyBlock(kind: BlockKind) {
    if (kind === "ul" || kind === "ol") {
      // Toggling off matters: without this, picking the list you are
      // already in nests a second one instead of doing nothing visible.
      if (block === kind) {
        editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
        return;
      }
      editor.dispatchCommand(
        kind === "ul"
          ? INSERT_UNORDERED_LIST_COMMAND
          : INSERT_ORDERED_LIST_COMMAND,
        undefined,
      );
      return;
    }

    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      // A list has to be dismantled before $setBlocksType, which replaces
      // the block but leaves the surrounding <ul> in place.
      if (block === "ul" || block === "ol") {
        editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
      }
      $setBlocksType(selection, () => {
        if (kind === "quote") return $createQuoteNode();
        if (kind === "paragraph") return $createParagraphNode();
        return $createHeadingNode(kind as HeadingTagType);
      });
    });
  }

  const button =
    "min-h-11 shrink-0 whitespace-nowrap px-3 text-sm hover:bg-secondary disabled:opacity-40 md:min-h-0 md:px-2 md:py-1 md:text-xs";

  // Sticky, because on a phone the keyboard takes half the screen and the
  // first scroll put undo and every format out of reach. One row that
  // scrolls sideways there rather than three wrapped rows of 24px buttons:
  // 44px targets in three rows would be a third of what the keyboard left.
  return (
    <div
      data-testid="editor-fixed-toolbar"
      className="sticky top-0 z-30 flex items-center gap-1 overflow-x-auto border border-border bg-background px-1 py-1 md:flex-wrap md:overflow-visible"
      onMouseDown={(event) => {
        // Buttons: prevent, so pressing one doesn't take focus and collapse
        // the selection it was about to act on — the same trick the other
        // two toolbars use.
        //
        // The <select> is the exception, and it is not a cosmetic one:
        // preventing mousedown on a native select stops the browser opening
        // its dropdown at all, so the control looked completely dead. A
        // blanket preventDefault on the container swept it up along with
        // the buttons.
        if ((event.target as HTMLElement).closest("select")) return;
        event.preventDefault();
      }}
    >
      {/*
        First, where every editor puts them — and the only way to reach
        undo on a phone, which has no ⌘Z. HistoryPlugin has been mounted
        since the editor shipped, so on a laptop this adds reach rather
        than capability; on a touch device it adds the capability itself.
      */}
      <button
        type="button"
        data-testid="editor-toolbar-undo"
        className={button}
        disabled={!canUndo}
        aria-label="復原"
        onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
      >
        復原
      </button>
      <button
        type="button"
        data-testid="editor-toolbar-redo"
        className={button}
        disabled={!canRedo}
        aria-label="重做"
        onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
      >
        重做
      </button>

      <span className="mx-1 h-4 w-px shrink-0 bg-border" />

      <select
        data-testid="editor-block-type"
        value={block}
        onChange={(event) => applyBlock(event.target.value as BlockKind)}
        className="min-h-11 shrink-0 border border-input bg-background px-2 py-1 text-base md:min-h-0 md:text-xs"
        aria-label="區塊型別"
      >
        {(Object.keys(BLOCK_LABELS) as BlockKind[]).map((kind) => (
          <option key={kind} value={kind}>
            {BLOCK_LABELS[kind]}
          </option>
        ))}
      </select>

      <span className="mx-1 h-4 w-px shrink-0 bg-border" />

      {(
        [
          ["bold", "粗體"],
          ["italic", "斜體"],
          ["underline", "底線"],
        ] as const
      ).map(([format, label]) => (
        <button
          key={format}
          type="button"
          data-testid={`editor-toolbar-${format}`}
          className={button}
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)}
        >
          {label}
        </button>
      ))}

      <span className="mx-1 h-4 w-px shrink-0 bg-border" />

      <button
        type="button"
        data-testid="editor-toolbar-image"
        className={button}
        onClick={() => fileInputRef.current?.click()}
      >
        圖片
      </button>
      <input
        ref={fileInputRef}
        data-testid="editor-toolbar-image-input"
        type="file"
        accept="image/*,.dng"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) {
            editor.dispatchCommand(INSERT_IMAGE_FILES_COMMAND, files);
          }
          // Cleared so choosing the same file twice in a row fires `change`
          // the second time too.
          event.target.value = "";
        }}
      />
      <button
        type="button"
        data-testid="editor-toolbar-video"
        className={button}
        onClick={() => videoInputRef.current?.click()}
      >
        影片
      </button>
      <input
        ref={videoInputRef}
        data-testid="editor-toolbar-video-input"
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(event) => {
          // One at a time, unlike the image input. Each video is minutes of
          // upload with its own row in the panel, and a member who picks four
          // by accident should not discover that by watching four progress
          // bars they cannot stop.
          const file = event.target.files?.[0];
          if (file) editor.dispatchCommand(INSERT_VIDEO_FILE_COMMAND, file);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        data-testid="editor-toolbar-library"
        className={button}
        onClick={() =>
          editor.dispatchCommand(OPEN_MEDIA_PICKER_COMMAND, undefined)
        }
      >
        媒體庫
      </button>
      <button
        type="button"
        data-testid="editor-toolbar-table"
        className={button}
        onClick={() =>
          editor.dispatchCommand(INSERT_TABLE_COMMAND, {
            columns: "3",
            includeHeaders: { columns: false, rows: true },
            rows: "3",
          })
        }
      >
        表格
      </button>
    </div>
  );
}

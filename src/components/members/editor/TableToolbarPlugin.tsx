"use client";

import { useCallback, useEffect, useState } from "react";
import { useLexicalComposerContext } from "@payloadcms/richtext-lexical/lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  SELECTION_CHANGE_COMMAND,
} from "@payloadcms/richtext-lexical/lexical";
import {
  $findMatchingParent,
  mergeRegister,
} from "@payloadcms/richtext-lexical/lexical/utils";
import {
  $deleteTableColumnAtSelection,
  $deleteTableRowAtSelection,
  $getTableNodeFromLexicalNodeOrThrow,
  $insertTableColumnAtSelection,
  $insertTableRowAtSelection,
  $isTableNode,
} from "@lexical/table";

/**
 * Row/column controls, shown only while the caret is inside a table.
 *
 * Deliberately a docked strip above the editor rather than a floating
 * overlay: the selection toolbar already owns the floating position, and two
 * overlays racing for the same rect is the kind of thing that looks fine
 * until a table sits near the top of the document.
 *
 * The `AtSelection` helpers are used rather than the `__EXPERIMENTAL`
 * variants — same behaviour, but they read the current selection themselves
 * instead of taking a node, so there is no second place that has to agree
 * about which cell is "current".
 */
export function TableToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const [inTable, setInTable] = useState(false);

  const sync = useCallback(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      setInTable(false);
      return;
    }
    setInTable(
      Boolean(
        $findMatchingParent(selection.anchor.getNode(), (node) =>
          $isTableNode(node),
        ),
      ),
    );
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
    );
  }, [editor, sync]);

  function run(action: () => void) {
    editor.update(action);
  }

  function removeTable() {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      // Through getTableNodeFromLexicalNodeOrThrow rather than walking up by
      // hand: the caret sits in a paragraph inside a cell, so the table is
      // three levels up, and a merged cell can add more.
      const table = $getTableNodeFromLexicalNodeOrThrow(
        selection.anchor.getNode(),
      );
      table.selectPrevious();
      table.remove();
    });
  }

  if (!inTable) return null;

  const actions: [string, string, () => void][] = [
    ["row-above", "上方插列", () => run(() => $insertTableRowAtSelection(false))],
    ["row-below", "下方插列", () => run(() => $insertTableRowAtSelection(true))],
    [
      "col-left",
      "左方插欄",
      () => run(() => $insertTableColumnAtSelection(false)),
    ],
    [
      "col-right",
      "右方插欄",
      () => run(() => $insertTableColumnAtSelection(true)),
    ],
    ["row-delete", "刪除此列", () => run(() => $deleteTableRowAtSelection())],
    ["col-delete", "刪除此欄", () => run(() => $deleteTableColumnAtSelection())],
    ["table-delete", "刪除表格", removeTable],
  ];

  return (
    <div
      data-testid="editor-table-toolbar"
      className="mb-2 flex flex-wrap items-center gap-1 border border-border bg-background px-1 py-1"
      // Without this the button steals focus from the contenteditable, the
      // selection collapses, and every one of these actions loses the cell
      // it was meant to act on.
      onMouseDown={(event) => event.preventDefault()}
    >
      <span className="px-2 text-xs text-foreground/50">表格</span>
      {actions.map(([id, label, onClick]) => (
        <button
          key={id}
          type="button"
          data-testid={`editor-table-${id}`}
          onClick={onClick}
          className="whitespace-nowrap px-2 py-1 text-xs hover:bg-secondary"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

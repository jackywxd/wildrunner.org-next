"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLexicalComposerContext } from "@payloadcms/richtext-lexical/lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_LOW,
} from "@payloadcms/richtext-lexical/lexical";
import {
  $findMatchingParent,
  mergeRegister,
} from "@payloadcms/richtext-lexical/lexical/utils";
import { $createMemberLinkNode, $isMemberLinkNode } from "@/lib/editor/nodes";

type Format = "bold" | "italic" | "underline";

export function SelectionToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [active, setActive] = useState<Record<Format, boolean>>({
    bold: false,
    italic: false,
    underline: false,
  });
  const [isLink, setIsLink] = useState(false);

  const update = useCallback(() => {
    const selection = $getSelection();
    if (
      !$isRangeSelection(selection) ||
      selection.isCollapsed() ||
      selection.getTextContent().trim() === ""
    ) {
      setVisible(false);
      return;
    }

    setActive({
      bold: selection.hasFormat("bold"),
      italic: selection.hasFormat("italic"),
      underline: selection.hasFormat("underline"),
    });
    setIsLink(
      Boolean(
        $findMatchingParent(selection.anchor.getNode(), (node) =>
          $isMemberLinkNode(node),
        ),
      ),
    );

    const nativeSelection = window.getSelection();
    const rootElement = editor.getRootElement();
    if (
      !nativeSelection ||
      !rootElement ||
      !rootElement.contains(nativeSelection.anchorNode)
    ) {
      setVisible(false);
      return;
    }

    const rect = nativeSelection.getRangeAt(0).getBoundingClientRect();
    const toolbar = toolbarRef.current;
    if (toolbar) {
      // The toolbar is position:absolute inside the editor's relative
      // wrapper, so it needs coordinates relative to that offset parent —
      // viewport coordinates would place it a whole container's offset away.
      const parent = toolbar.offsetParent as HTMLElement | null;
      const origin = parent
        ? parent.getBoundingClientRect()
        : ({ left: 0, top: 0 } as DOMRect);
      toolbar.style.top = `${rect.top - origin.top - toolbar.offsetHeight - 8}px`;
      toolbar.style.left = `${rect.left - origin.left}px`;
    }
    setVisible(true);
  }, [editor]);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(update);
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          editor.getEditorState().read(update);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor, update]);

  function applyLink() {
    const url = window.prompt("連結網址", "https://");
    if (!url) return;
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      // `extract()` splits the boundary text nodes so the link wraps exactly
      // the selected run, then the nodes move inside a fresh link node.
      const nodes = selection.extract();
      if (nodes.length === 0) return;
      const link = $createMemberLinkNode({
        linkType: "custom",
        newTab: false,
        url,
      });
      nodes[0].insertBefore(link);
      for (const node of nodes) link.append(node);
    });
  }

  return (
    <div
      ref={toolbarRef}
      data-testid="editor-selection-toolbar"
      // Kept mounted so its offsetHeight is measurable before the first show.
      className={`absolute z-40 flex w-max items-center gap-1 border border-border bg-background px-1 py-1 shadow-sm ${
        visible ? "" : "pointer-events-none opacity-0"
      }`}
      style={{ top: -9999, left: -9999 }}
      // Keeps the text selection alive when a button is pressed.
      onMouseDown={(e) => e.preventDefault()}
    >
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
          data-testid={`editor-format-${format}`}
          data-active={active[format] ? "true" : "false"}
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)}
          className={`whitespace-nowrap px-2 py-1 text-xs hover:bg-secondary ${
            active[format] ? "bg-secondary" : ""
          }`}
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        data-testid="editor-format-link"
        data-active={isLink ? "true" : "false"}
        onClick={applyLink}
        className="whitespace-nowrap px-2 py-1 text-xs hover:bg-secondary"
      >
        連結
      </button>
    </div>
  );
}

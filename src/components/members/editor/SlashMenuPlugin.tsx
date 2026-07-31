"use client";

import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLexicalComposerContext } from "@payloadcms/richtext-lexical/lexical/react/LexicalComposerContext";
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from "@payloadcms/richtext-lexical/lexical/react/LexicalTypeaheadMenuPlugin";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  type TextNode,
} from "@payloadcms/richtext-lexical/lexical";
import {
  $createHeadingNode,
  $createQuoteNode,
  type HeadingTagType,
} from "@payloadcms/richtext-lexical/lexical/rich-text";
import { $setBlocksType } from "@payloadcms/richtext-lexical/lexical/selection";
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from "@payloadcms/richtext-lexical/lexical/list";
import { INSERT_TABLE_COMMAND } from "@lexical/table";
import { $createMemberHorizontalRuleNode } from "@/lib/editor/nodes";
import { $insertNodeToNearestRoot } from "@payloadcms/richtext-lexical/lexical/utils";

class BlockOption extends MenuOption {
  constructor(
    public label: string,
    public hint: string,
    public run: () => void,
  ) {
    super(label);
  }
}

export function SlashMenuPlugin() {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<string | null>(null);

  // minLength 0 so a bare "/" opens the menu immediately, the way Notion does.
  const triggerFn = useBasicTypeaheadTriggerMatch("/", { minLength: 0 });

  const formatHeading = useCallback(
    (tag: HeadingTagType) => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createHeadingNode(tag));
        }
      });
    },
    [editor],
  );

  const options = useMemo(() => {
    const all = [
      new BlockOption("標題", "H1", () => formatHeading("h1")),
      new BlockOption("小標題", "H2", () => formatHeading("h2")),
      new BlockOption("次小標題", "H3", () => formatHeading("h3")),
      new BlockOption("內文", "P", () =>
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            $setBlocksType(selection, () => $createParagraphNode());
          }
        }),
      ),
      new BlockOption("項目清單", "•", () =>
        editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined),
      ),
      new BlockOption("編號清單", "1.", () =>
        editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined),
      ),
      new BlockOption("引言", "❝", () =>
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            $setBlocksType(selection, () => $createQuoteNode());
          }
        }),
      ),
      new BlockOption("分隔線", "—", () =>
        editor.update(() => {
          $insertNodeToNearestRoot($createMemberHorizontalRuleNode());
        }),
      ),
      // 3x3 with a header row, matching what every mainstream editor drops in
      // by default. Rows and columns are adjustable afterwards through
      // TableToolbarPlugin, so this is a starting point rather than a choice
      // the member is stuck with.
      new BlockOption("表格", "⊞", () =>
        editor.dispatchCommand(INSERT_TABLE_COMMAND, {
          columns: "3",
          includeHeaders: { columns: false, rows: true },
          rows: "3",
        }),
      ),
    ];
    if (!query) return all;
    const needle = query.toLowerCase();
    return all.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) ||
        option.hint.toLowerCase().includes(needle),
    );
  }, [editor, formatHeading, query]);

  const onSelectOption = useCallback(
    (
      option: BlockOption,
      nodeToRemove: TextNode | null,
      closeMenu: () => void,
    ) => {
      // Remove the "/query" text first, in its own update, so the block
      // transform below applies to a clean paragraph.
      editor.update(() => {
        nodeToRemove?.remove();
      });
      option.run();
      closeMenu();
    },
    [editor],
  );

  return (
    <LexicalTypeaheadMenuPlugin<BlockOption>
      options={options}
      onQueryChange={setQuery}
      onSelectOption={onSelectOption}
      triggerFn={triggerFn}
      menuRenderFn={(
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
      ) => {
        if (!anchorElementRef.current || options.length === 0) return null;
        return createPortal(
          <div
            data-testid="editor-slash-menu"
            className="z-50 w-56 border border-border bg-background shadow-sm"
          >
            {options.map((option, index) => (
              <button
                key={option.key}
                type="button"
                data-testid={`editor-slash-option-${option.label}`}
                ref={(el) => option.setRefElement(el)}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => selectOptionAndCleanUp(option)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                  selectedIndex === index ? "bg-secondary" : ""
                } hover:bg-secondary`}
              >
                <span className="whitespace-nowrap">{option.label}</span>
                <span className="text-xs text-foreground/40">{option.hint}</span>
              </button>
            ))}
          </div>,
          anchorElementRef.current,
        );
      }}
    />
  );
}

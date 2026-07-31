"use client";

import { useRef, useState } from "react";
import { DraggableBlockPlugin_EXPERIMENTAL } from "@payloadcms/richtext-lexical/lexical/react/LexicalDraggableBlockPlugin";

/**
 * Notion-style drag handle: hover a block, grab the handle in the left
 * gutter, drop it somewhere else.
 *
 * This is what covers "move an image to a different part of the post" —
 * but it is deliberately not image-specific. Every block moves the same
 * way, so there is one gesture to learn rather than one rule for images
 * and another for everything else.
 *
 * `DraggableBlockPlugin_EXPERIMENTAL` is Lexical's own name for it. The
 * suffix is real: the signature changed during 0.4x, so a Lexical bump is
 * a place to re-check this file rather than assume it still compiles the
 * same way. It is wrapped here rather than used inline so that when it
 * does change, exactly one file has to move.
 *
 * The handle and the target line are rendered by us, not the plugin — it
 * only positions them. Both must exist in the DOM before the plugin runs,
 * hence plain refs on always-mounted elements rather than conditional
 * rendering.
 */
export function DraggableBlockPlugin({
  anchorElem,
}: {
  anchorElem: HTMLElement | null;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const targetLineRef = useRef<HTMLDivElement>(null);
  const [draggable, setDraggable] = useState(false);

  // The plugin measures against `anchorElem`, so it cannot run until the
  // editor's wrapper has mounted and the ref has been filled in.
  if (!anchorElem) return null;

  return (
    <DraggableBlockPlugin_EXPERIMENTAL
      anchorElem={anchorElem}
      isOnMenu={(element) => Boolean(element.closest("[data-drag-handle]"))}
      menuComponent={
        <div
          ref={menuRef}
          data-drag-handle
          data-testid="editor-drag-handle"
          // absolute + opacity rather than mounting on hover: the plugin
          // positions this element directly, and an element that appears
          // only once hovered can never be under the pointer to begin with.
          className={`absolute left-0 top-0 flex cursor-grab items-center justify-center px-1 py-0.5 text-foreground/30 transition-opacity hover:bg-secondary hover:text-foreground/70 active:cursor-grabbing ${
            draggable ? "opacity-100" : "opacity-0"
          }`}
          draggable
          onDragStart={() => setDraggable(true)}
          onDragEnd={() => setDraggable(false)}
          onMouseEnter={() => setDraggable(true)}
          aria-label="拖曳以移動此區塊"
        >
          {/* Six dots, the near-universal drag affordance. Text rather than
              an icon component so it costs nothing and scales with the
              surrounding type. */}
          <span aria-hidden className="select-none text-xs leading-none">
            ⠿
          </span>
        </div>
      }
      onElementChanged={(element) => setDraggable(Boolean(element))}
      targetLineComponent={
        <div
          ref={targetLineRef}
          data-testid="editor-drop-line"
          className="pointer-events-none absolute h-0.5 bg-primary opacity-0"
        />
      }
      menuRef={menuRef}
      targetLineRef={targetLineRef}
    />
  );
}

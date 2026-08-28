"use client";

import { useCallback, useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@payloadcms/richtext-lexical/lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@payloadcms/richtext-lexical/lexical/react/useLexicalNodeSelection";
import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
} from "@payloadcms/richtext-lexical/lexical";
import { mergeRegister } from "@payloadcms/richtext-lexical/lexical/utils";
import { mediaImageSrc } from "@/lib/cf-image";
import { useMediaById } from "@/lib/members/use-media";

/**
 * Resolves a media id to something displayable inside the editor, and owns
 * the image's selection and deletion.
 *
 * The node itself only stores the id — that is the whole point of the
 * `depth: 0` rule (a populated Media object must never end up back in
 * `content`), so the picture has to be fetched separately here. Cached per
 * id for the lifetime of the page so re-renders and repeated ids don't
 * refetch.
 *
 * The selection half is not decoration. A DecoratorNode sits outside
 * ordinary caret editing: the caret cannot be placed "on" it, so without
 * `useLexicalNodeSelection` there is no gesture that removes it. Clicking
 * the image and pressing Backspace deleted the empty paragraph *after* the
 * image while the image itself stayed put, and Backspace or Delete from
 * either neighbouring paragraph did nothing at all. Click-to-select plus
 * the two key handlers below is Lexical's standard answer for decorators;
 * the hover button is here because a member should not have to discover a
 * selection model to remove a picture.
 */
export function UploadPreview({
  nodeKey,
  value,
}: {
  nodeKey: string;
  value: number | string;
}) {
  const [editor] = useLexicalComposerContext();
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey);
  const containerRef = useRef<HTMLDivElement>(null);
  // Shared with the preview renderer so opening a preview does not refetch
  // every image this editor has already resolved — see use-media.ts.
  const media = useMediaById(value);

  const remove = useCallback(() => {
    editor.update(() => {
      $getNodeByKey(nodeKey)?.remove();
    });
  }, [editor, nodeKey]);

  const onDelete = useCallback(
    (event: KeyboardEvent) => {
      // Only when *this* image is the selection. Every mounted preview
      // registers these handlers, so without the guard the first one to
      // register would swallow every Backspace in the document.
      if (!isSelected || !$isNodeSelection($getSelection())) return false;
      event.preventDefault();
      remove();
      return true;
    },
    [isSelected, remove],
  );

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        CLICK_COMMAND,
        (event) => {
          if (!(event instanceof MouseEvent)) return false;
          if (!containerRef.current?.contains(event.target as Node)) {
            return false;
          }
          // clearSelection first: without it a previously selected image
          // stays selected and Backspace removes two.
          clearSelection();
          setSelected(true);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_DELETE_COMMAND,
        onDelete,
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        onDelete,
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [clearSelection, editor, onDelete, setSelected]);

  const src = media ? mediaImageSrc(media) : "";
  const isVideo = (media?.mimeType ?? "").startsWith("video/");

  return (
    <div
      ref={containerRef}
      data-testid="editor-upload"
      data-media-id={String(value)}
      data-selected={isSelected ? "true" : "false"}
      className={`group relative my-4 border ${
        isSelected ? "border-primary ring-2 ring-primary" : "border-border"
      }`}
    >
      <button
        type="button"
        data-testid="editor-upload-remove"
        aria-label="刪除圖片"
        // contentEditable={false} on the control: it lives inside the
        // editor's contenteditable subtree, and without this a click can
        // put the caret inside the button's own text instead of firing it.
        contentEditable={false}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          remove();
        }}
        className="absolute right-1 top-1 z-10 border border-border bg-background px-2 py-1 text-xs opacity-0 transition-opacity hover:bg-secondary focus-visible:opacity-100 group-hover:opacity-100"
      >
        刪除
      </button>
      {src && !isVideo ? (
        // Not next/image: the editor renders inside contentEditable, where
        // next/image's fill/absolute wrapper fights the block layout, and
        // these are author-facing previews rather than public page loads.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={media?.alt ?? ""}
          className="block max-h-96 w-full object-contain"
        />
      ) : (
        <div className="flex aspect-video items-center justify-center bg-secondary text-xs text-foreground/40">
          {isVideo ? "▶ 影片" : `媒體 #${value}`}
        </div>
      )}
    </div>
  );
}

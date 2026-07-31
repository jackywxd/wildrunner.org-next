"use client";

import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@payloadcms/richtext-lexical/lexical/react/LexicalComposerContext";
import {
  $createRangeSelection,
  $getPreviousSelection,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  DRAGOVER_COMMAND,
  DRAGSTART_COMMAND,
  DROP_COMMAND,
  PASTE_COMMAND,
  createCommand,
} from "@payloadcms/richtext-lexical/lexical";
import type { LexicalCommand } from "@payloadcms/richtext-lexical/lexical";
import {
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
} from "@payloadcms/richtext-lexical/lexical";
import {
  $dfsIterator,
  $findMatchingParent,
  $insertNodeToNearestRoot,
  mergeRegister,
} from "@payloadcms/richtext-lexical/lexical/utils";
import {
  $createMemberUploadNode,
  $createPendingUploadNode,
  $isMemberUploadNode,
  $isPendingUploadNode,
} from "@/lib/editor/nodes";
import { newObjectIdHex } from "@/lib/editor/object-id";
import { uploadImageFile } from "@/lib/members/upload-image";

/**
 * Getting an image into the document — by pasting it, or by dragging a file
 * in from the desktop.
 *
 * Both routes live in one plugin because they share one thing that must not
 * be duplicated: the count of uploads still in flight. `PostEditor` disables
 * saving while that count is above zero, and `toPayloadContent` throws if a
 * pending node reaches it. Two plugins each keeping their own tally would
 * both call `onPendingChange` with only their own half, so the last writer
 * would report "0 pending" while the other still had an upload running —
 * and the save would go through with an image the author can see on screen
 * but that has no media id yet.
 *
 * The paste half follows the shape of Payload's own upload plugin
 * (@payloadcms/richtext-lexical/dist/features/upload/client/plugin), which
 * already worked out the two clipboard cases:
 *
 *   screenshot / copied image file → clipboardData.files, no text/html
 *   image copied from a web page   → clipboardData carries text/html
 *
 * Only the first is handled. The second is deliberately left to Lexical's
 * normal HTML paste (which drops the <img>, since neither MemberUploadNode
 * nor MemberLinkNode implements importDOM): re-hosting an arbitrary remote
 * image on someone's behalf is a copyright and quota decision the member
 * should make explicitly through the media library, not a side effect of
 * pasting formatted text.
 *
 * What differs from Payload's version is the ending: it opens the admin's
 * bulk-upload drawer via useBulkUpload/useModal, which would pull the whole
 * Payload admin UI in. This calls src/lib/members/upload-image.ts, a thin
 * wrapper over the same src/lib/direct-upload.ts the media library and the
 * admin panel already use.
 */
/**
 * Insert files chosen some other way — today, the toolbar's file picker.
 *
 * A command rather than an exported function so the in-flight upload count
 * stays where it is. Anything that can reach the editor can add an image;
 * nothing else needs to know how uploading works.
 */
export const INSERT_IMAGE_FILES_COMMAND: LexicalCommand<File[]> = createCommand(
  "INSERT_IMAGE_FILES_COMMAND",
);

export function ImageInsertPlugin({
  onPendingChange,
}: {
  onPendingChange: (count: number) => void;
}) {
  const [editor] = useLexicalComposerContext();
  // Per-instance, and read through a ref so the registered commands always
  // see the current callback without re-registering on every render.
  const pendingRef = useRef(0);
  const notifyRef = useRef(onPendingChange);
  notifyRef.current = onPendingChange;

  useEffect(() => {
    const bumpPending = (delta: number) => {
      pendingRef.current += delta;
      notifyRef.current(pendingRef.current);
    };

    /** Swap the placeholder for a real upload node, or drop it on failure. */
    const settlePending = (uploadId: string, mediaId: number | null) => {
      editor.update(() => {
        for (const { node } of $dfsIterator()) {
          if (
            $isPendingUploadNode(node) &&
            node.getPending().uploadId === uploadId
          ) {
            if (mediaId === null) {
              node.remove();
            } else {
              node.replace(
                $createMemberUploadNode({ relationTo: "media", value: mediaId }),
              );
            }
            return;
          }
        }
      });
    };

    const imagesFrom = (transfer: DataTransfer | null): File[] =>
      Array.from(transfer?.files ?? []).filter((file) =>
        file.type.startsWith("image/"),
      );

    /**
     * Insert one placeholder, then upload into it.
     *
     * `placeCaret` runs inside the Lexical update and decides where the
     * image lands: paste uses the existing selection, drop uses the pointer
     * position. Returning false means "no usable insertion point" — the
     * upload is then never started, because without a placeholder there is
     * nothing to settle into and it would spend the member's quota on an
     * image that could never appear in the document.
     */
    const insertImage = (file: File, placeCaret: () => boolean) => {
      const uploadId = newObjectIdHex();
      const objectUrl = URL.createObjectURL(file);

      let inserted = false;
      editor.update(
        () => {
          if (!placeCaret()) return;
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;
          // Insertion replaces the selection, as everywhere else. Stated
          // explicitly rather than left to whatever insertion happens to do
          // with a non-collapsed range.
          if (!selection.isCollapsed()) selection.removeText();
          const focusNode = selection.focus.getNode();
          $insertNodeToNearestRoot(
            $createPendingUploadNode({ uploadId, src: objectUrl }),
          );
          // Drop the empty paragraph the caret sat in, so landing on a blank
          // line doesn't leave a gap above the image.
          if ($isParagraphNode(focusNode) && !focusNode.getFirstChild()) {
            focusNode.remove();
          }
          inserted = true;
        },
        {
          // The upload starts from here, not after the `update()` call:
          // Lexical defers the closure, so reading `inserted` straight after
          // `update()` returns would always still see `false`.
          onUpdate: () => {
            if (!inserted) {
              URL.revokeObjectURL(objectUrl);
              return;
            }
            bumpPending(1);
            uploadImageFile(file)
              .then((mediaId) => settlePending(uploadId, mediaId))
              .catch(() => settlePending(uploadId, null))
              .finally(() => {
                URL.revokeObjectURL(objectUrl);
                bumpPending(-1);
              });
          },
        },
      );
    };

    const keepExistingCaret = () =>
      Boolean($getSelection() || $getPreviousSelection());

    /**
     * Turn the pointer position into a caret.
     *
     * Two APIs because no single one is everywhere: `caretRangeFromPoint` is
     * the WebKit/Blink spelling, `caretPositionFromPoint` the standardised
     * one Firefox implements. Without this the image would land wherever the
     * caret happened to be before the drag, which for a drag from the
     * desktop is usually nowhere near the drop point.
     */
    const caretAtPoint = (x: number, y: number) => (): boolean => {
      const doc = editor._window?.document ?? document;
      let range: Range | null = null;

      const withRangeFromPoint = doc as Document & {
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
      };
      if (typeof withRangeFromPoint.caretRangeFromPoint === "function") {
        range = withRangeFromPoint.caretRangeFromPoint(x, y);
      } else if (typeof doc.caretPositionFromPoint === "function") {
        const position = doc.caretPositionFromPoint(x, y);
        if (position) {
          range = doc.createRange();
          range.setStart(position.offsetNode, position.offset);
          range.collapse(true);
        }
      }
      if (!range) return false;

      const selection = $createRangeSelection();
      selection.applyDOMRange(range);
      $setSelection(selection);
      return true;
    };

    // `items` rather than `files`: during a drag the browser withholds the
    // file list until drop, so `files` is empty in dragover and the handler
    // below would decline to accept the drop.
    const draggingImages = (transfer: DataTransfer | null) =>
      Array.from(transfer?.items ?? []).some(
        (item) => item.kind === "file" && item.type.startsWith("image/"),
      );

    /**
     * Moving an image that is already in the document, by dragging the
     * image itself.
     *
     * The drag handle in the gutter can already move any block, images
     * included — but grabbing the picture is what people actually try
     * first, and an <img> is natively draggable, so that gesture used to
     * start a *browser* image drag that went nowhere. Rather than kill the
     * native drag with `draggable={false}` and leave the instinct
     * unrewarded, the drag is taken over here.
     *
     * A private format string, so nothing outside this file can be mistaken
     * for it: a picture dragged in from another page also arrives as a drop
     * with `text/uri-list`, and that one is deliberately NOT handled (see
     * the note above about re-hosting remote images).
     */
    const MOVE_FORMAT = "application/x-wildrunner-move-upload";

    /** The upload node a DOM node sits inside, if any. */
    const $uploadNodeFrom = (target: EventTarget | null) => {
      if (!(target instanceof Node)) return null;
      const nearest = $getNearestNodeFromDOMNode(target);
      if (!nearest) return null;
      if ($isMemberUploadNode(nearest)) return nearest;
      const parent = $findMatchingParent(nearest, (node) =>
        $isMemberUploadNode(node),
      );
      return $isMemberUploadNode(parent) ? parent : null;
    };

    const draggingUpload = (transfer: DataTransfer | null) =>
      Array.from(transfer?.types ?? []).includes(MOVE_FORMAT);

    return mergeRegister(
      editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          if (!(event instanceof ClipboardEvent)) return false;
          const clipboardData = event.clipboardData;
          if (!clipboardData?.types?.length) return false;
          if (clipboardData.types.includes("text/html")) return false;

          const images = imagesFrom(clipboardData);
          if (images.length === 0) return false;

          event.preventDefault();
          for (const file of images) insertImage(file, keepExistingCaret);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        INSERT_IMAGE_FILES_COMMAND,
        (files) => {
          const images = files.filter((file) => file.type.startsWith("image/"));
          if (images.length === 0) return false;
          for (const file of images) insertImage(file, keepExistingCaret);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        DRAGSTART_COMMAND,
        (event) => {
          if (!(event instanceof DragEvent)) return false;
          const transfer = event.dataTransfer;
          if (!transfer) return false;
          const upload = $uploadNodeFrom(event.target);
          if (!upload) return false;

          // The browser's own image drag would otherwise win and carry a
          // URL to nowhere. Claiming it here turns the instinctive gesture
          // into a block move.
          transfer.setData(MOVE_FORMAT, upload.getKey());
          transfer.effectAllowed = "move";
          if (event.target instanceof HTMLElement) {
            transfer.setDragImage(event.target, 0, 0);
          }
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        DRAGOVER_COMMAND,
        (event) => {
          if (!(event instanceof DragEvent)) return false;
          if (
            !draggingImages(event.dataTransfer) &&
            !draggingUpload(event.dataTransfer)
          ) {
            return false;
          }
          // Required, and easy to miss: without preventDefault on *dragover*
          // the browser refuses the drop and instead navigates the tab to
          // the dropped file, discarding whatever was being edited.
          event.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        DROP_COMMAND,
        (event) => {
          if (!(event instanceof DragEvent)) return false;
          const { clientX, clientY } = event;

          // An image being moved within the document.
          const movingKey = event.dataTransfer?.getData(MOVE_FORMAT);
          if (movingKey) {
            event.preventDefault();
            editor.update(() => {
              const upload = $getNodeByKey(movingKey);
              if (!$isMemberUploadNode(upload)) return;
              // Caret first, then move: placing it after the node was
              // removed would resolve against a document that no longer
              // matches the coordinates the pointer was over.
              if (!caretAtPoint(clientX, clientY)()) return;
              const selection = $getSelection();
              if (!$isRangeSelection(selection)) return;
              const target = selection.focus
                .getNode()
                .getTopLevelElement();
              if (!target || target.is(upload)) return;
              upload.remove();
              target.insertAfter(upload);
            });
            return true;
          }

          const images = imagesFrom(event.dataTransfer);
          // Returning false for a block-handle drag is what lets
          // DraggableBlockPlugin do its job: that drag carries neither
          // files nor our own format, so it falls through untouched.
          if (images.length === 0) return false;

          event.preventDefault();
          for (const file of images) {
            insertImage(file, caretAtPoint(clientX, clientY));
          }
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor]);

  return null;
}

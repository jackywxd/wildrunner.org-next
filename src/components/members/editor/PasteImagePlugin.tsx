"use client";

import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@payloadcms/richtext-lexical/lexical/react/LexicalComposerContext";
import {
  $getPreviousSelection,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  PASTE_COMMAND,
} from "@payloadcms/richtext-lexical/lexical";
import {
  $dfsIterator,
  $insertNodeToNearestRoot,
} from "@payloadcms/richtext-lexical/lexical/utils";
import {
  $createMemberUploadNode,
  $createPendingUploadNode,
  $isPendingUploadNode,
} from "@/lib/editor/nodes";
import { newObjectIdHex } from "@/lib/editor/object-id";
import { uploadImageFile } from "@/lib/members/upload-image";

/**
 * Paste an image straight into the document.
 *
 * Follows the shape of Payload's own upload plugin
 * (@payloadcms/richtext-lexical/dist/features/upload/client/plugin), which
 * already worked out the two clipboard cases:
 *
 *   screenshot / copied image file → clipboardData.files, no text/html
 *   image copied from a web page   → clipboardData carries text/html
 *
 * Only the first is handled here. The second is deliberately left to
 * Lexical's normal HTML paste (which drops the <img>, since neither
 * MemberUploadNode nor MemberLinkNode implements importDOM): re-hosting an
 * arbitrary remote image on someone's behalf is a copyright and quota
 * decision the member should make explicitly through the media library,
 * not a side effect of pasting formatted text.
 *
 * What differs from Payload's version is the ending: it opens the admin's
 * bulk-upload drawer via useBulkUpload/useModal, which would pull the whole
 * Payload admin UI in. This calls src/lib/members/upload-image.ts, a thin
 * wrapper over the same src/lib/direct-upload.ts the media library and the
 * admin panel already use.
 */
export function PasteImagePlugin({
  onPendingChange,
}: {
  onPendingChange: (count: number) => void;
}) {
  const [editor] = useLexicalComposerContext();
  // Per-instance, and read through a ref so the registered command always
  // sees the current callback without re-registering on every render.
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

    return editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        if (!(event instanceof ClipboardEvent)) return false;
        const clipboardData = event.clipboardData;
        if (!clipboardData?.types?.length) return false;
        if (clipboardData.types.includes("text/html")) return false;

        const images = Array.from(clipboardData.files ?? []).filter((file) =>
          file.type.startsWith("image/"),
        );
        if (images.length === 0) return false;

        event.preventDefault();

        for (const file of images) {
          const uploadId = newObjectIdHex();
          const objectUrl = URL.createObjectURL(file);

          let inserted = false;
          editor.update(
            () => {
              const selection = $getSelection() || $getPreviousSelection();
              if (!$isRangeSelection(selection)) return;
              // Paste replaces the selection, as everywhere else. Stated
              // explicitly rather than left to whatever insertion happens to
              // do with a non-collapsed range.
              if (!selection.isCollapsed()) selection.removeText();
              const focusNode = selection.focus.getNode();
              $insertNodeToNearestRoot(
                $createPendingUploadNode({ uploadId, src: objectUrl }),
              );
              // Drop the empty paragraph the caret sat in, so pasting onto a
              // blank line doesn't leave a gap above the image.
              if ($isParagraphNode(focusNode) && !focusNode.getFirstChild()) {
                focusNode.remove();
              }
              inserted = true;
            },
            {
              // The upload starts from here, not after the `update()` call:
              // Lexical defers the closure, so reading `inserted` straight
              // after `update()` returns would always still see `false`.
              // Without a placeholder there is nothing to settle the upload
              // into, so it would spend the member's quota on an image that
              // could never appear in the document.
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
        }

        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  return null;
}

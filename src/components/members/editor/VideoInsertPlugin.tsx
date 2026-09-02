"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLexicalComposerContext } from "@payloadcms/richtext-lexical/lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  createCommand,
} from "@payloadcms/richtext-lexical/lexical";
import type { LexicalCommand } from "@payloadcms/richtext-lexical/lexical";
import { $insertNodeToNearestRoot } from "@payloadcms/richtext-lexical/lexical/utils";

import { MediaPickerDialog } from "@/components/members/media/MediaPickerDialog";
import { $createMemberUploadNode } from "@/lib/editor/nodes";
import { newObjectIdHex } from "@/lib/editor/object-id";
import { uploadVideoFile } from "@/lib/members/upload-video";

/**
 * Video in an article, and one file already in the library.
 *
 * WHY THIS IS NOT PART OF `ImageInsertPlugin`, which already uploads into the
 * document: because the placeholder is exactly what a video must not have.
 * That plugin inserts a `PendingUploadNode` first and settles it when the
 * bytes land — right for a pasted screenshot, which is a second or two — and
 * `PostEditor` blocks every save while one exists, because `toPayloadContent`
 * refuses to serialize a node with no media id. A 1 GB video at a domestic
 * upload speed is twenty-odd minutes, and twenty-odd minutes of an article
 * that cannot be saved is how a member loses an afternoon's writing to a
 * closed tab.
 *
 * So the order is inverted here: **upload first, insert when it lands.** The
 * document is never in a state that cannot be saved, and the progress the
 * member needs to see lives in a panel beside the toolbar instead of in the
 * text. The cost is that the video appears at wherever the caret is when the
 * upload finishes rather than where it started, which the panel says out
 * loud.
 *
 * The picker shares the dialog the cover field uses, and takes "all" rather
 * than "video": an upload node holds a media id whatever its type, and the
 * public converter (payload-rich-text.tsx) has branched on the mime type to
 * draw a player or a picture since #113. Reusing an already-uploaded file is
 * the cheapest path there is — no bytes, no quota, no second transcode.
 */

export const INSERT_VIDEO_FILE_COMMAND: LexicalCommand<File> = createCommand(
  "INSERT_VIDEO_FILE_COMMAND",
);

export const OPEN_MEDIA_PICKER_COMMAND: LexicalCommand<void> = createCommand(
  "OPEN_MEDIA_PICKER_COMMAND",
);

type Upload = {
  error?: string;
  id: string;
  name: string;
  percent: number;
};

export function VideoInsertPlugin({ ownerId }: { ownerId: number }) {
  const [editor] = useLexicalComposerContext();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [picking, setPicking] = useState(false);

  const insertMedia = useCallback(
    (mediaId: number) => {
      editor.update(() => {
        const node = $createMemberUploadNode({
          relationTo: "media",
          value: mediaId,
        });
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          if (!selection.isCollapsed()) selection.removeText();
          $insertNodeToNearestRoot(node);
          return;
        }
        // No selection at all, which is the ordinary case for an upload that
        // finished while the member was reading something else in another
        // tab. Appending needs the trailing paragraph written by hand —
        // `$insertNodeToNearestRoot` adds one itself, and without it the
        // document ends on a decorator the caret cannot be placed after.
        const root = $getRoot();
        root.append(node);
        node.insertAfter($createParagraphNode());
      });
    },
    [editor],
  );

  const startUpload = useCallback(
    (file: File) => {
      const id = newObjectIdHex();
      setUploads((current) => [
        ...current,
        { id, name: file.name, percent: 0 },
      ]);

      const patch = (change: Partial<Upload>) =>
        setUploads((current) =>
          current.map((item) => (item.id === id ? { ...item, ...change } : item)),
        );

      uploadVideoFile(file, { onProgress: (percent) => patch({ percent }) })
        .then((mediaId) => {
          insertMedia(mediaId);
          setUploads((current) => current.filter((item) => item.id !== id));
        })
        .catch((cause) => {
          // Kept on screen rather than cleared. The member started this and
          // has been watching it; a row that simply vanishes is the silence
          // this repo keeps writing down as the worst outcome.
          patch({
            error: (cause as Error)?.message || "上傳失敗，請再試一次。",
          });
        });
    },
    [insertMedia],
  );

  // Through a ref so the registered commands always call the current closure
  // without re-registering on every render.
  const startRef = useRef(startUpload);
  startRef.current = startUpload;

  useEffect(() => {
    return editor.registerCommand(
      INSERT_VIDEO_FILE_COMMAND,
      (file) => {
        startRef.current(file);
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  useEffect(() => {
    return editor.registerCommand(
      OPEN_MEDIA_PICKER_COMMAND,
      () => {
        setPicking(true);
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  return (
    <>
      {uploads.length > 0 && (
        <div
          data-testid="editor-video-uploads"
          className="mb-2 space-y-1 border border-border p-2 text-xs"
        >
          {uploads.map((upload) => (
            <div
              key={upload.id}
              data-testid="editor-video-upload"
              className="flex items-center justify-between gap-3"
            >
              <span className="min-w-0 flex-1 truncate">{upload.name}</span>
              {upload.error ? (
                <span
                  data-testid="editor-video-error"
                  className="text-destructive"
                >
                  {upload.error}
                </span>
              ) : (
                <span className="text-foreground/50">
                  上傳中 {upload.percent}%，完成後插入到游標處
                </span>
              )}
              {upload.error && (
                <button
                  type="button"
                  className="text-foreground/40 hover:text-foreground"
                  onClick={() =>
                    setUploads((current) =>
                      current.filter((item) => item.id !== upload.id),
                    )
                  }
                >
                  關閉
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {picking && (
        <MediaPickerDialog
          kind="all"
          onClose={() => setPicking(false)}
          onPick={(media) => {
            insertMedia(media.id);
            setPicking(false);
          }}
          ownerId={ownerId}
        />
      )}
    </>
  );
}

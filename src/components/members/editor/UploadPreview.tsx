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
import { TranscodeBadge } from "@/components/members/media/TranscodeBadge";
import { useMediaById } from "@/lib/members/use-media";
import {
  IMAGE_WIDTHS,
  imageWidthClass,
  imageWidthOf,
  withImageWidth,
  type ImageWidth,
} from "@/lib/editor/image-width";
import { $isMemberUploadNode } from "@/lib/editor/nodes/upload-node";
import { cn } from "@/lib/utils";

/** What each preset is called on screen. */
const WIDTH_LABELS: Record<ImageWidth, string> = {
  full: "滿版",
  medium: "中",
  small: "小",
};

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
 * the control bar is here because a member should not have to discover a
 * selection model to remove a picture — and on a phone there is no
 * Backspace to discover it for.
 */
export function UploadPreview({
  nodeKey,
  value,
  fields,
}: {
  nodeKey: string;
  value: number | string;
  fields: unknown;
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
  const chosen = imageWidthOf(fields);

  const choose = useCallback(
    (width: ImageWidth) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (!$isMemberUploadNode(node)) return;
        const data = node.getData();
        node.setData({ ...data, fields: withImageWidth(data.fields, width) });
      });
    },
    [editor, nodeKey],
  );

  return (
    <div
      ref={containerRef}
      data-testid="editor-upload"
      data-media-id={String(value)}
      data-selected={isSelected ? "true" : "false"}
      // The block stays the width of the column and the *picture* narrows
      // inside it. Hugging the photo with the border was tried first and is
      // worse twice over: the control bar then has only the narrowed width
      // to sit in (four 44px targets need 188px; `small` on a 320px screen
      // leaves 141) so it wrapped to two rows and out-weighed the photo it
      // annotates — and a picture with nothing beside it gives the member
      // nothing to judge "narrower than what?" against.
      className={cn(
        "my-4 border",
        isSelected ? "border-primary ring-2 ring-primary" : "border-border",
      )}
    >
      {/*
        In normal flow above the picture, not floating on top of it, and
        always visible rather than revealed by hover or selection.

        Both of those are the same lesson, learned twice on a 320px screen.
        `small` there is a 149x100 frame and this bar is 141x92, so an
        overlay covers the picture it is meant to annotate — and the tap
        meant to select the image lands on a button instead. `opacity-0`
        does not prevent that (a transparent element still takes the tap),
        and neither does `pointer-events-none`: Chromium applies `:hover` on
        touchstart, so a `group-hover:pointer-events-auto` companion turns
        the bar clickable again before the click is dispatched. Measured —
        tapping the image set 滿版 and selected nothing, at 320px, with the
        bar never once visible.

        Hover is not a gesture a phone has, and this is the device these
        pictures are mostly placed on. So: no reveal rule at all.
      */}
      <div
        contentEditable={false}
        className="flex flex-wrap justify-end gap-1 border-b border-border bg-background p-1"
      >
        {/*
          Widths only for a picture. `payload-rich-text.tsx` sends a video to
          StreamVideoPlayer, which lays itself out — so a width chosen here
          would be stored, ignored on the page, and read as broken.
        */}
        {!isVideo &&
          IMAGE_WIDTHS.map((width) => (
            <button
              key={width}
              type="button"
              data-testid={`editor-upload-width-${width}`}
              aria-label={WIDTH_LABELS[width]}
              aria-pressed={chosen === width}
              // contentEditable={false} on the control: it lives inside the
              // editor's contenteditable subtree, and without this a click can
              // put the caret inside the button's own text instead of firing it.
              contentEditable={false}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                choose(width);
              }}
              className={cn(
                // 44x44 regardless of what the two characters inside need:
                // this is a thumb target on the device most of these choices
                // are made on. Measured at 44x34 with padding alone, which is
                // why the minimums are explicit and the box is a flex centre
                // rather than `py-`.
                "inline-flex min-h-[2.75rem] min-w-[2.75rem] items-center justify-center border px-2 text-xs",
                chosen === width
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-secondary",
              )}
            >
              {WIDTH_LABELS[width]}
            </button>
          ))}
        <button
          type="button"
          data-testid="editor-upload-remove"
          aria-label="刪除媒體"
          contentEditable={false}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            remove();
          }}
          className="inline-flex min-h-[2.75rem] min-w-[2.75rem] items-center justify-center border border-border bg-background px-2 text-xs hover:bg-secondary"
        >
          刪除
        </button>
      </div>
      <div
        data-testid="editor-upload-picture"
        className={imageWidthClass(chosen)}
      >
        {isVideo && media ? (
          // The poster frame, for the reason the wall and the media library were
          // both changed: this used to be the string "▶ 影片" on a grey box, so
          // the screen where a member places a video was the one screen that
          // never showed them which video it was. The badge beside it is what
          // explains a clip that will not play yet — a transcode runs for
          // minutes after the upload, in a container, and without it "still
          // converting" and "failed three sweeps ago" look identical.
          //
          // NOT `VideoPosterTile`, which is the component that draws exactly
          // this elsewhere. It renders through next/image, and this file is
          // reachable from `@/lib/editor/nodes` — which `e2e/unit/lexical.spec`
          // imports into plain Node to round-trip a document with no browser and
          // no bundler. Adding it broke that lane with "Cannot find module
          // next/image", which is how this comment came to exist. The plain
          // `<img>` is also what this file already uses for images, and its own
          // reason holds here too: next/image's fill/absolute wrapper fights the
          // block layout inside contentEditable.
          <div className="relative aspect-video bg-neutral-900">
            {media.posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                data-testid="editor-upload-poster"
                src={media.posterUrl}
                alt={media.alt}
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-white/60">
                ▶ 影片
              </div>
            )}
            <TranscodeBadge item={media} />
          </div>
        ) : src && !isVideo ? (
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
    </div>
  );
}

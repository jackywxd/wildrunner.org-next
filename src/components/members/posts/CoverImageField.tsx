"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { mediaImageSrc } from "@/lib/cf-image";
import { uploadImageFile } from "@/lib/members/upload-image";
import type { Media } from "@/payload-types";

/**
 * The post's cover image — `posts.image`, the thing every social card
 * prefers before falling back to the body or a generated card
 * (src/lib/postOg.ts).
 *
 * This field had no control at all until now, which is why every
 * member-written post shared as a flat generated card no matter how many
 * photographs it contained. Editing a post never *lost* an existing cover —
 * `savePost` PATCHes, and `PostEditor` simply never sent the key, so Payload
 * left it alone (verified by editing and republishing a post with a cover
 * and re-reading `image_id`) — but there was no way to set, change or clear
 * one either.
 *
 * Takes and returns the media *id*, never a populated document: `posts.image`
 * stores an id, and the whole `depth: 0` discipline on the edit page exists
 * to keep populated Media objects from being written back into fields that
 * must hold ids.
 */

export function CoverImageField({
  mediaId,
  onBusyChange,
  onChange,
}: {
  mediaId: number | null;
  /** Saving is blocked while an upload is in flight — it has no id yet. */
  onBusyChange: (busy: boolean) => void;
  onChange: (mediaId: number | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState("");
  const [unreadable, setUnreadable] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  // Resolve the id to a picture. Separate request rather than a populated
  // relationship for the reason in this file's header: the page loads the
  // post at depth 0 on purpose.
  useEffect(() => {
    if (mediaId === null) {
      setSrc("");
      setUnreadable(false);
      return;
    }
    let cancelled = false;
    setUnreadable(false);
    fetch(`/api/media/${mediaId}?depth=0`, {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((doc) => {
        if (cancelled) return;
        const resolved = doc ? mediaImageSrc(doc as Media) : "";
        setSrc(resolved);
        // `Media.read` is `ownedOnlyPublicRead`, so a signed-in member sees
        // only their own library. A cover uploaded by somebody else is
        // therefore invisible *to the member who owns the post* — which is
        // e2e residue rather than a real shape (15 of 15 posts with a cover
        // on staging have the same owner for both), but it must degrade to
        // "cannot preview" rather than to "no cover", because reporting it
        // as absent would invite a member to replace an image that is
        // actually there and rendering fine to every visitor.
        if (!resolved) setUnreadable(true);
      })
      .catch(() => {
        if (!cancelled) setUnreadable(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  async function upload(file: File) {
    setError("");
    setUploading(true);
    onBusyChange(true);
    try {
      onChange(await uploadImageFile(file));
    } catch (cause) {
      setError(
        (cause as Error).message === "Storage quota exceeded"
          ? "儲存空間不足，請先到媒體庫刪除一些檔案。"
          : "上傳失敗，請再試一次。",
      );
    } finally {
      setUploading(false);
      onBusyChange(false);
      // Cleared so choosing the same file twice in a row still fires change.
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div data-testid="post-cover" className="grid gap-2 border border-border p-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">封面圖片</span>
        <span className="text-xs text-foreground/50">
          分享到社群時顯示的圖片。未設定時會改用內文第一張圖。
        </span>
      </div>

      {src ? (
        // Not next/image: this is an author-facing thumbnail of an arbitrary
        // media URL, and the public page is where the optimised render
        // belongs.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          data-testid="post-cover-image"
          src={src}
          alt=""
          className="max-h-48 w-full border border-border object-contain"
        />
      ) : unreadable ? (
        <p data-testid="post-cover-unreadable" className="text-xs text-foreground/50">
          目前的封面圖片無法在這裡預覽（媒體 #{mediaId}），但它仍會正常顯示。
        </p>
      ) : (
        <p data-testid="post-cover-empty" className="text-xs text-foreground/50">
          尚未設定封面圖片。
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          data-testid="post-cover-file"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <Button
          data-testid="post-cover-upload"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? "上傳中…" : src || unreadable ? "更換圖片" : "上傳圖片"}
        </Button>
        {mediaId !== null && (
          <Button
            data-testid="post-cover-remove"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => onChange(null)}
          >
            移除
          </Button>
        )}
      </div>

      {error && (
        <span data-testid="post-cover-error" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MediaPickerDialog } from "@/components/members/media/MediaPickerDialog";
import { mediaImageSrc } from "@/lib/cf-image";
import { uploadImageFile } from "@/lib/members/upload-image";
import { generatedAvatar } from "@/lib/riders/avatar";
import type { Media } from "@/payload-types";

/**
 * The member's avatar — `authors.avatar`, which the rider directory and
 * /riders/<slug> have rendered since they were built.
 *
 * WHY THIS DID NOT EXIST. Every other piece of this feature was already
 * finished: the upload field on the collection, `RiderAvatar`'s
 * uploaded-or-generated branch, the public pages that draw it.
 * `src/lib/riders/avatar.ts` opens with "No member has uploaded an avatar",
 * which read as a statement about members and was really a statement about
 * the interface — there was nowhere to upload one. The design mock at
 * design-preview/profile has had a 更換頭像 button in it the whole time.
 *
 * Modelled on `CoverImageField` down to the shape of its state, because the
 * problem is the same one: hold a media *id*, resolve it to a picture for
 * preview, and offer upload-or-pick over the member's own library. Two
 * differences that are deliberate:
 *
 *   - It uploads as `usage: 'private'`, not 'attachment'. An avatar is
 *     neither photo-wall content nor an article attachment, and 'gallery' —
 *     the schema default — would put every member's face on /gallery. See
 *     `upload-image.ts` on why that value is now a required argument.
 *   - Empty renders the *generated* avatar rather than a "nothing set" line.
 *     There is no blank state on the public side: a member with no upload
 *     already has a face, and the preview's job is to show the one visitors
 *     see, so that "upload" reads as replacing it rather than filling a void.
 */

export function AvatarField({
  mediaId,
  name,
  onBusyChange,
  onChange,
  ownerId,
  slug,
}: {
  mediaId: number | null;
  /** Drives the generated fallback's initial; live from the form's own
   *  alias input, so the preview tracks what is being typed. */
  name: string;
  /** Saving is blocked while an upload is in flight — it has no id yet. */
  onBusyChange: (busy: boolean) => void;
  onChange: (mediaId: number | null) => void;
  /** Whose library the picker offers — see MediaPickerDialog on why it is
   *  always scoped, even though a member's read rule already scopes it. */
  ownerId: number;
  /** The generated avatar is keyed on the slug, never the name, so a rename
   *  does not change someone's face. Same argument as lib/riders/avatar.ts. */
  slug: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState("");
  const [unreadable, setUnreadable] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState("");

  // Resolve the id to a picture. A separate request rather than a populated
  // relationship: the profile page loads the author at depth 0, for the same
  // PII reason every other members-area query does.
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
        // Degrade to "cannot preview", never to "no avatar" — an admin can
        // set this field from /admin, and `Media.read` scopes a member to
        // their own library, so an avatar somebody else uploaded is
        // invisible here while rendering fine to every visitor. Reporting it
        // as absent would invite a member to replace a picture that is
        // already there and working.
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
      onChange(await uploadImageFile(file, "private"));
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

  const generated = generatedAvatar(slug, name);

  return (
    <div className="flex flex-wrap items-start gap-4" data-testid="profile-avatar">
      {src ? (
        // Not next/image, matching CoverImageField: this is a member-facing
        // thumbnail of an arbitrary media URL, and the public page is where
        // the optimised render belongs.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className="size-20 shrink-0 border border-border object-cover"
          data-avatar-kind="uploaded"
          data-testid="profile-avatar-image"
          src={src}
        />
      ) : (
        <div
          aria-label={name}
          className="flex size-20 shrink-0 select-none items-center justify-center overflow-hidden text-white"
          data-avatar-kind="generated"
          data-testid="profile-avatar-image"
          role="img"
          style={{
            backgroundImage: `linear-gradient(135deg, ${generated.from}, ${generated.to})`,
          }}
        >
          <span
            className="font-heading text-[35px] font-black leading-none"
            aria-hidden
          >
            {generated.initial}
          </span>
        </div>
      )}

      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-xs text-foreground/50">
          {unreadable
            ? `目前的頭像無法在這裡預覽（媒體 #${mediaId}），但它仍會正常顯示。`
            : src
              ? "顯示在成員名錄和你的公開頁面上。"
              : "還沒有設定頭像，現在顯示的是系統依你的名稱產生的圖案。"}
        </p>

        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            accept="image/*"
            className="hidden"
            data-testid="profile-avatar-file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
            type="file"
          />
          <Button
            data-testid="profile-avatar-upload"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            size="sm"
            variant="outline"
          >
            {uploading ? "上傳中…" : src || unreadable ? "更換頭像" : "上傳頭像"}
          </Button>
          <Button
            data-testid="profile-avatar-library"
            disabled={uploading}
            onClick={() => setPicking(true)}
            size="sm"
            variant="outline"
          >
            從媒體庫選擇
          </Button>
          {mediaId !== null && (
            <Button
              data-testid="profile-avatar-remove"
              disabled={uploading}
              onClick={() => onChange(null)}
              size="sm"
              variant="outline"
            >
              移除
            </Button>
          )}
        </div>

        {error && (
          <span className="text-xs text-destructive" data-testid="profile-avatar-error">
            {error}
          </span>
        )}
      </div>

      {picking && (
        <MediaPickerDialog
          kind="photo"
          onClose={() => setPicking(false)}
          onPick={(media) => {
            // The id, not the document: `authors.avatar` stores an id, and
            // writing a populated Media object back would be the exact
            // mistake the depth:0 discipline exists to prevent.
            onChange(media.id);
            setPicking(false);
          }}
          ownerId={ownerId}
        />
      )}
    </div>
  );
}

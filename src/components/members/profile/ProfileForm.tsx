"use client";

import { useState } from "react";
import { AvatarField } from "@/components/members/profile/AvatarField";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input, Textarea } from "@/components/ui/input";

type Author = {
  /** The media id, never a populated document — see AvatarField. */
  avatar: number | null;
  bio: string;
  id: number;
  name: string;
  slug: string;
};

export function ProfileForm({
  author,
  displayName: initialDisplayName,
  email,
  userId,
}: {
  author: Author | null;
  displayName: string;
  /** Read-only: changing it is an auth flow (re-verification), not a text
   *  field. Shown because "which account am I signed in as" is the question
   *  this section exists to answer. */
  email: string;
  userId: number;
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [authorName, setAuthorName] = useState(author?.name ?? "");
  const [avatar, setAvatar] = useState<number | null>(author?.avatar ?? null);
  const [bio, setBio] = useState(author?.bio ?? "");
  // An upload in flight has no id yet, so saving now would persist the old
  // avatar and silently discard the new one. Same guard as the post editor.
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  async function save() {
    setStatus("saving");
    try {
      const requests = [
        fetch(`/api/users/${userId}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName }),
        }),
      ];
      if (author) {
        requests.push(
          fetch(`/api/authors/${author.id}`, {
            method: "PATCH",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ avatar, bio, name: authorName }),
          }),
        );
      }
      const responses = await Promise.all(requests);
      if (responses.some((r) => !r.ok)) throw new Error("save failed");
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }


  return (
    <div className="mt-6 space-y-8">
      <section className="space-y-4 border border-border p-4">
        <div>
          <h2 className="font-heading text-sm font-semibold text-foreground/70">
            公開身分
          </h2>
          <p className="mt-1 text-xs text-foreground/50">
            這一區的內容會顯示在成員名錄和你的公開頁面上。
          </p>
        </div>
        {author && (
          <AvatarField
            mediaId={avatar}
            name={authorName || "?"}
            onBusyChange={setUploading}
            onChange={setAvatar}
            ownerId={userId}
            slug={author.slug}
          />
        )}
        <label className="block space-y-1">
          <FieldLabel>別名</FieldLabel>
          <Input
            data-testid="profile-author-name"
            disabled={!author}
            onChange={(e) => setAuthorName(e.target.value)}
            value={authorName}
          />
        </label>
        <label className="block space-y-1">
          <FieldLabel>簡介</FieldLabel>
          <Textarea
            data-testid="profile-author-bio"
            disabled={!author}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            value={bio}
          />
        </label>
      </section>

      <section className="space-y-4 border border-border p-4">
        <h2 className="font-heading text-sm font-semibold text-foreground/70">
          帳號
        </h2>
        <label className="block space-y-1">
          <FieldLabel hint="只有你自己看得到">顯示名稱</FieldLabel>
          <Input
            data-testid="profile-display-name"
            onChange={(e) => setDisplayName(e.target.value)}
            value={displayName}
          />
        </label>
        <label className="block space-y-1">
          <FieldLabel>電子郵件</FieldLabel>
          <Input data-testid="profile-email" disabled readOnly value={email} />
        </label>
      </section>

      {/*
        The storage block that used to sit here is gone, not moved: it was a
        verbatim copy of the one on /members, and /members/media has the real
        one — next to the uploads and the delete controls, which are the only
        way to act on the number. Three copies of a figure nobody can change
        from two of those places is not three chances to notice it.
      */}

      <div className="flex items-center justify-end gap-3">
        {status === "saved" && (
          <span data-testid="profile-save-success" className="text-xs text-foreground/60">
            已儲存
          </span>
        )}
        {status === "error" && (
          <span className="text-xs text-destructive">儲存失敗，請再試一次</span>
        )}
        <Button
          data-testid="profile-save"
          className="justify-center"
          disabled={status === "saving" || uploading}
          onClick={save}
        >
          儲存變更
        </Button>
      </div>
    </div>
  );
}

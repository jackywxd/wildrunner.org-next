"use client";

import { useState } from "react";
import { AvatarField } from "@/components/members/profile/AvatarField";
import { Button } from "@/components/ui/button";

const toGb = (bytes: number) => (bytes / (1024 * 1024 * 1024)).toFixed(2);

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
  quotaBytes,
  usedBytes,
  userId,
}: {
  author: Author | null;
  displayName: string;
  quotaBytes: number;
  usedBytes: number;
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

  const percent =
    quotaBytes > 0 ? Math.min(Math.round((usedBytes / quotaBytes) * 100), 100) : 0;

  return (
    <div className="mt-6 space-y-8">
      <section className="space-y-4 border border-border p-4">
        <h2 className="font-heading text-sm font-semibold text-foreground/70">
          作者身分
        </h2>
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
          <span className="text-sm">別名（公開顯示）</span>
          <input
            data-testid="profile-author-name"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            disabled={!author}
            className="block w-full border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">簡介</span>
          <textarea
            data-testid="profile-author-bio"
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            disabled={!author}
            className="block w-full border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
      </section>

      <section className="space-y-4 border border-border p-4">
        <h2 className="font-heading text-sm font-semibold text-foreground/70">
          帳號
        </h2>
        <label className="block space-y-1">
          <span className="text-sm">顯示名稱</span>
          <input
            data-testid="profile-display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="block w-full border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
      </section>

      <section
        className="space-y-3 border border-border p-4"
        data-testid="quota-detail"
      >
        <h2 className="font-heading text-sm font-semibold text-foreground/70">
          儲存空間
        </h2>
        <div className="text-2xl font-heading">
          {toGb(usedBytes)}{" "}
          <span className="text-base text-foreground/50">
            / {toGb(quotaBytes)} GB
          </span>
        </div>
        <div className="h-1.5 bg-secondary">
          <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
      </section>

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

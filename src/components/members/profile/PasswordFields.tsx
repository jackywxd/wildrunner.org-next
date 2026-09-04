"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input } from "@/components/ui/input";

/**
 * 變更密碼, inside the account section of /members/profile.
 *
 * WHY THIS DID NOT EXIST: grepping the whole members area for "password"
 * returned exactly one hit, the input on the login form. There was no way to
 * change a password and no 忘記密碼 link, so a member who lost theirs had to
 * ask an admin — and the reset mail that admin triggered pointed at
 * `/admin/reset/<token>`, dropping them into the Payload admin app, whose
 * `users` collection is `hidden` for them.
 *
 * ITS OWN FORM, NOT PART OF THE PAGE'S 儲存變更. The rest of this page
 * PATCHes two documents and reports one "已儲存"; a password change goes
 * through a different endpoint, can fail for a reason unique to it (the
 * current password being wrong), and should not be silently bundled into a
 * click a member made to rename themselves. It also has to clear itself
 * afterwards, which a shared submit button would not do.
 */
export function PasswordFields() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  async function submit() {
    setError("");
    // Checked here as well as on the server: these two are about what the
    // member typed, so answering immediately is better than a round trip.
    // The server repeats them because a client-side rule is not a rule.
    if (next.length < 8) {
      setError("新密碼至少要 8 個字元");
      return;
    }
    if (next !== confirm) {
      setError("兩次輸入的新密碼不一樣");
      return;
    }

    setStatus("saving");
    try {
      const response = await fetch("/api/members/change-password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as
          | { errors?: { message?: string }[] }
          | null;
        throw new Error(detail?.errors?.[0]?.message ?? "變更失敗，請再試一次");
      }
      // Cleared on success so the old password does not sit in a form field
      // on a shared screen after the member has walked away from it.
      reset();
      setStatus("saved");
      setOpen(false);
    } catch (cause) {
      setError((cause as Error).message);
      setStatus("idle");
    }
  }

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <Button
          data-testid="profile-password-open"
          onClick={() => {
            setStatus("idle");
            setError("");
            setOpen(true);
          }}
          size="sm"
          variant="outline"
        >
          變更密碼
        </Button>
        {status === "saved" && (
          <span
            className="text-xs text-foreground/60"
            data-testid="profile-password-success"
          >
            密碼已變更
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 border border-border p-3" data-testid="profile-password">
      <label className="block space-y-1">
        <FieldLabel>目前的密碼</FieldLabel>
        <Input
          autoComplete="current-password"
          data-testid="profile-password-current"
          onChange={(e) => setCurrent(e.target.value)}
          type="password"
          value={current}
        />
      </label>
      <label className="block space-y-1">
        <FieldLabel hint="至少 8 個字元">新密碼</FieldLabel>
        <Input
          autoComplete="new-password"
          data-testid="profile-password-new"
          onChange={(e) => setNext(e.target.value)}
          type="password"
          value={next}
        />
      </label>
      <label className="block space-y-1">
        <FieldLabel>再輸入一次新密碼</FieldLabel>
        <Input
          autoComplete="new-password"
          data-testid="profile-password-confirm"
          onChange={(e) => setConfirm(e.target.value)}
          type="password"
          value={confirm}
        />
      </label>

      {error && (
        <p className="text-xs text-destructive" data-testid="profile-password-error">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          data-testid="profile-password-submit"
          disabled={status === "saving"}
          onClick={submit}
          size="sm"
        >
          {status === "saving" ? "變更中…" : "確認變更"}
        </Button>
        <Button
          onClick={() => {
            reset();
            setError("");
            setOpen(false);
          }}
          size="sm"
          variant="outline"
        >
          取消
        </Button>
      </div>
    </div>
  );
}

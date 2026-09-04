"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import SiteLogo from "@/components/site-logo";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input } from "@/components/ui/input";

/**
 * Set a password from an emailed token — both the reset flow and the one a
 * new member follows out of their invitation.
 *
 * IT SERVES BOTH ON PURPOSE. `inviteLinkFor()` builds one URL for two mails,
 * branching on `invitePending` (see `Users.auth.forgotPassword`), so this page
 * cannot assume the member has ever had a password. It says 設定密碼 rather
 * than 重設密碼 for that reason: for roughly half the people who arrive here
 * it is the first one.
 *
 * `/admin/reset/<token>` STILL WORKS and is not removed. It is Payload's own
 * route, tokens already in inboxes point at it, and taking it away would
 * break a link somebody is holding.
 *
 * Payload's `resetPassword` returns a JWT and signs the member in, so the
 * right destination afterwards is the members area, not the login form.
 */
export default function MemberResetPasswordPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("密碼至少要 8 個字元");
      return;
    }
    if (password !== confirm) {
      setError("兩次輸入的密碼不一樣");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/users/reset-password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: params.token, password }),
      });
      if (!response.ok) {
        // The overwhelmingly common cause, and the only one the member can
        // act on: the link has expired or has already been used once.
        setError("這個連結已經失效或已經用過了，請重新申請一次。");
        setSubmitting(false);
        return;
      }
      router.replace("/members");
    } catch {
      setError("設定密碼時發生錯誤，請再試一次");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[100vh] max-w-sm flex-col justify-center px-4">
      <div className="mb-8 flex flex-col items-start gap-3">
        <SiteLogo />
        <span className="font-heading text-lg font-semibold">設定密碼</span>
      </div>
      <form className="space-y-4" data-testid="member-reset-form" onSubmit={submit}>
        <label className="block space-y-1">
          <FieldLabel hint="至少 8 個字元">新密碼</FieldLabel>
          <Input
            autoComplete="new-password"
            data-testid="member-reset-password"
            onChange={(e) => setPassword(e.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        <label className="block space-y-1">
          <FieldLabel>再輸入一次</FieldLabel>
          <Input
            autoComplete="new-password"
            data-testid="member-reset-confirm"
            onChange={(e) => setConfirm(e.target.value)}
            required
            type="password"
            value={confirm}
          />
        </label>
        {error && (
          <p className="text-sm text-destructive" data-testid="member-reset-error">
            {error}
          </p>
        )}
        <Button
          className="w-full justify-center"
          data-testid="member-reset-submit"
          disabled={submitting}
          type="submit"
        >
          {submitting ? "設定中…" : "設定密碼並登入"}
        </Button>
        <Link
          className="block text-sm text-primary hover:underline"
          href="/members/forgot"
        >
          重新申請一個連結
        </Link>
      </form>
    </div>
  );
}

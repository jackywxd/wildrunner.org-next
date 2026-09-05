"use client";

import Link from "@/components/i18n/locale-link";
import { useState } from "react";
import SiteLogo from "@/components/site-logo";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input } from "@/components/ui/input";

/**
 * 忘記密碼, for members.
 *
 * A MEMBER-FACING PAGE FOR A FLOW THAT ALREADY EXISTED. Payload's
 * `/api/users/forgot-password` has always worked; nothing in the members area
 * called it and the login page offered no link to it, so the only route back
 * into a locked account was to ask an admin.
 *
 * THE ANSWER IS THE SAME WHETHER OR NOT THE ADDRESS EXISTS, and that is not
 * this page being coy — it is what the server does. `forgotPassword.js`
 * returns `null` when no user matches, so there is no different answer
 * available to render, and rendering one would be inventing an account
 * oracle that the API deliberately does not provide.
 */
export default function MemberForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/users/forgot-password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } finally {
      // Shown even if the request failed, for the same reason the server
      // does not say whether the address exists.
      setSent(true);
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[100vh] max-w-sm flex-col justify-center px-4">
      <div className="mb-8 flex flex-col items-start gap-3">
        <SiteLogo />
        <span className="font-heading text-lg font-semibold">重設密碼</span>
      </div>

      {sent ? (
        <div className="space-y-4" data-testid="member-forgot-sent">
          <p className="text-sm">
            如果 <span className="font-medium">{email}</span> 是野馬營的帳號，
            我們已經寄出一封重設密碼的信。請查看收件匣，連結一天內有效。
          </p>
          <Link className="text-sm text-primary hover:underline" href="/members/login">
            回到登入
          </Link>
        </div>
      ) : (
        <form className="space-y-4" data-testid="member-forgot-form" onSubmit={submit}>
          <p className="text-sm text-foreground/60">
            輸入你的電子郵件，我們會寄一個重設密碼的連結給你。
          </p>
          <label className="block space-y-1">
            <FieldLabel>電子郵件</FieldLabel>
            <Input
              autoComplete="email"
              data-testid="member-forgot-email"
              onChange={(e) => setEmail(e.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <Button
            className="w-full justify-center"
            data-testid="member-forgot-submit"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "寄送中…" : "寄出重設連結"}
          </Button>
          <Link
            className="block text-sm text-primary hover:underline"
            href="/members/login"
          >
            回到登入
          </Link>
        </form>
      )}
    </div>
  );
}

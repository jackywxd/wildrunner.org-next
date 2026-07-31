"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import SiteLogo from "@/components/site-logo";

/**
 * A cross-site navigation (e.g. a link from an email client) reaches this
 * page with `Sec-Fetch-Site: cross-site`, which Payload's CSRF check reads
 * as logged-out even with a valid session cookie. This same-origin fetch
 * carries a real `Origin` header, so it resolves the session correctly and
 * skips straight past the login form if one already exists.
 */
export default function MemberLoginPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/users/me", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (cancelled) return;
        if ((body as { user?: unknown } | null)?.user) {
          router.replace("/members");
          return;
        }
        setChecking(false);
      })
      .catch(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/users/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          errors?: { message?: string }[];
        };
        setError(body?.errors?.[0]?.message || "電子郵件或密碼錯誤");
        setSubmitting(false);
        return;
      }
      router.replace("/members");
    } catch {
      setError("登入時發生錯誤，請再試一次");
      setSubmitting(false);
    }
  }

  if (checking) return null;

  return (
    <div className="mx-auto flex min-h-[100vh] max-w-sm flex-col justify-center px-4">
      {/* The same lockup /admin/login shows, via the site's own logo
          component rather than the admin one: SiteLogo already picks the
          right artwork per theme, and this page lives under (site) where
          next-themes is in play. */}
      <div className="mb-8 flex flex-col items-start gap-3">
        <SiteLogo />
        <span className="font-heading text-lg font-semibold">會員登入</span>
      </div>
      <form
        data-testid="member-login-form"
        onSubmit={submit}
        className="space-y-4"
      >
        <label className="block space-y-1">
          <span className="text-sm">電子郵件</span>
          <input
            type="email"
            required
            data-testid="member-login-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="block w-full border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">密碼</span>
          <input
            type="password"
            required
            data-testid="member-login-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="block w-full border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        {error && (
          <p data-testid="member-login-error" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button
          type="submit"
          data-testid="member-login-submit"
          className="w-full justify-center"
          disabled={submitting}
        >
          登入
        </Button>
      </form>
    </div>
  );
}

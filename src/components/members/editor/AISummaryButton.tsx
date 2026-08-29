"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { proseOnly } from "@/lib/editor/ai-markers";
import type { PayloadContent } from "@/lib/editor/serialize";

/**
 * Write the 摘要 from the article, when the member asks.
 *
 * `description` is required on every post and it is the field left until
 * last: it is not the article, nobody reads it while writing, and it is the
 * one thing between a finished draft and publishing. It is also the most
 * public field on the post — the index, the meta description, the link
 * preview when somebody shares it.
 *
 * What comes back is a *suggestion*, shown beneath the field, never written
 * into it. A member who has already written their own summary must not lose
 * it to a button press, and this is the same rule the improve pane follows:
 * nothing is written until they say so.
 */

type SummaryResponse = {
  text?: string;
  errors?: { message?: string }[];
};

export function AISummaryButton({
  onUse,
  readDocument,
}: {
  onUse: (summary: string) => void;
  /** The document as it stands, or null while it cannot be read. */
  readDocument: () => PayloadContent | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState("");

  async function summarise() {
    const document = readDocument();
    if (!document) {
      setError("圖片還在上傳，等它完成再試一次。");
      return;
    }

    // Prose only: a `[[BLOCK-0]]` echoed back would end up printed on the
    // public site as this article's description. See proseOnly's header.
    const text = proseOnly(document);
    if (!text.trim()) {
      setError("文章還沒有內容可以摘要。");
      return;
    }

    setError("");
    setSuggestion("");
    setBusy(true);
    try {
      const response = await fetch("/api/ai/summarise-post", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const result = (await response.json()) as SummaryResponse;
      if (!response.ok || !result.text) {
        // Payload reports failures as `errors: [{ message }]`, so the
        // endpoint's own sentence — 「文章太長了…」 — reaches the member
        // instead of a generic apology that tells them nothing to act on.
        throw new Error(result.errors?.[0]?.message || "AI 服務暫時不可用。");
      }
      setSuggestion(result.text);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI 服務暫時不可用。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="ai-summary-run"
          onClick={summarise}
          disabled={busy}
          className="text-xs text-foreground/50 hover:text-primary disabled:opacity-50"
        >
          {busy ? "AI 產生摘要中…" : "AI 產生摘要"}
        </button>
        {error && (
          <span
            data-testid="ai-summary-error"
            role="alert"
            className="text-xs text-destructive"
          >
            {error}
          </span>
        )}
      </div>

      {suggestion && (
        <div
          data-testid="ai-summary-suggestion"
          className="grid gap-2 border border-primary bg-background p-3"
        >
          <p className="text-xs text-foreground/50">AI 建議的摘要</p>
          <p className="text-sm">{suggestion}</p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              data-testid="ai-summary-use"
              size="sm"
              onClick={() => {
                onUse(suggestion);
                setSuggestion("");
              }}
            >
              使用
            </Button>
            <Button
              type="button"
              data-testid="ai-summary-dismiss"
              variant="outline"
              size="sm"
              onClick={() => setSuggestion("")}
            >
              取消
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

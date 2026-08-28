"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ContentPreview } from "@/components/members/editor/ContentPreview";
import { fromAIText, toAIText } from "@/lib/editor/ai-markers";
import type { PayloadContent } from "@/lib/editor/serialize";

/**
 * AI that improves the article the member already wrote.
 *
 * It replaces a panel with a textarea in it, and the textarea was the
 * problem: a member with a finished draft had to paste it into a box to get
 * it improved, and what came back replaced the document wholesale — images
 * and all. So there is no input here. The subject is the document itself.
 *
 * Nothing is written until the member says so. The result appears beside
 * their own text and they accept or reject it, because "improve" is a
 * judgement the model cannot make on their behalf: it will smooth out a
 * turn of phrase they meant, and they have to be able to see that before it
 * is theirs. Rejecting leaves the document untouched — not restored, never
 * changed.
 *
 * The pictures are the hard part, and `src/lib/editor/ai-markers.ts` is
 * where that is solved: every image, table and rule leaves a `[[BLOCK-n]]`
 * line in the text the model sees, and goes back where the marker comes
 * back. This component only carries them across the request.
 */

type ImproveResponse = {
  text?: string;
  errors?: { message?: string }[];
};

export function AIImprovePanel({
  onAccept,
  onComparingChange,
  readDocument,
}: {
  onAccept: (content: PayloadContent) => void;
  onComparingChange: (comparing: boolean) => void;
  /** The document as it stands, or null while it cannot be read. */
  readDocument: () => PayloadContent | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /**
   * The document as it was when 完善 was pressed, kept rather than re-read.
   * The member can still type while the request is in flight, and a left
   * column that moved under them would make the comparison meaningless.
   */
  const [original, setOriginal] = useState<PayloadContent | null>(null);
  const [proposal, setProposal] = useState<PayloadContent | null>(null);
  /**
   * Which side a phone shows. Two columns of Chinese prose at phone width
   * are unreadable, so below `lg` this is a cover that switches rather than
   * a split — the same choice PostEditor's preview makes, for the same
   * reason.
   */
  const [side, setSide] = useState<"original" | "proposal">("proposal");

  function finish(next: PayloadContent | null) {
    setOriginal(next);
    setProposal(next);
    onComparingChange(next !== null);
  }

  async function improve() {
    const document = readDocument();
    if (!document) {
      setError("圖片還在上傳，等它完成再試一次。");
      return;
    }

    const marked = toAIText(document);
    if (!marked.text.trim()) {
      setError("文章還沒有內容可以完善。");
      return;
    }

    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/ai/improve-post", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: marked.text }),
      });
      const result = (await response.json()) as ImproveResponse;
      if (!response.ok || !result.text) {
        // Payload reports failures as `errors: [{ message }]`, so the
        // endpoint's own sentence — "文章太長了…" — reaches the member
        // instead of a generic apology that tells them nothing to act on.
        throw new Error(result.errors?.[0]?.message || "AI 服務暫時不可用。");
      }
      setOriginal(document);
      setProposal(fromAIText(result.text, marked.blocks));
      setSide("proposal");
      onComparingChange(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI 服務暫時不可用。");
    } finally {
      setBusy(false);
    }
  }

  if (!proposal || !original) {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="ai-improve-run"
          onClick={improve}
          disabled={busy}
          className="text-xs text-foreground/50 hover:text-primary disabled:opacity-50"
        >
          {busy ? "AI 完善中…" : "AI 完善文章"}
        </button>
        {error && (
          <span
            data-testid="ai-improve-error"
            role="alert"
            className="text-xs text-destructive"
          >
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <section data-testid="ai-improve-compare" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-semibold">AI 完善的版本</span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            data-testid="ai-improve-reject"
            variant="outline"
            size="sm"
            onClick={() => finish(null)}
          >
            拒絕
          </Button>
          <Button
            type="button"
            data-testid="ai-improve-accept"
            size="sm"
            onClick={() => {
              onAccept(proposal);
              finish(null);
            }}
          >
            接受
          </Button>
        </div>
      </div>

      {/* The switch is the phone's whole navigation between the two, so it
          is not offered where both are already on screen. */}
      <div className="flex gap-2 lg:hidden" data-testid="ai-improve-switch">
        {(["original", "proposal"] as const).map((value) => (
          <button
            key={value}
            type="button"
            data-testid={`ai-improve-side-${value}`}
            onClick={() => setSide(value)}
            className={
              side === value
                ? "border border-primary bg-primary px-3 py-1 text-xs text-primary-foreground"
                : "border border-border bg-background px-3 py-1 text-xs text-muted-foreground"
            }
          >
            {value === "original" ? "原文" : "AI 版本"}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div
          data-testid="ai-improve-original"
          className={`${side === "original" ? "block" : "hidden"} border border-border bg-background p-4 lg:block lg:max-h-[80vh] lg:overflow-y-auto`}
        >
          <p className="mb-3 text-xs text-foreground/50">原文</p>
          <ContentPreview content={original} />
        </div>
        <div
          data-testid="ai-improve-proposal"
          className={`${side === "proposal" ? "block" : "hidden"} border border-primary bg-background p-4 lg:block lg:max-h-[80vh] lg:overflow-y-auto`}
        >
          <p className="mb-3 text-xs text-foreground/50">AI 版本</p>
          <ContentPreview content={proposal} />
        </div>
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { PayloadContent } from "@/lib/editor/serialize";

type ExpandResponse = {
  content?: PayloadContent;
  error?: string;
};

/**
 * AI-assisted drafting for the member editor.
 *
 * Calls the same `/api/ai/expand-post` endpoint the admin panel's
 * AIAssistField uses — that endpoint is interface-agnostic, so nothing about
 * it changes here. What differs is only how the result reaches the editor:
 * the admin version has to dispatch a Payload form update carrying both
 * `value` and `initialValue` to force its Lexical field to remount, whereas
 * this owns the editor and hands the content straight to it.
 *
 * Collapsed by default: writing by hand is the common case, and an always-open
 * textarea above the document would push the actual writing surface down.
 */
export function AIAssistPanel({
  description,
  onContent,
  title,
}: {
  description: string;
  onContent: (content: PayloadContent) => void;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [outline, setOutline] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function expand() {
    if (!outline.trim()) {
      setError("請先輸入大綱或文章片段。");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/ai/expand-post", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, outline }),
      });
      const result = (await response.json()) as ExpandResponse;
      if (!response.ok || !result.content) {
        throw new Error(result.error || "AI 服務暫時不可用");
      }
      onContent(result.content);
      setOutline("");
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI 服務暫時不可用");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        data-testid="ai-assist-open"
        onClick={() => setOpen(true)}
        className="text-xs text-foreground/50 hover:text-primary"
      >
        AI 完善文章
      </button>
    );
  }

  return (
    <section
      data-testid="ai-assist"
      className="space-y-3 border border-border p-4"
    >
      <div className="flex items-center justify-between">
        <span className="font-heading text-sm font-semibold">AI 完善文章</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-foreground/50 hover:text-foreground"
        >
          收起
        </button>
      </div>
      <textarea
        data-testid="ai-assist-outline"
        rows={5}
        value={outline}
        onChange={(e) => setOutline(e.target.value)}
        placeholder="輸入文章大綱或已有片段；生成結果會取代目前的內文，並且只寫入草稿。"
        className="block w-full border border-input bg-background px-3 py-2 text-sm"
      />
      {error && (
        <p data-testid="ai-assist-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        type="button"
        data-testid="ai-assist-run"
        variant="outline"
        size="sm"
        className="justify-center"
        disabled={loading}
        onClick={expand}
      >
        {loading ? "生成中…" : "產生內文"}
      </Button>
    </section>
  );
}

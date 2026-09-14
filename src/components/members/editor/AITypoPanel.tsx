"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  applyCorrection,
  parseCorrections,
  toTypoText,
  type Correction,
} from "@/lib/editor/typos";
import type { PayloadContent } from "@/lib/editor/serialize";

/**
 * AI that finds the 錯別字 and changes nothing else.
 *
 * Deliberately not shaped like the improve pane next to it. That one shows
 * two versions of the whole article and asks for one answer, which is right
 * when every sentence may have moved. A proofread is a list: the model finds
 * five, two of them are wrong about a word the member meant, and the member
 * has to be able to keep those two and take the other three. One answer for
 * all five would mean either losing three corrections or accepting two
 * changes they disagree with.
 *
 * So each correction is its own card with its own 接受 and 拒絕, and accept
 * edits the document the moment it is pressed — the member watches the
 * character change in the editor below, which is the whole confirmation
 * this needs. 拒絕 writes nothing, ever: the card goes away and the word
 * stays as they wrote it.
 *
 * Everything the model says is checked against the document before it
 * reaches this component. See `src/lib/editor/typos.ts`.
 */

type TypoResponse = {
  text?: string;
  errors?: { message?: string }[];
};

/** How much of the sentence is shown either side of the correction. */
const CONTEXT_CHARS = 24;

export function AITypoPanel({
  onAccept,
  readDocument,
}: {
  onAccept: (content: PayloadContent) => void;
  /** The document as it stands, or null while it cannot be read. */
  readDocument: () => PayloadContent | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [corrections, setCorrections] = useState<Correction[]>([]);

  async function scan() {
    const document = readDocument();
    if (!document) {
      setError("圖片還在上傳，等它完成再試一次。");
      return;
    }

    const text = toTypoText(document);
    if (!text.trim()) {
      setError("文章還沒有內容可以檢查。");
      return;
    }

    setError("");
    setNotice("");
    setBusy(true);
    try {
      const response = await fetch("/api/ai/fix-typos", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const result = (await response.json()) as TypoResponse;
      if (!response.ok || typeof result.text !== "string") {
        // Payload reports failures as `errors: [{ message }]`, so the
        // endpoint's own sentence — 「文章太長了…」 — reaches the member
        // instead of a generic apology that tells them nothing to act on.
        throw new Error(result.errors?.[0]?.message || "AI 服務暫時不可用。");
      }
      // Parsed against the document that was sent, which is what the line
      // numbers in the reply count.
      const found = parseCorrections(result.text, document);
      setCorrections(found);
      if (!found.length) setNotice("沒有發現錯別字。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI 服務暫時不可用。");
    } finally {
      setBusy(false);
    }
  }

  function drop(correction: Correction) {
    setCorrections((list) => list.filter((item) => item !== correction));
  }

  function accept(correction: Correction) {
    const document = readDocument();
    if (!document) {
      setError("圖片還在上傳，等它完成再試一次。");
      return;
    }

    // Against the document as it stands, not the one that was scanned — the
    // member can keep writing while this list is open. Null means that
    // sentence has since been edited and this correction no longer fits it;
    // saying so and dropping the card is the only honest answer, because
    // where it would go is now a guess.
    const next = applyCorrection(document, correction);
    if (!next) {
      setError("那句話已經改過了，這一項先跳過。");
      drop(correction);
      return;
    }

    setError("");
    onAccept(next);
    drop(correction);
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="ai-typos-run"
          onClick={scan}
          disabled={busy}
          className="text-xs text-foreground/50 hover:text-primary disabled:opacity-50"
        >
          {busy ? "AI 檢查錯字中…" : "AI 改錯字"}
        </button>
        {notice && (
          <span data-testid="ai-typos-notice" className="text-xs text-foreground/50">
            {notice}
          </span>
        )}
        {error && (
          <span
            data-testid="ai-typos-error"
            role="alert"
            className="text-xs text-destructive"
          >
            {error}
          </span>
        )}
      </div>

      {corrections.length > 0 && (
        <section data-testid="ai-typos-list" className="grid gap-2">
          <p className="text-xs text-foreground/50">
            AI 找到 {corrections.length} 處可能的錯別字，一項一項決定。
          </p>
          {corrections.map((correction) => (
            <TypoCard
              // Line and fragment together: the same word can be wrong twice
              // in one article, and the same line can hold two corrections.
              key={`${correction.line}|${correction.wrong}|${correction.right}`}
              correction={correction}
              onAccept={() => accept(correction)}
              onReject={() => drop(correction)}
            />
          ))}
        </section>
      )}
    </div>
  );
}

/**
 * One correction, shown where it sits.
 *
 * The sentence around it is the point. 「己經 → 已經」 on its own is a
 * dictionary entry and the member cannot tell whether it is right without
 * the words either side — which is the whole question for 的/得/地, where
 * the same pair is a correction in one sentence and an error in the next.
 */
function TypoCard({
  correction,
  onAccept,
  onReject,
}: {
  correction: Correction;
  onAccept: () => void;
  onReject: () => void;
}) {
  const { context, wrong, right } = correction;
  // Exactly one occurrence, guaranteed by parseCorrections.
  const at = context.indexOf(wrong);
  const from = Math.max(0, at - CONTEXT_CHARS);
  const to = at + wrong.length + CONTEXT_CHARS;

  return (
    <article
      data-testid="ai-typos-item"
      className="flex flex-wrap items-center justify-between gap-3 border border-border bg-background p-3"
    >
      <p className="min-w-0 flex-1 text-sm leading-relaxed">
        {from > 0 && "…"}
        {context.slice(from, at)}
        <span
          data-testid="ai-typos-wrong"
          className="mx-0.5 bg-destructive/10 px-1 text-destructive line-through"
        >
          {wrong}
        </span>
        <span
          data-testid="ai-typos-right"
          className="mx-0.5 bg-primary/10 px-1 text-primary"
        >
          {right}
        </span>
        {context.slice(at + wrong.length, to)}
        {to < context.length && "…"}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          data-testid="ai-typos-reject"
          variant="outline"
          size="sm"
          onClick={onReject}
        >
          拒絕
        </Button>
        <Button
          type="button"
          data-testid="ai-typos-accept"
          size="sm"
          onClick={onAccept}
        >
          接受
        </Button>
      </div>
    </article>
  );
}

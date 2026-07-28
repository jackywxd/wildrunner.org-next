"use client";

import { Button, useField, useForm } from "@payloadcms/ui";
import { useState } from "react";

import type { Post } from "@/payload-types";

type ExpandResponse = {
  content?: Post["content"];
  error?: string;
};

export function AIAssistField() {
  const { value: title } = useField<string>({ path: "title" });
  const { value: description } = useField<string>({ path: "description" });
  const { dispatchFields, setModified } = useForm();
  const [outline, setOutline] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const expand = async () => {
    if (!outline.trim()) {
      setError("请先输入大纲或文章片段。");
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/ai/expand-post", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, outline }),
      });
      const result = (await response.json()) as ExpandResponse;

      if (!response.ok || !result.content) {
        throw new Error(result.error || "AI 服务暂时不可用");
      }

      // The Lexical field only remounts its editor when `initialValue`
      // changes (see @payloadcms/richtext-lexical Field.js), so a plain
      // setValue() is silently ignored by the visible editor. Dispatching
      // UPDATE with both value and initialValue forces that remount.
      dispatchFields({
        type: "UPDATE",
        path: "content",
        value: result.content,
        initialValue: result.content,
        valid: true,
      });
      // dispatchFields alone doesn't flip the form's `modified` flag, so
      // Save Draft stays disabled unless we set it explicitly.
      setModified(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI 服务暂时不可用");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section
      data-testid="ai-assist"
      style={{
        border: "1px solid var(--theme-elevation-150)",
        padding: "var(--base)",
        marginBottom: "var(--base)",
      }}
    >
      <label
        htmlFor="ai-assist-outline"
        style={{ display: "block", fontWeight: 600, marginBottom: 8 }}
      >
        AI 完善文章
      </label>
      <textarea
        id="ai-assist-outline"
        data-testid="ai-assist-outline"
        rows={6}
        value={outline}
        onChange={(event) => setOutline(event.target.value)}
        placeholder="输入文章大纲或已有片段；生成结果只会写入草稿，不会自动发布。"
        style={{ width: "100%", marginBottom: 12 }}
      />
      <Button
        buttonStyle="secondary"
        disabled={isLoading}
        onClick={expand}
        type="button"
      >
        {isLoading ? "生成中…" : "AI 完善文章"}
      </Button>
      {error ? (
        <p data-testid="ai-assist-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

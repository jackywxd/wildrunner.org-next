"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { localeHref } from "@/lib/i18n/locale-href";
import { Button } from "@/components/ui/button";
import { ContentPreview } from "@/components/members/editor/ContentPreview";
import { createPost } from "@/lib/members/posts";
import type { PayloadContent } from "@/lib/editor/serialize";
import type { ImportWarning } from "@/lib/mdx-import/types";

type Parsed = {
  content: PayloadContent;
  warnings: ImportWarning[];
};

/**
 * Paste or pick a markdown/MDX document, review what came out of it, and
 * create a draft post from it.
 *
 * Deliberately a separate screen rather than a button inside `PostEditor`:
 * that editor's `content` comes from a live Lexical instance
 * (`ContentEditorHandle.read()`/`.replace()`), and swapping in imported
 * content there would mean routing a second content source through code
 * built around exactly one. Here there is no Lexical instance at all until
 * after `createPost` — the preview below is a plain read of the converted
 * JSON, not an editing surface.
 *
 * The markdown parser (`@/lib/mdx-import`) is loaded with a dynamic
 * `import()` inside the click handler rather than at the top of this
 * module, so `unified`/`remark-parse`/`remark-gfm` — needed by no other
 * route — sit in a chunk downloaded only when a member actually clicks
 * 解析, not on every visit to `/members/posts`.
 */
export function ImportPost() {
  const router = useRouter();
  const pathname = usePathname();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [source, setSource] = useState("");
  const [stage, setStage] = useState<"idle" | "parsing" | "uploading">("idle");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // Re-parsing invalidates the title/slug/description a member may have
  // already edited by hand, and the preview would no longer match what
  // those fields describe — so parsing again clears the previous result
  // rather than layering a second one on top of edited state.
  function clearParsed() {
    setParsed(null);
    setError("");
  }

  async function pickFile(file: File) {
    const text = await file.text();
    setSource(text);
    clearParsed();
  }

  async function parse() {
    setStage("parsing");
    setError("");
    try {
      const [{ importMarkdown }, { resolveEmbeddedImages }, { uploadEmbeddedImage }] =
        await Promise.all([
          import("@/lib/mdx-import"),
          import("@/lib/mdx-import/resolve-embedded-images"),
          import("@/lib/mdx-import/upload-embedded-image"),
        ]);
      const result = importMarkdown(source);

      // A second, async pass: `importMarkdown` is synchronous and does no
      // network I/O by design (see its own header), so a `data:` image is
      // still a placeholder marker at this point, not an uploaded one.
      // Only advance to the "uploading" label when there is actually
      // something to upload — most imports have no embedded images, and
      // showing an upload step for zero images would be a lie.
      const hasEmbeddedImages = JSON.stringify(result.content).includes(
        "pending-embedded-image",
      );
      if (hasEmbeddedImages) setStage("uploading");
      const resolved = await resolveEmbeddedImages(result.content, uploadEmbeddedImage);

      setParsed({
        content: resolved.content,
        warnings: [...result.warnings, ...resolved.warnings],
      });
      setTitle(result.title);
      setSlug(result.slug);
      setDescription(result.description);
    } catch (err) {
      setError((err as Error).message || "解析失敗");
    } finally {
      setStage("idle");
    }
  }

  async function create() {
    if (!parsed) return;
    setCreating(true);
    setError("");

    const result = await createPost({
      title,
      slug: slug || undefined,
      description,
      content: parsed.content,
    });

    if (!result.ok) {
      // Same special-case as StartRaceReport: the slug is the field most
      // likely to collide (importing the same document twice), and
      // Payload's own "value must be unique" is not something a member
      // reads as "you already imported this".
      setError(
        result.fieldErrors.slug
          ? "這個網址代稱已經有文章使用了，請改一個。"
          : result.message,
      );
      setCreating(false);
      return;
    }

    router.push(localeHref(`/members/posts/${result.doc.id}`, pathname));
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3">
        <label className="grid gap-1">
          <span className="text-xs text-foreground/60">
            貼上 Markdown / MDX 內容
          </span>
          <textarea
            data-testid="import-source"
            rows={12}
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              clearParsed();
            }}
            placeholder="貼上文件內容，或選擇檔案…"
            className="border border-input bg-background px-3 py-2 font-mono text-sm"
          />
        </label>

        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            data-testid="import-file"
            type="file"
            accept=".md,.mdx,text/markdown"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void pickFile(file);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="justify-center"
            onClick={() => fileInputRef.current?.click()}
          >
            選擇檔案…
          </Button>
          <Button
            data-testid="import-parse"
            size="sm"
            className="justify-center"
            disabled={stage !== "idle" || source.trim() === ""}
            onClick={parse}
          >
            {stage === "parsing" && "解析中…"}
            {stage === "uploading" && "上傳圖片中…"}
            {stage === "idle" && "解析"}
          </Button>
        </div>
      </div>

      {parsed && (
        <div className="space-y-6 border-t border-border pt-6">
          <div className="grid gap-3">
            <label className="grid gap-1">
              <span className="text-xs text-foreground/60">標題</span>
              <input
                data-testid="import-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="無標題"
                className="border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-foreground/60">網址代稱</span>
              <input
                data-testid="import-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="留空由系統自動產生"
                className="border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-foreground/60">摘要</span>
              <textarea
                data-testid="import-description"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>

          {parsed.warnings.length > 0 && (
            <div
              data-testid="import-warnings"
              data-count={parsed.warnings.length}
              className="space-y-1 border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
            >
              <p className="font-medium text-amber-700">
                有 {parsed.warnings.length} 項內容需要留意：
              </p>
              <ul className="list-disc space-y-0.5 pl-5 text-foreground/70">
                {parsed.warnings.map((warning, index) => (
                  <li key={index}>
                    {warning.message}
                    {warning.detail && (
                      <span className="text-foreground/40">
                        {" "}
                        — {warning.detail}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs text-foreground/60">內容預覽</p>
            <div
              data-testid="import-preview"
              className="border border-border p-4"
            >
              <ContentPreview content={parsed.content} />
            </div>
          </div>

          {error && (
            <p
              data-testid="import-error"
              className="text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <div className="flex justify-end">
            <Button
              data-testid="import-create"
              className="justify-center"
              disabled={creating}
              onClick={create}
            >
              {creating ? "建立中…" : "建立草稿"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

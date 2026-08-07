"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ContentEditor,
  type ContentEditorHandle,
} from "@/components/members/editor/ContentEditor";
import { AIAssistPanel } from "@/components/members/editor/AIAssistPanel";
import {
  RaceRecordField,
  type LinkedRace,
} from "@/components/members/posts/RaceRecordField";
import { savePost, unpublishPost } from "@/lib/members/posts";
import type { PayloadContent } from "@/lib/editor/serialize";
import type { CatalogueEvent } from "@/lib/races/catalogue-shape";
import type { RaceReportOption } from "@/lib/races/report-options";

type Status = "draft" | "published";

export function PostEditor({
  catalogueEvents,
  initial,
  ownerId,
  raceOptions,
}: {
  catalogueEvents: CatalogueEvent[];
  initial: {
    content: PayloadContent;
    description: string;
    id: number;
    race: LinkedRace | null;
    slug: string;
    status: Status;
    title: string;
  };
  ownerId: number;
  /** Finished races only — see lib/races/report-options.ts. */
  raceOptions: RaceReportOption[];
}) {
  const router = useRouter();
  const editorRef = useRef<ContentEditorHandle | null>(null);

  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [description, setDescription] = useState(initial.description);
  const [status, setStatus] = useState<Status>(initial.status);
  const [race, setRace] = useState<LinkedRace | null>(initial.race);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Nothing here autosaves, so an accidental tab close loses real work.
  // Only registered while there is something to lose: an always-on handler
  // makes browsers treat the page as unload-blocking and disables the
  // back/forward cache for every visit.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function write(publish: boolean) {
    setBusy(true);
    setMessage("");
    setFieldErrors({});

    let content: PayloadContent;
    try {
      content = editorRef.current!.read();
    } catch (error) {
      setMessage((error as Error).message);
      setBusy(false);
      return;
    }

    const result = await savePost(
      initial.id,
      {
        title,
        slug,
        description,
        content,
        // Always sent, including as `null`. Omitting it when nothing is
        // linked would make "remove" impossible to express — the field
        // would simply keep whatever was already stored. See PostPayload.
        raceRecord: race ? race.recordId : null,
      },
      { publish },
    );
    setBusy(false);

    if (!result.ok) {
      setMessage(result.message);
      setFieldErrors(result.fieldErrors);
      return;
    }
    setDirty(false);

    // Publishing is the act that finishes a post, so it returns to the list
    // the way every mainstream editor does. Saving a draft is the opposite —
    // a checkpoint mid-sentence — so it stays put and only reports back.
    if (publish) {
      setStatus("published");
      setMessage("已發布");
      router.push("/members/posts");
      return;
    }
    setMessage("已儲存草稿");
    router.refresh();
  }

  async function takeDown() {
    setBusy(true);
    const result = await unpublishPost(initial.id);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setStatus("draft");
    setMessage("已取消發布");
    router.refresh();
  }

  // An upload still in flight has no media id yet, so the document simply
  // cannot be serialized — block saving rather than let it throw.
  const uploading = pending > 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <input
        data-testid="post-title"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          setDirty(true);
        }}
        placeholder="無標題"
        className="w-full border-none bg-transparent font-heading text-3xl font-semibold outline-none placeholder:text-foreground/30"
      />

      <div className="grid gap-3 border-b border-border pb-4">
        <label className="grid gap-1">
          <span className="text-xs text-foreground/60">網址代稱</span>
          <input
            data-testid="post-slug"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setDirty(true);
            }}
            className="border border-input bg-background px-3 py-2 text-sm"
          />
          {fieldErrors.slug && (
            <span data-testid="post-slug-error" className="text-xs text-destructive">
              {fieldErrors.slug}
            </span>
          )}
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-foreground/60">摘要</span>
          <textarea
            data-testid="post-description"
            rows={2}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setDirty(true);
            }}
            className="border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-foreground/50">
        <span data-testid="post-status" data-status={status}>
          {status === "published" ? "已發布" : "草稿"}
        </span>
        {dirty && <span data-testid="post-dirty">未儲存的變更</span>}
        {uploading && <span data-testid="post-uploading">圖片上傳中…</span>}
        {message && (
          <span data-testid="post-message" className="text-foreground/70">
            {message}
          </span>
        )}
        <span className="flex-1" />
        <Button
          data-testid="post-save-draft"
          variant="outline"
          size="sm"
          className="justify-center"
          disabled={busy || uploading}
          onClick={() => write(false)}
        >
          儲存草稿
        </Button>
        {status === "published" ? (
          <Button
            data-testid="post-unpublish"
            variant="outline"
            size="sm"
            className="justify-center"
            disabled={busy || uploading}
            onClick={takeDown}
          >
            取消發布
          </Button>
        ) : null}
        <Button
          data-testid="post-publish"
          size="sm"
          className="justify-center"
          disabled={busy || uploading}
          onClick={() => write(true)}
        >
          {status === "published" ? "更新已發布內容" : "發布"}
        </Button>
      </div>

      <RaceRecordField
        catalogueEvents={catalogueEvents}
        linked={race}
        onChange={(value) => {
          setRace(value);
          setDirty(true);
        }}
        options={raceOptions}
        ownerId={ownerId}
      />

      <AIAssistPanel
        title={title}
        description={description}
        onContent={(content) => {
          editorRef.current?.replace(content);
          setDirty(true);
        }}
      />

      <ContentEditor
        initialContent={initial.content}
        handleRef={editorRef}
        onChange={() => setDirty(true)}
        onPendingChange={setPending}
      />
    </div>
  );
}

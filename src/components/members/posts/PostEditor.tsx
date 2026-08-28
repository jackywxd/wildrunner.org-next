"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ContentEditor,
  type ContentEditorHandle,
} from "@/components/members/editor/ContentEditor";
import { AIAssistPanel } from "@/components/members/editor/AIAssistPanel";
import { ContentPreview } from "@/components/members/editor/ContentPreview";
import { CoverImageField } from "@/components/members/posts/CoverImageField";
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
    /** `posts.image` as a bare media id — see CoverImageField. */
    cover: number | null;
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
  const [cover, setCover] = useState<number | null>(initial.cover);
  const [coverUploading, setCoverUploading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PayloadContent | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Re-read the document for the preview pane.
   *
   * Debounced rather than run on every keystroke: the preview re-renders the
   * whole document, and on a long race report that is a visible stutter
   * while typing. 300ms is under the threshold where the pane stops feeling
   * live.
   *
   * A failed read keeps the previous document instead of blanking the pane.
   * `read()` throws while an image upload is still in flight — the same
   * condition that blocks saving — and a preview that empties itself every
   * time a member pastes a photo would look like the photo broke it.
   */
  const refreshPreview = useCallback(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      try {
        setPreview(editorRef.current?.read() ?? null);
      } catch {
        /* keep the last readable version */
      }
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, []);

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
        // Both always sent, including as `null`. Omitting a key when
        // nothing is linked would make "remove" impossible to express — the
        // field would simply keep whatever was already stored. See
        // PostPayload. `image` was previously never sent at all, which is
        // why an existing cover survived every save; now that the member can
        // clear one, the absent-means-keep behaviour is no longer enough.
        image: cover,
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
  const uploading = pending > 0 || coverUploading;

  return (
    // Widened only while previewing. A permanently wide container would make
    // the writing column too long to read on a desktop, which is the state
    // the editor is in almost all of the time.
    <div
      className={`mx-auto space-y-6 ${previewing ? "max-w-6xl" : "max-w-2xl"}`}
      data-testid="post-editor-root"
      data-previewing={previewing ? "true" : "false"}
    >
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
          data-testid="post-preview-toggle"
          variant="outline"
          size="sm"
          className="justify-center"
          onClick={() => {
            const next = !previewing;
            setPreviewing(next);
            // Read immediately on open rather than waiting for the next
            // keystroke — a member who opens a preview and sees nothing has
            // no reason to believe a later edit will fix it.
            if (next) {
              try {
                setPreview(editorRef.current?.read() ?? null);
              } catch {
                setPreview(null);
              }
            }
          }}
        >
          {previewing ? "關閉預覽" : "預覽"}
        </Button>
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

      <CoverImageField
        mediaId={cover}
        onBusyChange={setCoverUploading}
        onChange={(value) => {
          setCover(value);
          setDirty(true);
        }}
      />

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

      <div className={previewing ? "grid gap-6 lg:grid-cols-2" : undefined}>
        {/*
          Hidden with CSS, never unmounted. Unmounting the composer would
          discard the undo history and the caret, so a member who opened a
          preview on a phone and closed it would come back to a document
          they could no longer undo. `hidden lg:block` is what makes the
          mobile behaviour a cover rather than a split — two columns of
          Chinese prose at phone width are unreadable.
        */}
        <div className={previewing ? "hidden lg:block" : undefined}>
          <ContentEditor
            initialContent={initial.content}
            handleRef={editorRef}
            onChange={() => {
              setDirty(true);
              if (previewing) refreshPreview();
            }}
            onPendingChange={setPending}
          />
        </div>

        {previewing && (
          <div
            data-testid="post-preview"
            className="border border-border bg-background p-4 lg:max-h-[80vh] lg:overflow-y-auto"
          >
            <p className="mb-3 text-xs text-foreground/50">
              預覽 — 發布後在網站上的樣子
            </p>
            {preview ? (
              <ContentPreview content={preview} />
            ) : (
              <p className="text-sm text-foreground/40">這篇文章還沒有內容。</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

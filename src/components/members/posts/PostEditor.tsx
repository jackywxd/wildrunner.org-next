"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ContentEditor,
  type ContentEditorHandle,
} from "@/components/members/editor/ContentEditor";
import { AIImprovePanel } from "@/components/members/editor/AIImprovePanel";
import { AISummaryButton } from "@/components/members/editor/AISummaryButton";
import { ContentPreview } from "@/components/members/editor/ContentPreview";
import { CoverImageField } from "@/components/members/posts/CoverImageField";
import {
  RaceRecordField,
  type LinkedRace,
} from "@/components/members/posts/RaceRecordField";
import { savePost, unpublishPost } from "@/lib/members/posts";
import { nextCheckDelay, shouldAutosave } from "@/lib/members/autosave";
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
  /**
   * A draft has been written since this post was published.
   *
   * Without it the badge says "已發布" while the live site shows something
   * older, and the member has no way to tell. That gap did not exist before
   * autosave — a draft write only happened when somebody pressed a button —
   * so nothing on screen ever had to describe it.
   */
  const [unpublished, setUnpublished] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  /** The AI panel is showing its version beside the member's. */
  const [comparing, setComparing] = useState(false);
  const [preview, setPreview] = useState<PayloadContent | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Refs, not state: the autosave loop reads them from inside a timeout, and
  // as state every keystroke would re-arm the timer it is trying to wait out.
  const lastEditAt = useRef<number | null>(null);
  const lastSaveAt = useRef<number | null>(null);

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

  // The warning stays, and is now the second line of defence rather than the
  // only one. A dialog fires on a deliberate close as readily as an accident,
  // does nothing when the tab crashes or a phone reclaims the page, and is
  // dismissible — none of which is true of a saved draft. Still only
  // registered while there is something to lose: an always-on handler makes
  // browsers treat the page as unload-blocking and disables the
  // back/forward cache for every visit.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /**
   * Write the draft without the member asking, on the timing in
   * src/lib/members/autosave.ts.
   *
   * Goes through `savePost` with `publish: false` like every other
   * non-publish write, so it lands on the draft version and the public site
   * is untouched even when the post is already published — that guarantee
   * is `savePost`'s, and its header names autosave as the caller it was
   * shaped for.
   *
   * A failure here is deliberately quiet: `dirty` stays true, so the
   * unload warning is still armed and the next tick tries again. Interrupting
   * someone mid-sentence with a dialog about a network blip would be a worse
   * failure than the one being reported.
   */
  const autosaveNow = useCallback(async () => {
    let payload: ReturnType<typeof collectPayload>;
    try {
      payload = collectPayload();
    } catch {
      return;
    }

    setBusy(true);
    const result = await savePost(initial.id, payload, { publish: false });
    setBusy(false);
    if (!result.ok) {
      setMessage("自動儲存失敗，稍後會再試");
      return;
    }
    setDirty(false);
    lastSaveAt.current = Date.now();
    setUnpublished(status === "published");
    setMessage("已自動儲存");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.id, status, title, slug, description, cover, race]);

  useEffect(() => {
    if (!dirty) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      if (cancelled) return;
      const state = {
        busy,
        dirty,
        lastEditAt: lastEditAt.current,
        lastSaveAt: lastSaveAt.current,
        uploading: pending > 0 || coverUploading,
      };
      const now = Date.now();
      if (shouldAutosave(state, now)) {
        void autosaveNow();
        return;
      }
      // Ask again when the nearest condition could have changed, rather than
      // polling — see nextCheckDelay.
      timer = setTimeout(tick, nextCheckDelay(state, now));
    };

    timer = setTimeout(tick, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [autosaveNow, busy, coverUploading, dirty, pending]);

  /**
   * One last write when the page goes away.
   *
   * `visibilitychange` rather than `beforeunload`: it is the event that
   * actually fires when a phone backgrounds a tab or the OS reclaims it,
   * which is the case the idle timer cannot cover — the member is not
   * pausing, they are gone. Nothing awaits it; the browser may not give the
   * page another frame.
   */
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      if (!dirty || busy || pending > 0 || coverUploading) return;
      void autosaveNow();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [autosaveNow, busy, coverUploading, dirty, pending]);

  /**
   * The document as it stands, or null while it cannot be read.
   *
   * Null means a pending upload: `read()` throws while one is in the tree.
   * Both AI panels ask for the document and both must refuse rather than
   * send one — asking the model to work on an article that is missing a
   * picture the member can see on screen produces a confident answer about
   * the wrong document.
   */
  function readDocument(): PayloadContent | null {
    try {
      return editorRef.current!.read();
    } catch {
      return null;
    }
  }

  /**
   * Everything a write sends.
   *
   * Shared by the buttons and the autosave loop so the two cannot drift
   * apart — an autosave that assembled its own payload would be the obvious
   * place for a field to be forgotten, and forgetting one here means
   * silently reverting it.
   *
   * Lets `read()` throw rather than swallowing it, because the two callers
   * want opposite things from that failure: a member who pressed 儲存 needs
   * to be told why nothing happened, and the autosave loop must say nothing
   * at all and wait for the upload to finish.
   */
  function collectPayload() {
    return {
      title,
      slug,
      description,
      content: editorRef.current!.read(),
      // Both always sent, including as `null`. Omitting a key when nothing
      // is linked would make "remove" impossible to express — the field
      // would simply keep whatever was already stored. See PostPayload.
      // `image` was previously never sent at all, which is why an existing
      // cover survived every save; now that the member can clear one, the
      // absent-means-keep behaviour is no longer enough.
      image: cover,
      raceRecord: race ? race.recordId : null,
    };
  }

  async function write(publish: boolean) {
    setBusy(true);
    setMessage("");
    setFieldErrors({});

    let payload: ReturnType<typeof collectPayload>;
    try {
      payload = collectPayload();
    } catch (error) {
      setMessage((error as Error).message);
      setBusy(false);
      return;
    }

    const result = await savePost(initial.id, payload, { publish });
    setBusy(false);

    if (!result.ok) {
      setMessage(result.message);
      setFieldErrors(result.fieldErrors);
      return;
    }
    setDirty(false);
    lastSaveAt.current = Date.now();
    // A draft write on a published post leaves the live version behind.
    setUnpublished(publish ? false : status === "published");

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
          lastEditAt.current = Date.now();
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
              lastEditAt.current = Date.now();
            }}
            className="border border-input bg-background px-3 py-2 text-sm"
          />
          {fieldErrors.slug && (
            <span data-testid="post-slug-error" className="text-xs text-destructive">
              {fieldErrors.slug}
            </span>
          )}
        </label>
        <div className="grid gap-2">
          <label className="grid gap-1">
            <span className="text-xs text-foreground/60">摘要</span>
            <textarea
              data-testid="post-description"
              rows={2}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setDirty(true);
                lastEditAt.current = Date.now();
              }}
              className="border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          {/*
            Outside the <label>, deliberately. A button inside one is a click
            on the label, which moves focus into the textarea — so pressing
            使用 would drop the caret into the field it had just filled.
          */}
          <AISummaryButton
            onUse={(summary) => {
              setDescription(summary);
              setDirty(true);
              lastEditAt.current = Date.now();
            }}
            readDocument={readDocument}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-foreground/50">
        <span data-testid="post-status" data-status={status}>
          {status === "published" ? "已發布" : "草稿"}
        </span>
        {dirty && <span data-testid="post-dirty">未儲存的變更</span>}
        {/*
          The fact autosave introduced. A draft write on a published post
          leaves the live site showing the older version, and "已發布" alone
          would let a member believe their edits are out there. Shown
          alongside "未儲存的變更" rather than instead of it: they are
          different facts — one is "not saved anywhere", the other is "saved,
          but not what readers see".
        */}
        {unpublished && (
          <span data-testid="post-unpublished" className="text-foreground/70">
            有未發布的變更
          </span>
        )}
        {uploading && <span data-testid="post-uploading">圖片上傳中…</span>}
        {message && (
          <span data-testid="post-message" className="text-foreground/70">
            {message}
          </span>
        )}
        <span className="flex-1" />
        {/* Not offered while the AI comparison is open: the preview pane is
            suppressed there, so the button would be a control that does
            nothing — indistinguishable from one that is broken. */}
        {!comparing && (
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
        )}
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
        ownerId={ownerId}
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

      <AIImprovePanel
        onAccept={(content) => {
          editorRef.current?.replace(content);
          setDirty(true);
          lastEditAt.current = Date.now();
        }}
        onComparingChange={setComparing}
        readDocument={readDocument}
      />

      <div
        className={
          previewing && !comparing ? "grid gap-6 lg:grid-cols-2" : undefined
        }
      >
        {/*
          Hidden with CSS, never unmounted. Unmounting the composer would
          discard the undo history and the caret, so a member who opened a
          preview on a phone and closed it would come back to a document
          they could no longer undo. `hidden lg:block` is what makes the
          mobile behaviour a cover rather than a split — two columns of
          Chinese prose at phone width are unreadable.
        */}
        <div
          className={
            // Hidden outright while the two versions are being compared:
            // the comparison is already two columns, and a third would leave
            // no column wide enough to read. Still mounted, for the reason
            // below.
            comparing ? "hidden" : previewing ? "hidden lg:block" : undefined
          }
        >
          <ContentEditor
            initialContent={initial.content}
            handleRef={editorRef}
            onChange={() => {
              setDirty(true);
              lastEditAt.current = Date.now();
              if (previewing) refreshPreview();
            }}
            onPendingChange={setPending}
          />
        </div>

        {previewing && !comparing && (
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

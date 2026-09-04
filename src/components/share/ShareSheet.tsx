"use client";

import { useRef, useState } from "react";

/**
 * The share panel: a displayer, not a generator.
 *
 * The poster already exists at `/share/…` before anyone opens this — it is an
 * endpoint, not something the browser builds — so all this does is show that
 * image and hand over two pieces of text.
 *
 * `data-src` UNTIL OPENED. The poster is 1080×1440; loading it with the page
 * would cost every reader a picture almost none of them will look at. It
 * cannot be `loading="lazy"` instead: an image inside a closed `<dialog>` is
 * `display:none`, and a lazy image that is never displayed is never fetched —
 * so it would still be blank on the frame the dialog opens.
 *
 * LONG-PRESS ON MOBILE, DOWNLOAD ON DESKTOP, and that split is not a
 * compromise. `<a download>` does nothing inside the in-app browsers of WeChat
 * and Xiaohongshu on iOS; long-pressing the image is the only path that works
 * there, and it is also what people already do.
 *
 * `<dialog>` natively traps focus, closes on Escape and gives us `::backdrop`,
 * so there is no focus-trap library here and should not be one.
 */
export function ShareSheet({
  posterSrc,
  wechatText,
  xiaohongshuText,
  title,
}: {
  posterSrc: string;
  wechatText: string;
  xiaohongshuText: string;
  title: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const posterRef = useRef<HTMLImageElement>(null);
  const [copied, setCopied] = useState<"wechat" | "xiaohongshu" | null>(null);

  const open = () => {
    const poster = posterRef.current;
    // Set on open, so a reader who never shares pays nothing for the poster.
    if (poster && !poster.src) poster.src = poster.dataset.src ?? "";
    dialogRef.current?.showModal();
  };

  /**
   * Copy, synchronously.
   *
   * `navigator.clipboard.writeText` must be called *in* the click handler on
   * iOS Safari — a write that happens after an `await` has lost the user
   * gesture and is rejected. And WeChat's Android X5 build may not expose the
   * Clipboard API at all, hence the textarea fallback, which is the only thing
   * that works there.
   */
  const copy = (which: "wechat" | "xiaohongshu", text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "absolute";
        area.style.left = "-10000px";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      setCopied(which);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // A failed copy is not worth an error dialog — the text is on screen and
      // can be selected by hand.
    }
  };

  return (
    <>
      <button
        className="border border-border px-3 py-1 text-xs leading-tight text-muted-foreground transition-colors hover:text-foreground print:hidden"
        data-testid="share-open"
        onClick={open}
        type="button"
      >
        分享
      </button>

      <dialog
        className="w-[min(92vw,26rem)] border border-border bg-background p-0 text-foreground backdrop:bg-black/60"
        data-testid="share-sheet"
        ref={dialogRef}
      >
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-heading text-base font-bold">分享「{title}」</h2>
            <button
              className="text-sm text-muted-foreground hover:text-foreground"
              data-testid="share-close"
              onClick={() => dialogRef.current?.close()}
              type="button"
            >
              關閉
            </button>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element -- the poster is
              a fixed-size endpoint render; next/image would add srcset and a
              loader for an image we deliberately fetch exactly once. */}
          <img
            alt={`${title} 的分享圖`}
            className="w-full border border-border bg-secondary"
            data-src={posterSrc}
            data-testid="share-poster"
            height={1440}
            ref={posterRef}
            width={1080}
          />

          <p className="text-xs text-muted-foreground" data-testid="share-hint">
            手機長按圖片存到相簿,再發到小紅書。
          </p>

          <div className="flex flex-col gap-2">
            <button
              className="border border-border px-3 py-2 text-sm hover:border-primary"
              data-testid="share-copy-xiaohongshu"
              onClick={() => copy("xiaohongshu", xiaohongshuText)}
              type="button"
            >
              {copied === "xiaohongshu" ? "已複製" : "複製小紅書文案(不含網址)"}
            </button>
            <button
              className="border border-border px-3 py-2 text-sm hover:border-primary"
              data-testid="share-copy-wechat"
              onClick={() => copy("wechat", wechatText)}
              type="button"
            >
              {copied === "wechat" ? "已複製" : "複製微信文案(含連結)"}
            </button>
            <a
              className="border border-border px-3 py-2 text-center text-sm hover:border-primary"
              data-testid="share-download"
              download
              href={posterSrc}
            >
              下載分享圖
            </a>
          </div>
        </div>
      </dialog>
    </>
  );
}

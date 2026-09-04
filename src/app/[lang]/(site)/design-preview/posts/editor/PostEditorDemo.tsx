"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

const SLASH_COMMANDS = [
  { label: "標題", hint: "H1" },
  { label: "小標題", hint: "H2" },
  { label: "項目清單", hint: "•" },
  { label: "編號清單", hint: "1." },
  { label: "引言", hint: "❝" },
  { label: "分隔線", hint: "—" },
];

type PasteState = "idle" | "pending" | "done";

/**
 * Notion-style behaviours this screen demonstrates, all faked with local
 * state rather than a real Lexical instance (that's Phase F):
 * - a "/" slash menu for block insertion
 * - a selection (bubble) toolbar over highlighted text
 * - paste-an-image: a pending placeholder that resolves to a real image,
 *   standing in for the direct-upload flow real content will go through
 */
export function PostEditorDemo() {
  const [slashOpen, setSlashOpen] = useState(false);
  const [selectionToolbar, setSelectionToolbar] = useState(false);
  const [pasteState, setPasteState] = useState<PasteState>("idle");

  function simulatePaste() {
    setPasteState("pending");
    setTimeout(() => setPasteState("done"), 1400);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <input
        defaultValue="UTMB 2026 訓練週記"
        className="w-full border-none bg-transparent font-heading text-3xl font-semibold outline-none placeholder:text-foreground/30"
        placeholder="無標題"
      />

      <div className="flex items-center gap-2 border-b border-border pb-4 text-xs text-foreground/50">
        <span>草稿</span>
        <span>·</span>
        <span>上次儲存於 2 分鐘前</span>
        <span className="flex-1" />
        <Button variant="outline" size="sm" className="justify-center">
          發布
        </Button>
      </div>

      {/* document body */}
      <div className="space-y-4 text-[15px] leading-relaxed">
        <p>
          這週的訓練重點是爬升。週三的間歇跑之後，週末安排了一次長距離的山徑訓練，
          <span
            data-testid="demo-selection-target"
            onMouseUp={() => setSelectionToolbar((v) => !v)}
            className="relative cursor-pointer bg-primary/15"
          >
            重點放在下坡技巧的練習
            {selectionToolbar && (
              <span
                data-testid="demo-selection-toolbar"
                className="absolute -top-11 left-0 flex w-max items-center gap-1 border border-border bg-background px-2 py-1 shadow-sm"
              >
                {["粗體", "斜體", "連結", "AI 改寫"].map((action) => (
                  <button
                    key={action}
                    className="whitespace-nowrap px-2 py-1 text-xs hover:bg-secondary"
                  >
                    {action}
                  </button>
                ))}
              </span>
            )}
          </span>
          ，因為上一次比賽在下坡段掉了不少時間。
        </p>

        <p className="text-foreground/40">
          （在上方「重點放在下坡技巧的練習」這句上點一下，模擬選取文字後出現的工具列。）
        </p>

        {/* paste-image demo */}
        <div className="space-y-2">
          {pasteState === "idle" && (
            <button
              data-testid="demo-paste-button"
              onClick={simulatePaste}
              className="w-full border border-dashed border-border p-6 text-center text-sm text-foreground/50 hover:border-primary hover:text-primary"
            >
              點此模擬「貼上剪貼簿圖片」
            </button>
          )}
          {pasteState === "pending" && (
            <div
              data-testid="demo-paste-pending"
              className="flex aspect-video items-center justify-center border border-border bg-secondary text-sm text-foreground/50"
            >
              上傳中…
            </div>
          )}
          {pasteState === "done" && (
            <div data-testid="demo-paste-done" className="border border-border">
              <div className="flex aspect-video items-center justify-center bg-secondary text-xs text-foreground/40">
                （貼上的截圖）
              </div>
              <div className="p-2 text-xs text-foreground/50">
                pasted-1785308140897.png
              </div>
            </div>
          )}
        </div>

        <p>下週開始加入負重訓練，模擬比賽後段的疲勞狀態。</p>

        {/* slash menu trigger */}
        <div className="relative">
          <button
            data-testid="demo-slash-trigger"
            onClick={() => setSlashOpen((v) => !v)}
            className="flex items-center gap-2 text-foreground/40 hover:text-foreground"
          >
            <span className="flex h-6 w-6 items-center justify-center border border-border">+</span>
            <span className="text-sm">輸入 “/” 插入區塊</span>
          </button>

          {slashOpen && (
            <div
              data-testid="demo-slash-menu"
              className="absolute left-0 top-8 z-10 w-56 border border-border bg-background shadow-sm"
            >
              {SLASH_COMMANDS.map((cmd) => (
                <button
                  key={cmd.label}
                  onClick={() => setSlashOpen(false)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-secondary"
                >
                  <span>{cmd.label}</span>
                  <span className="text-xs text-foreground/40">{cmd.hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

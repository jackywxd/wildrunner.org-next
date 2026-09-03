"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";

import type { PrintFont, PrintTemplate } from "@/lib/print/options";

/**
 * Choosing what to print, and printing it.
 *
 * NOT PART OF THE PRINTED PAGE: `print.css` hides `.print-toolbar` inside
 * `@media print`, so the sheet carries the article and nothing else. It stays
 * on screen, where it is the only way to reach the other templates.
 *
 * The selects navigate rather than holding state, and that is deliberate:
 * the template decides what the SERVER renders — `compact` strips the image
 * nodes out of the body so they are never fetched — so a client-side toggle
 * could not produce the same page. Navigating also makes every combination a
 * real address somebody can bookmark or send.
 */
const TEMPLATES: { value: PrintTemplate; label: string; hint: string }[] = [
  { value: "standard", label: "標準", hint: "印出來讀" },
  { value: "magazine", label: "雜誌", hint: "留著收藏" },
  { value: "compact", label: "精簡", hint: "最少的紙，不印照片" },
];

const FONTS: { value: PrintFont; label: string }[] = [
  { value: "sans", label: "黑體" },
  { value: "serif", label: "明體" },
];

export function PrintToolbar({
  template,
  font,
}: {
  template: PrintTemplate;
  font: PrintFont;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function go(next: Partial<{ template: string; font: string }>) {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) query.set(key, value);
    // THE FULL PATH, not a bare `?query`. A relative query-only argument left
    // the server component rendering the old template — the URL moved and the
    // page did not, which on this page means the menu appears to do nothing.
    // Measured: V-PRINT-T1 selected 雜誌 and `data-template` stayed
    // `standard`.
    //
    // `scroll: false` so changing the face does not throw the reader back to
    // the top of an article they were looking at the middle of.
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  }

  return (
    <div
      className="print-toolbar mb-8 flex flex-wrap items-center gap-3 border-b border-neutral-200 pb-4 text-sm"
      data-testid="print-toolbar"
    >
      <label className="flex items-center gap-1.5 text-neutral-500">
        <span>版式</span>
        <select
          data-testid="print-template"
          value={template}
          onChange={(event) => go({ template: event.target.value })}
          className="border border-neutral-300 bg-white px-2 py-1 text-neutral-900"
        >
          {TEMPLATES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5 text-neutral-500">
        <span>字體</span>
        <select
          data-testid="print-font"
          value={font}
          onChange={(event) => go({ font: event.target.value })}
          className="border border-neutral-300 bg-white px-2 py-1 text-neutral-900"
        >
          {FONTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <p className="text-xs text-neutral-500" data-testid="print-hint">
        {TEMPLATES.find((option) => option.value === template)?.hint}
      </p>

      <button
        type="button"
        onClick={() => window.print()}
        data-testid="print-go"
        className="ml-auto flex items-center gap-2 border border-neutral-900 bg-neutral-900 px-3 py-1.5 text-white"
      >
        <Printer className="size-4" />
        <span>列印 / 存成 PDF</span>
      </button>

      {/*
        Said here rather than discovered at the printer. Page numbers, the date
        and the URL are the browser's own print options — CSS `@page` margin
        boxes, where a running footer would live, are not implemented in
        Chrome, so this page genuinely cannot put them on every sheet.
      */}
      <p className="w-full text-xs text-neutral-400" data-testid="print-note">
        頁碼和日期由瀏覽器的列印選項決定，不是這一頁能控制的。
      </p>
    </div>
  );
}

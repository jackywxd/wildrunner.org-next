"use client";

import React from "react";
import type { MediaKindFilter, MediaUsageFilter } from "@/lib/media/filters";
import { cn } from "@/lib/utils";

/**
 * The controls both media libraries need, in one place.
 *
 * WHAT IS SHARED HERE AND WHAT DELIBERATELY IS NOT. /gallery and
 * /members/media look like the same page and are not: the wall is the union
 * of album membership and `media.usage`, reduced in memory and sliced by a
 * cursor (see gallery-index.ts, which spells out why a `media.find` cannot
 * produce it), while the member library is a `/api/media` query paginated by
 * Payload under the collection's own access rules. Neither query can become
 * the other, so nothing about *fetching* is shared and trying would break
 * one of them silently.
 *
 * What is genuinely the same is the chrome — a row of chips for 相片/影片 and
 * a labelled select for the rest — and it is the same in the third place too:
 * gallery-page-client's view toggle had its own private copy of `FilterChip`,
 * comment included, which is what prompted this file.
 */

export function FilterChip({
  active,
  children,
  onClick,
  // Named for the attribute rather than something like `testId` so the
  // attribute itself appears literally at each call site, which is what
  // `scripts/assert-schema-screen.mjs` greps for. A renamed prop passes
  // typecheck and fails that check — correctly, since its whole job is to
  // prove a selector a test uses really exists. (Deliberately not spelling
  // the attribute out in this comment: a checker that matches its own
  // documentation is the false positive VERIFICATION.md warns about.)
  "data-testid": testId,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  "data-testid": string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={cn(
        "border px-3 py-1 text-xs leading-tight transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:text-foreground",
      )}
      // The only signal that the view has actually switched. These chips
      // are server-rendered, so a click landing before hydration is
      // silently dropped and the shelf never appears — which is exactly how
      // this failed in CI while passing locally, where a warm dev server
      // hydrates before a test can click.
      data-active={active}
    >
      {children}
    </button>
  );
}

/**
 * The three chips, spelled out at each call site rather than looped here.
 *
 * A loop is the obvious shape and `scripts/assert-schema-screen.mjs` is why it
 * is not the one used: that check proves every selector a spec names really
 * exists by grepping src/ for the literal attribute, and a testid built from
 * `${prefix}-kind-${value}` appears nowhere for it to find. Its only escape
 * hatch is a hand-maintained CONSTRUCTED map — right for MemberNav, where an
 * href decides the id, and wrong here, where the three values are a fixed list
 * somebody typed. Twelve lines of loop is not worth a hole in the one check
 * that catches a spec asserting on a selector nothing renders.
 */
export const KIND_LABELS: Record<MediaKindFilter, string> = {
  all: "全部",
  photo: "相片",
  video: "影片",
};

/**
 * `media.usage` in the member's words.
 *
 * Here rather than in the library that first needed it, because the picker
 * prints the same three words on each tile — a member choosing a cover has to
 * be able to see that the photo they are about to publish is one they marked
 * 不公開. Two copies of that vocabulary would let one screen's 不公開 come to
 * mean something the other's does not.
 */
export const USAGE_LABELS: Record<MediaUsageFilter, string> = {
  all: "全部用途",
  gallery: "相片牆",
  private: "不公開",
  attachment: "文章附件",
};

/**
 * A labelled `<select>`, because everything past the kind chips is a list too
 * long to be chips — four sort orders, three usages, three page sizes.
 *
 * A native select rather than a styled menu: it is the one control that works
 * on a phone without any of our own code, and this row sits above a grid that
 * is already the heaviest thing on the page.
 */
export function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  "data-testid": testId,
}: {
  label: string;
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
  "data-testid": string;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span>{label}</span>
      <select
        data-testid={testId}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="border border-border bg-background px-2 py-1 text-xs text-foreground"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

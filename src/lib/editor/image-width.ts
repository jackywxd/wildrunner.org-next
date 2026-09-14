/**
 * How wide a picture sits in an article, decided once for every surface
 * that draws one.
 *
 * **A preset, not a pixel count.** A number is a guess made on whatever
 * screen the author happened to be holding: 300px is a modest illustration
 * on a laptop and most of a phone. The people reading this site are mostly
 * on phones and so is the person writing, so the stored value says what the
 * author *meant* — full bleed, a bit smaller, small — and each surface
 * decides what that means at its own width.
 *
 * **`medium` is deliberately full width on a phone.** Its purpose is to stop
 * a photo dominating a wide column, and a 375px screen has no wide column to
 * dominate — 60% of it is 225px, a thumbnail nobody asked for. `small` does
 * still shrink there, because "small" is for things that are genuinely small
 * (a badge, a QR code, a watch face), and a `small` that rendered full width
 * on a phone would be indistinguishable from `full` and lose the author's
 * intent entirely.
 *
 * **`sizes` is not decoration, and it is the half that is easy to forget.**
 * `src/lib/image-loader.ts` turns a next/image request into a Cloudflare
 * Image Resizing URL, so the width the browser asks for is the width that
 * comes down the wire — a 1.7 MB original arrives as 49 KB at `width=640`.
 * Get the class right and the `sizes` wrong and the layout looks perfect
 * while a phone on cellular still downloads the full-bleed file to display
 * it at 40%. That failure is invisible on screen, which is why both are
 * derived from the one table below rather than written twice.
 */

/** What the author chose. Absent means `full` — see `imageWidthOf`. */
export type ImageWidth = "full" | "medium" | "small";

export const IMAGE_WIDTHS: readonly ImageWidth[] = ["full", "medium", "small"];

/** What each preset means, as a fraction of the column, per screen. */
const FRACTIONS: Record<ImageWidth, { phone: number; desktop: number }> = {
  full: { phone: 1, desktop: 1 },
  medium: { phone: 1, desktop: 0.6 },
  small: { phone: 0.6, desktop: 0.4 },
};

/**
 * The article column's own maximum, matching the `768px` the public
 * converter has always declared. `sizes` is advisory — a wrong number costs
 * bytes, not correctness — so one constant here is better than a media query
 * per surface.
 */
const COLUMN_PX = 768;

/** Tailwind width for each preset, phone first. */
const CLASSES: Record<ImageWidth, string> = {
  full: "w-full",
  // Centred, because a picture narrower than the column has to sit
  // somewhere and there is no wrapping to align it against — text wrapping
  // is a desktop-only idea and this site is read on phones.
  medium: "mx-auto w-full md:w-3/5",
  small: "mx-auto w-3/5 md:w-2/5",
};

/**
 * The author's choice, or `full`.
 *
 * Every article written before this existed has no such key, and those
 * pictures must keep rendering exactly as they do today — so the default is
 * not a fallback for bad data, it is the answer for almost every image on
 * the site. Anything unrecognised lands there too: a value this version does
 * not know is a picture that still has to draw.
 */
export function imageWidthOf(fields: unknown): ImageWidth {
  const width = (fields as { width?: unknown } | null | undefined)?.width;
  return IMAGE_WIDTHS.includes(width as ImageWidth) ? (width as ImageWidth) : "full";
}

/** The class list that sizes the picture on screen. */
export function imageWidthClass(width: ImageWidth): string {
  return CLASSES[width];
}

/**
 * The `sizes` attribute that decides how many bytes travel.
 *
 * Derived from the same fractions as the class so the two cannot drift —
 * see the header for what drifting costs.
 */
export function imageWidthSizes(width: ImageWidth): string {
  const { phone, desktop } = FRACTIONS[width];
  const desktopPx = Math.round(COLUMN_PX * desktop);
  const phoneVw = Math.round(phone * 100);
  return `(min-width: 768px) ${desktopPx}px, ${phoneVw}vw`;
}

/**
 * The upload node's `fields` with this choice recorded — or with the key
 * removed when the choice is `full`.
 *
 * Removing rather than writing `"full"` keeps a default-width picture
 * byte-identical to one saved before this feature existed, which is what
 * makes `roundTripPayloadContent` stay quiet about every post already in the
 * database.
 */
export function withImageWidth(
  // `null`, not just absent: that is what a real upload node carries when
  // nothing has ever been stored on it.
  fields: Record<string, unknown> | null | undefined,
  width: ImageWidth,
): Record<string, unknown> | undefined {
  const rest = { ...(fields ?? {}) };
  delete rest.width;
  if (width !== "full") rest.width = width;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

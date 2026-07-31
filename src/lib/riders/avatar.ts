/**
 * Deterministic generated avatars.
 *
 * No member has uploaded an avatar, and asking every member to is not a
 * prerequisite for the directory looking finished — so each rider gets one
 * derived from their slug. Generated rather than stored: no media rows, no R2
 * objects, no quota consumed, and nothing to migrate. An uploaded avatar
 * always wins over this.
 *
 * Keyed on `slug` rather than `name` because the slug is immutable
 * (`author-alias.ts`: "never follows later renames, so links cannot break") —
 * a rename must not change someone's face.
 */

/** FNV-1a. Small, dependency-free, and stable across runtimes. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Hues sampled around the brand purple (`--primary: 264 94.9% 61.4%`) rather
 * than the full colour wheel, so a row of avatars reads as one family instead
 * of a fruit salad. Saturation and lightness are fixed at values that keep
 * white text legible on every one of them, in both themes.
 */
const HUES = [264, 244, 284, 224, 304, 204, 324, 184];

export type GeneratedAvatar = {
  /** Two stops of the same hue — flat fills look unfinished at 88px. */
  from: string;
  initial: string;
  to: string;
};

export function generatedAvatar(slug: string, name: string): GeneratedAvatar {
  const h = hash(slug);
  const hue = HUES[h % HUES.length];

  // Grapheme-aware: [...str][0] keeps a surrogate pair (an emoji, or a rare
  // CJK character outside the BMP) intact where str[0] would split it.
  const initial = [...name.trim()][0] ?? "?";

  return {
    from: `hsl(${hue} 72% 52%)`,
    initial,
    to: `hsl(${(hue + 24) % 360} 68% 38%)`,
  };
}

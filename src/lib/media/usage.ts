/**
 * What the member-facing visibility control is allowed to write.
 *
 * `media.usage` has three values but the checkbox in the media library only
 * governs two of them — `gallery` and `private`. The third, `attachment`, is
 * provenance: it is set by the editor's own upload path
 * (src/lib/members/upload-image.ts) and says the file exists because an
 * article references it.
 *
 * The first version of the dialog wrote `showOnWall ? 'gallery' : 'private'`
 * unconditionally. That reads as obviously correct and is not: opening an
 * article image's detail dialog to fix its alt text and pressing save
 * converted `attachment` to `private`, with nothing on screen to say so. It
 * loses the one thing that makes a file collectable — src/lib/media/unused.ts
 * can only ever sweep an `attachment` — so an image pasted into an article,
 * deleted from it, and then touched once in the library becomes a file nothing
 * will ever reclaim. Silent, and in the direction that costs storage forever.
 *
 * So the rule is narrow on purpose: **this control moves a file between
 * `gallery` and `private`, and leaves every other value alone.** Ticking the
 * box is still a member saying "put this on the wall", which is a real
 * decision and does overwrite `attachment` — that direction is deliberate and
 * visible, because they clicked it.
 *
 * The narrowness is also what makes the column extensible. `usage` is a plain
 * `text` column with no CHECK constraint, so a fourth value costs no DDL; what
 * it would otherwise cost is exactly this kind of silent clobbering by a
 * control that thinks it knows every case. It does not have to know them.
 */
import type { Media } from '@/payload-types'

/** `undefined` means "send no `usage` key at all" — leave whatever is stored. */
export function nextUsage(
  current: Media['usage'],
  showOnWall: boolean,
): Media['usage'] | undefined {
  if (showOnWall) return 'gallery'
  // Only a file that is currently on the wall can be taken off it. Anything
  // else is either already not on the wall, or is a value this control does
  // not govern.
  return current === 'gallery' ? 'private' : undefined
}

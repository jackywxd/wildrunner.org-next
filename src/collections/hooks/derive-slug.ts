import type { CollectionBeforeValidateHook } from 'payload'

/**
 * Fill an empty slug instead of refusing the save.
 *
 * `slug` is `required` and `unique`, so clearing it makes Payload reject the
 * document — and the member editor shows nothing when that happens. Measured
 * on a real walkthrough: a member cleared the slug, typed a title, clicked
 * 發布, and *nothing occurred*. No version was written, no message appeared,
 * the button stayed enabled and the status stayed 草稿. They typed a slug and
 * clicked again, and it published. The workaround leaves no trace, so the next
 * person meets it fresh. See docs/member-publish-flow.md.
 *
 * Filling it is the smaller half of the fix — a refused save should still say
 * why — but it removes the case people actually hit.
 *
 * THREE THINGS THIS DELIBERATELY DOES NOT DO.
 *
 * It never overwrites a slug that is already set. A slug is a public URL;
 * re-deriving it when someone edits their title would break every link to the
 * post, including ones other sites hold.
 *
 * It does not transliterate. Titles here are Traditional Chinese, and
 * romanising them well needs a dictionary this project has no reason to carry;
 * romanising them badly produces slugs nobody recognises. ASCII that is
 * already in the title is kept, and a title with none falls back to a stamped
 * slug — the same shape `PostsList.tsx` already generates for a new draft.
 *
 * It does not assume its own output is free. `uniquePostSlug` turns a
 * collision into a field error, which for a slug the member never typed would
 * be a mysterious rejection, so this resolves collisions itself.
 */
const MAX_SLUG_LENGTH = 60

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '')
}

export const derivePostSlug: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  req,
}) => {
  if (!data) return data

  const current = (data as { slug?: unknown }).slug
  if (typeof current === 'string' && current.trim() !== '') return data

  const title =
    (data as { title?: unknown }).title ??
    (originalDoc as { title?: unknown } | undefined)?.title
  const base =
    typeof title === 'string' && slugify(title) !== ''
      ? slugify(title)
      : // No ASCII to work with. A stamp rather than a transliteration: it is
        // ugly, it is unique, and it is obviously a placeholder the member can
        // replace — which a wrong romanisation would not be.
        `post-${Date.now()}`

  const id = (originalDoc as { id?: number | string } | undefined)?.id

  // Walk suffixes until one is free. Bounded: past a handful of collisions the
  // titles are identical anyway and the stamp settles it.
  for (const suffix of ['', '-2', '-3', '-4', '-5']) {
    const candidate = `${base}${suffix}`
    const clash = await req.payload.find({
      collection: 'posts',
      where: { slug: { equals: candidate } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
    const taken = clash.docs.some((doc) => doc.id !== id)
    if (!taken) {
      return { ...data, slug: candidate }
    }
  }

  return { ...data, slug: `${base}-${Date.now()}` }
}

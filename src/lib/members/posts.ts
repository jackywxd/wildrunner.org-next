import type { PayloadContent } from "@/lib/editor/serialize";

/**
 * The only way the member UI is allowed to write a post.
 *
 * `Posts` has `versions: { drafts: true }`. An update *without* `?draft=true`
 * writes straight to the published version — so an autosave that forgot the
 * flag would publish every keystroke to the live site. Publishing is
 * therefore an explicit, separate act (`publish: true`), and everything
 * else is a draft write. Keeping both in one function is what makes that
 * rule checkable in one place rather than at every call site.
 */

export type PostPayload = {
  content?: PayloadContent;
  description?: string;
  image?: number | null;
  /**
   * The race record this post reports on, or `null` to detach it.
   *
   * `null` and "absent" mean different things here and the distinction is
   * load-bearing: omitting the key leaves whatever is stored alone (an
   * autosave must not silently unlink the race), while `null` is the
   * member explicitly saying this is no longer a race report. `undefined`
   * disappears through JSON.stringify, which is exactly the behaviour the
   * first case wants.
   */
  raceRecord?: number | null;
  slug?: string;
  title?: string;
};

export type SaveResult =
  | { doc: { id: number }; ok: true }
  | { fieldErrors: Record<string, string>; message: string; ok: false };

async function readError(response: Response): Promise<SaveResult> {
  let message = "儲存失敗";
  const fieldErrors: Record<string, string> = {};
  try {
    const body = (await response.json()) as {
      errors?: {
        data?: { errors?: { message?: string; path?: string }[] };
        message?: string;
      }[];
    };
    const first = body.errors?.[0];
    if (first?.message) message = first.message;
    for (const detail of first?.data?.errors ?? []) {
      if (detail.path) fieldErrors[detail.path] = detail.message ?? message;
    }
  } catch {
    /* keep the default message */
  }
  return { fieldErrors, message, ok: false };
}

/**
 * `draft=true` on create too: a new post must not appear on the public site
 * before its author says so.
 */
export async function createPost(data: PostPayload): Promise<SaveResult> {
  const response = await fetch("/api/posts?draft=true", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, _status: "draft" }),
  });
  if (!response.ok) return readError(response);
  const body = (await response.json()) as { doc: { id: number } };
  return { doc: body.doc, ok: true };
}

export async function savePost(
  id: number,
  data: PostPayload,
  options: { publish?: boolean } = {},
): Promise<SaveResult> {
  const publish = options.publish === true;

  // Only the publish path may omit draft=true. Everything else — autosave,
  // an explicit "save draft", editing an already-published post — writes to
  // the draft version, leaving what the public sees untouched.
  const query = publish ? "" : "?draft=true";
  const response = await fetch(`/api/posts/${id}${query}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...data,
      _status: publish ? "published" : "draft",
      ...(publish ? { publishedAt: new Date().toISOString() } : {}),
    }),
  });
  if (!response.ok) return readError(response);
  const body = (await response.json()) as { doc: { id: number } };
  return { doc: body.doc, ok: true };
}

/**
 * Take a published post back off the public site, keeping the content.
 *
 * Deliberately *without* `?draft=true` — that flag means "write a draft
 * version and leave the published one alone", which is the exact opposite
 * of what unpublishing needs. With it, `_status: 'draft'` lands on a new
 * draft version while the published version stays live and the post remains
 * on the public site.
 */
export async function unpublishPost(id: number): Promise<SaveResult> {
  const response = await fetch(`/api/posts/${id}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ _status: "draft" }),
  });
  if (!response.ok) return readError(response);
  const body = (await response.json()) as { doc: { id: number } };
  return { doc: body.doc, ok: true };
}

export async function deletePost(id: number): Promise<boolean> {
  const response = await fetch(`/api/posts/${id}`, {
    method: "DELETE",
    credentials: "same-origin",
  });
  return response.ok;
}

/**
 * Load one post for editing.
 *
 * `depth: 0` is not an optimisation. At depth >= 1 Payload replaces every
 * upload node's numeric `value` with the full Media object; saving that
 * back would write an object into a field that must hold `473`. `draft:
 * true` returns the unsaved draft rather than the published version, so an
 * edit in progress isn't silently discarded.
 */
export async function loadPost(id: number) {
  const response = await fetch(`/api/posts/${id}?draft=true&depth=0`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) return null;
  return (await response.json()) as {
    _status?: "draft" | "published";
    content?: PayloadContent;
    description?: string;
    id: number;
    // depth: 0, so this is the bare id rather than a populated document.
    raceRecord?: number | null;
    slug?: string;
    title?: string;
  };
}

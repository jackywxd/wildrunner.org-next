import Link from "@/components/i18n/locale-link";

import { RiderAvatar } from "@/components/riders/RiderAvatar";
import { requireMember } from "@/lib/auth";
import { getBylineAvatar } from "@/lib/content";
import { memberFind } from "@/lib/members/data";
import { getPayloadClient } from "@/lib/payload";
import { quotaBytesFor, usedBytesFor } from "@/lib/quota";
import type { Author } from "@/payload-types";

/**
 * The member's landing page.
 *
 * WHAT IT USED TO BE: a welcome line and a storage bar, and nothing else.
 * That bar was also the least actionable number available — the quota is
 * 100 GB (see lib/quota.ts on why that is code and not configuration), so a
 * member using a couple of hundred megabytes read "0.23 / 100.00 GB" under a
 * progress bar two pixels wide, and the same block appeared again, verbatim,
 * on /members/profile. Nothing on the page said how many posts they had,
 * whether a draft was still unpublished, or that their work is public at
 * /riders/<slug> at all.
 *
 * WHAT IT IS NOW, top to bottom: who you are and where the public can see
 * you; what is still missing from that public page; what you have made; and
 * only then, storage. The ordering is the point — the first two answer "what
 * should I do next", which is what a member opens this page to find out.
 *
 * THE COUNTS ARE `totalDocs`, not documents. Every query below asks for
 * `limit: 1` and reads the count off the result, so a member with 500 photos
 * does not fetch 500 rows to render the number 500. They go through
 * `memberFind` rather than `payload.find` for the reason that function's
 * header gives: it is the members area's only read entry point, and it pins
 * `overrideAccess: false` while redundantly scoping to the owner.
 */

export const dynamic = "force-dynamic";

const toGb = (bytes: number) => (bytes / (1024 * 1024 * 1024)).toFixed(2);

export default async function MembersOverviewPage() {
  const user = await requireMember();
  const payload = await getPayloadClient();

  const authorId =
    typeof user.author === "object" && user.author !== null
      ? user.author.id
      : user.author;

  // depth 0, exactly as /members/profile does it: `authors.owner` is a
  // relationship to `users`, so depth 1 would populate the whole account —
  // email, invite state, live sessions — behind this card. The avatar comes
  // from `getBylineAvatar` below instead, which is a second query for
  // precisely that reason.
  const author = authorId
    ? ((await payload.findByID({
        collection: "authors",
        id: authorId,
        overrideAccess: false,
        user,
        depth: 0,
      })) as Author)
    : null;

  const [avatar, postsTotal, draftsTotal, mediaTotal, racesTotal, usedBytes] =
    await Promise.all([
      author ? getBylineAvatar(author.slug) : Promise.resolve(undefined),
      // `draft: true` on both, matching PostsList: without it a post whose
      // newest version is a draft reports its older published state, and the
      // two counts would then disagree with the list the member clicks into.
      memberFind("posts", { depth: 0, draft: true, limit: 1 }),
      memberFind("posts", {
        depth: 0,
        draft: true,
        limit: 1,
        where: { _status: { equals: "draft" } },
      }),
      memberFind("media", { depth: 0, limit: 1 }),
      memberFind("race-records", { depth: 0, limit: 1 }),
      usedBytesFor(payload, user.id),
    ]);

  const drafts = draftsTotal.totalDocs;
  const published = postsTotal.totalDocs - drafts;
  const quotaBytes = quotaBytesFor(user);
  const percent =
    quotaBytes > 0 ? Math.min(Math.round((usedBytes / quotaBytes) * 100), 100) : 0;

  const displayName = author?.name || user.displayName || user.email;

  /**
   * The four things that make a rider page worth visiting, in the order a
   * member can most easily do them. Shown with their state rather than
   * filtered to the unfinished ones — a list that silently shortens gives no
   * sense of progress — but the whole block disappears once all four are
   * done, because a permanent row of ticks is just furniture.
   */
  const steps = [
    { done: Boolean(author?.avatar), href: "/members/profile", label: "設定頭像" },
    { done: Boolean(author?.bio?.trim()), href: "/members/profile", label: "寫一段簡介" },
    { done: racesTotal.totalDocs > 0, href: "/members/races", label: "登錄第一筆比賽紀錄" },
    { done: published > 0, href: "/members/posts/new", label: "發表第一篇文章" },
  ];
  const remaining = steps.filter((step) => !step.done).length;

  // `id` is separate from `label` so the testids stay English kebab-case like
  // every other one in the members area (`member-nav-profile`, `quota-card`).
  const tiles = [
    { href: "/members/posts", id: "published", label: "已發布文章", value: published },
    { href: "/members/posts", id: "drafts", label: "草稿", value: drafts },
    { href: "/members/media", id: "media", label: "媒體檔案", value: mediaTotal.totalDocs },
    { href: "/members/races", id: "races", label: "比賽紀錄", value: racesTotal.totalDocs },
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <section
        className="flex items-center gap-4 border border-border p-4"
        data-testid="member-identity"
      >
        {author ? (
          <RiderAvatar
            rider={{ avatar, name: displayName, slug: author.slug }}
            size={56}
          />
        ) : null}
        <div className="min-w-0">
          <h1
            className="font-heading text-xl font-semibold"
            data-testid="member-welcome"
          >
            {displayName}
          </h1>
          {author ? (
            <Link
              className="text-sm text-primary hover:underline"
              data-testid="member-public-page"
              href={`/riders/${author.slug}`}
            >
              查看我的公開頁面 →
            </Link>
          ) : (
            <p className="text-sm text-foreground/50">
              尚未建立作者身分，發表第一篇文章時會自動建立。
            </p>
          )}
        </div>
      </section>

      {remaining > 0 && (
        <section className="border border-border p-4" data-testid="member-next-steps">
          <h2 className="font-heading text-sm font-semibold text-foreground/70">
            完成你的個人頁
          </h2>
          <ul className="mt-3 space-y-2">
            {steps.map((step) => (
              <li key={step.label}>
                {step.done ? (
                  <span className="flex items-center gap-2 text-sm text-foreground/40">
                    <span aria-hidden>✓</span>
                    <span className="line-through">{step.label}</span>
                  </span>
                ) : (
                  <Link
                    className="flex items-center gap-2 text-sm hover:text-primary"
                    href={step.href}
                  >
                    <span aria-hidden className="text-foreground/30">
                      ○
                    </span>
                    <span>{step.label}</span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        data-testid="member-content-counts"
      >
        {tiles.map((tile) => (
          <Link
            className="border border-border p-4 transition-colors hover:border-primary"
            data-testid={`member-count-${tile.id}`}
            href={tile.href}
            key={tile.id}
          >
            <div className="font-heading text-3xl tabular-nums">{tile.value}</div>
            <div className="mt-1 text-xs text-foreground/60">{tile.label}</div>
          </Link>
        ))}
      </section>

      {/*
        Storage, deliberately one line and last. It is real information — a
        member who fills 100 GB needs to know — but it is not what anybody
        opens this page to find out, and it had been the entire page.
        `/members/media` keeps the full bar, next to the uploads and the
        delete controls that are the only way to act on it.
      */}
      <section className="border border-border p-4" data-testid="quota-card">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-foreground/60">儲存空間</span>
          <span className="text-xs tabular-nums text-foreground/60">
            已使用 {toGb(usedBytes)} / {toGb(quotaBytes)} GB
          </span>
        </div>
        <div className="mt-2 h-1 bg-secondary">
          <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
      </section>
    </div>
  );
}

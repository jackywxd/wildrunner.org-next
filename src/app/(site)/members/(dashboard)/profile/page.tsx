import { requireMember } from "@/lib/auth";
import { getPayloadClient } from "@/lib/payload";
import { quotaBytesFor, usedBytesFor } from "@/lib/quota";
import { ProfileForm } from "@/components/members/profile/ProfileForm";
import type { Author } from "@/payload-types";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireMember();
  const payload = await getPayloadClient();

  const authorId =
    typeof user.author === "object" && user.author !== null
      ? user.author.id
      : user.author;

  const [author, usedBytes] = await Promise.all([
    authorId
      ? (payload.findByID({
          collection: "authors",
          id: authorId,
          overrideAccess: false,
          user,
          depth: 0,
        }) as Promise<Author>)
      : Promise.resolve(null),
    usedBytesFor(payload, user.id),
  ]);
  const quotaBytes = quotaBytesFor(user);

  return (
    <div className="max-w-xl">
      <h1 className="font-heading text-2xl font-semibold">個人資料</h1>
      <ProfileForm
        userId={user.id}
        displayName={user.displayName ?? ""}
        author={
          author
            ? {
                // `avatar` is an id here and must stay one: the query above
                // is depth 0, so Payload returns the relationship unpopulated
                // and AvatarField resolves it to a picture itself.
                avatar: typeof author.avatar === "number" ? author.avatar : null,
                bio: author.bio ?? "",
                id: author.id,
                name: author.name,
                slug: author.slug,
              }
            : null
        }
        usedBytes={usedBytes}
        quotaBytes={quotaBytes}
      />
    </div>
  );
}

import { requireMember } from "@/lib/auth";
import { getPayloadClient } from "@/lib/payload";
import { quotaBytesFor, usedBytesFor } from "@/lib/quota";

export const dynamic = "force-dynamic";

const toGb = (bytes: number) => (bytes / (1024 * 1024 * 1024)).toFixed(2);

export default async function MembersOverviewPage() {
  const user = await requireMember();
  const payload = await getPayloadClient();

  const [usedBytes, quotaBytes] = await Promise.all([
    usedBytesFor(payload, user.id),
    Promise.resolve(quotaBytesFor(user)),
  ]);
  const percent = quotaBytes > 0 ? Math.round((usedBytes / quotaBytes) * 100) : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold" data-testid="member-welcome">
          歡迎回來，{user.displayName || user.email}
        </h1>
      </div>

      <div
        className="max-w-xs border border-border p-4"
        data-testid="quota-card"
      >
        <div className="text-xs text-foreground/60">儲存空間</div>
        <div className="mt-1 font-heading text-3xl">
          {toGb(usedBytes)}{" "}
          <span className="text-base text-foreground/50">
            / {toGb(quotaBytes)} GB
          </span>
        </div>
        <div className="mt-2 h-1.5 bg-secondary">
          <div
            className="h-full bg-primary"
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

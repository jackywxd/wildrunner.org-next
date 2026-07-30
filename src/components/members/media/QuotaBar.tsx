const toGb = (bytes: number) => (bytes / (1024 * 1024 * 1024)).toFixed(2);

export function QuotaBar({
  quotaBytes,
  usedBytes,
}: {
  quotaBytes: number;
  usedBytes: number;
}) {
  const percent =
    quotaBytes > 0 ? Math.min(Math.round((usedBytes / quotaBytes) * 100), 100) : 0;

  return (
    <div
      className="border border-border p-4"
      data-testid="media-quota-bar"
      data-used-bytes={usedBytes}
    >
      <div className="text-xs text-foreground/60">儲存空間</div>
      <div className="mt-1 font-heading text-2xl">
        {toGb(usedBytes)}{" "}
        <span className="text-base text-foreground/50">
          / {toGb(quotaBytes)} GB
        </span>
      </div>
      <div className="mt-2 h-1.5 bg-secondary">
        <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

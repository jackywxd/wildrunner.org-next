import Image from "next/image";

import type { SiteRider } from "@/lib/content-types";
import { generatedAvatar } from "@/lib/riders/avatar";
import { cn } from "@/lib/utils";

/**
 * A rider's avatar: their upload if they have one, otherwise a deterministic
 * generated one so nobody renders as a blank square. See lib/riders/avatar.ts
 * for why it is generated rather than stored.
 */
export function RiderAvatar({
  className,
  rider,
  size,
}: {
  className?: string;
  /**
   * Only the three fields it draws from. Widened from `SiteRider` so the club
   * timeline can pass a `ClubRunner` — the same byline, minus counts and
   * races that this component never reads — without inventing a `postCount`
   * of 0 to satisfy a type.
   */
  rider: Pick<SiteRider, "avatar" | "name" | "slug">;
  size: number;
}) {
  if (rider.avatar) {
    return (
      <div
        className={cn("shrink-0 overflow-hidden", className)}
        data-avatar-kind="uploaded"
        data-testid="rider-avatar"
        style={{ height: size, width: size }}
      >
        <Image
          alt={rider.name}
          className="h-full w-full object-cover"
          height={size}
          src={rider.avatar.src}
          width={size}
        />
      </div>
    );
  }

  const { from, initial, to } = generatedAvatar(rider.slug, rider.name);

  return (
    <div
      aria-label={rider.name}
      className={cn(
        "flex shrink-0 select-none items-center justify-center overflow-hidden text-white",
        className,
      )}
      data-avatar-kind="generated"
      data-testid="rider-avatar"
      role="img"
      style={{
        backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
        height: size,
        width: size,
      }}
    >
      <span
        className="font-heading font-black leading-none"
        style={{ fontSize: size * 0.44 }}
      >
        {initial}
      </span>
    </div>
  );
}

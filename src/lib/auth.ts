import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getPayloadClient } from "./payload";
import type { User } from "@/payload-types";

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const payload = await getPayloadClient();
  const { user } = await payload.auth({ headers: await headers() });
  return user;
});

/**
 * Every members-area page calls this itself (not just the layout) — a soft
 * navigation between two member pages re-renders only the page segment, so
 * a gate that lived solely in layout.tsx would not run again.
 */
export async function requireMember(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/members/login");
  return user;
}

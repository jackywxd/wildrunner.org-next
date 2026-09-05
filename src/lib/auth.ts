import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getPayloadClient } from "./payload";
import { currentLocale } from "@/lib/i18n/dictionary";
import { localizedPath } from "@/lib/i18n/locales";
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
 *
 * THE LOGIN SCREEN IS SENT IN THE LANGUAGE THE READER WAS ALREADY IN.
 * `localizedPath` rather than `localeHref` because this is the one place that
 * knows the answer outright: it is a Server Component, so `currentLocale()`
 * reads `[lang]` from the route — and returns the default for the callers
 * that have no `[lang]` above them at all.
 */
export async function requireMember(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(localizedPath(await currentLocale(), "/members/login"));
  return user;
}

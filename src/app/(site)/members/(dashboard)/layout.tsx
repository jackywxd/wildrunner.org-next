import type { ReactNode } from "react";
import { MemberNav } from "@/components/members/shell/MemberNav";
import { requireMember } from "@/lib/auth";

// A layout.tsx at src/app/(site)/members/ would gate /members/login too —
// Next.js layouts wrap every route below their segment with no opt-out.
// This (dashboard) route group keeps the URL space flat (/members,
// /members/profile, ...) while letting /members/login sit outside the
// gated subtree.
export const dynamic = "force-dynamic";

export default async function MemberDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireMember();

  return (
    <div className="flex min-h-[100vh] flex-col fhd:flex-row">
      <MemberNav user={user} />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}

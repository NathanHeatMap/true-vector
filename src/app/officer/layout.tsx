export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import { tryGetContext } from "@/lib/tenant";

/**
 * Officer-area layout. Auth-gates the entire `/officer/*` tree.
 * Children render their own Topbar + Sidebar so they can set the breadcrumb +
 * active section per page.
 */
export default async function OfficerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await tryGetContext(["officer", "owner", "adjudicator", "analyst", "auditor"]);
  if (!ctx) {
    redirect("/");
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--color-tv-bg)]">
      {children}
    </div>
  );
}

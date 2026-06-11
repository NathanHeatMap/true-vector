import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { requireRole } from "@/lib/tenant";

import { NewRoleForm } from "./new-role-form";

export const metadata = { title: "New role" };

export default async function NewRolePage() {
  await requireRole(["officer", "owner"]);

  return (
    <>
      <Topbar
        breadcrumbs={[
          { label: "Home", href: "/officer" },
          { label: "Roles", href: "/officer/roles" },
          { label: "New role" },
        ]}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar section="roles" />
        <main className="flex-1 overflow-y-auto px-8 py-8">
          <header className="mb-6">
            <h1 className="text-2xl font-bold">New role</h1>
            <p className="mt-1 text-sm text-[var(--color-tv-text-2)]">
              Describe the role; the Role Risk Agent will score it and propose a check set.
            </p>
          </header>
          <NewRoleForm />
        </main>
      </div>
    </>
  );
}

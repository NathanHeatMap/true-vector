export const dynamic = "force-dynamic";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { requireRole } from "@/lib/tenant";

import { NewCandidateForm } from "./new-candidate-form";

export const metadata = { title: "New candidate" };

export default async function NewCandidatePage() {
  await requireRole(["officer", "owner", "hr"]);

  return (
    <>
      <Topbar
        breadcrumbs={[
          { label: "Home", href: "/officer" },
          { label: "Candidates", href: "/officer/candidates" },
          { label: "New candidate" },
        ]}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar section="candidates" />
        <main className="flex-1 overflow-y-auto px-8 py-8">
          <header className="mb-6">
            <h1 className="text-2xl font-bold">New candidate</h1>
            <p className="mt-1 text-sm text-[var(--color-tv-text-2)]">
              Capture the candidate&apos;s identity. You can open a screening
              case against any of your active roles from the candidate detail
              page.
            </p>
          </header>
          <NewCandidateForm />
        </main>
      </div>
    </>
  );
}

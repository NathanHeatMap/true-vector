import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";

/**
 * Landing page. Not the product UI — just a clean entry surface for the
 * prototype. Signed-out visitors see a sign-in prompt; signed-in users
 * jump straight to the officer dashboard.
 */
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-[var(--color-tv-border-soft)] bg-[var(--color-tv-surface-2)] px-6 py-3">
        <div className="flex items-center gap-2 font-semibold">
          <span aria-hidden>▦</span>
          <span>True Vector</span>
        </div>
        <SignedIn>
          <UserButton />
        </SignedIn>
        <SignedOut>
          <SignInButton mode="modal">
            <button className="rounded-md border border-[var(--color-tv-border)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--color-tv-text)] hover:bg-[var(--color-tv-surface-2)]">
              Sign in
            </button>
          </SignInButton>
        </SignedOut>
      </header>

      {/* Hero */}
      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-tv-accent)]">
          Active vetting · continuous suitability
        </p>
        <h1 className="mt-3 text-4xl font-bold leading-tight text-[var(--color-tv-text)]">
          Defensible workforce trust decisions for defence-environment
          employers.
        </h1>
        <p className="mt-4 max-w-prose text-lg leading-relaxed text-[var(--color-tv-text-2)]">
          True Vector turns workforce screening from a checklist of imports into
          an active investigation, designed to meet AS&nbsp;4811:2022 and
          PSPF&nbsp;12–14 obligations from day one, with audit-grade traceability
          on every decision.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <SignedIn>
            <Link
              href="/officer"
              className="rounded-md bg-[var(--color-tv-text)] px-4 py-2 text-sm font-semibold text-white"
            >
              Open dashboard →
            </Link>
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="rounded-md bg-[var(--color-tv-text)] px-4 py-2 text-sm font-semibold text-white">
                Sign in to continue
              </button>
            </SignInButton>
          </SignedOut>
        </div>
      </section>

      <footer className="border-t border-[var(--color-tv-border-soft)] px-6 py-4 text-xs text-[var(--color-tv-text-3)]">
        Prototype · v0.1 · not for production use
      </footer>
    </main>
  );
}

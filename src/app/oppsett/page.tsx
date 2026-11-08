import { Database } from "lucide-react";
import { Logo } from "@/components/logo";

export const metadata = { title: "Oppsett" };

/** Vises når Supabase-miljøvariablene mangler – forklarer hva som må gjøres. */
export default function SetupPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-12">
      <Logo className="mb-10" />
      <div className="card p-8">
        <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-warn-soft text-warn">
          <Database className="size-6" aria-hidden="true" />
        </div>
        <h1 className="font-display text-2xl font-bold">Koble til Supabase</h1>
        <p className="mt-2 text-ink-2">Appen trenger en Supabase-database. Slik kommer du i gang:</p>
        <ol className="mt-5 list-decimal space-y-3 pl-5 text-sm">
          <li>Opprett et Supabase-prosjekt (eller bruk <code className="rounded bg-surface-2 px-1.5 py-0.5">supabase start</code> lokalt).</li>
          <li>
            Kjør migrasjonene i <code className="rounded bg-surface-2 px-1.5 py-0.5">supabase/migrations</code> (
            <code className="rounded bg-surface-2 px-1.5 py-0.5">supabase db push</code>).
          </li>
          <li>
            Kopier <code className="rounded bg-surface-2 px-1.5 py-0.5">.env.example</code> til <code className="rounded bg-surface-2 px-1.5 py-0.5">.env.local</code> og fyll inn{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5">NEXT_PUBLIC_SUPABASE_URL</code> og{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>.
          </li>
          <li>Start utviklingsserveren på nytt.</li>
        </ol>
        <p className="mt-6 text-sm text-ink-3">Se README.md for detaljer.</p>
      </div>
    </main>
  );
}

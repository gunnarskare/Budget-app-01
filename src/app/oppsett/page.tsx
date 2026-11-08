import { Database } from "lucide-react";
import { Logo } from "@/components/logo";

export const metadata = { title: "Oppsett" };

const code = "rounded bg-surface-2 px-1.5 py-0.5";

/** Vises når Supabase-miljøvariablene mangler – forklarer hva som må gjøres (lokalt eller på Vercel). */
export default function SetupPage() {
  // Settes av Vercel under bygging og kjøring
  const onVercel = Boolean(process.env.VERCEL);

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-12">
      <Logo className="mb-10" />
      <div className="card p-8">
        <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-warn-soft text-warn">
          <Database className="size-6" aria-hidden="true" />
        </div>
        <h1 className="font-display text-2xl font-bold">Koble til Supabase</h1>
        <p className="mt-2 text-ink-2">Appen er klar, men mangler en Supabase-database. Slik kommer du i gang:</p>

        {onVercel ? (
          <ol className="mt-5 list-decimal space-y-3 pl-5 text-sm">
            <li>
              Opprett (eller velg) et Supabase-prosjekt og kjør migrasjonene i <code className={code}>supabase/migrations</code> i rekkefølge (<code className={code}>supabase db push</code>, eller lim dem inn i SQL-editoren).
            </li>
            <li>
              I Vercel: <em>Project → Settings → Environment Variables</em>. Legg til <code className={code}>NEXT_PUBLIC_SUPABASE_URL</code> og <code className={code}>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> for <em>Production</em> (og gjerne <em>Preview</em>).
            </li>
            <li>
              Kjør en ny deploy (<em>Deployments → Redeploy</em>). Variablene leses ved bygging, så de virker først etter ny deploy.
            </li>
            <li>
              I Supabase under <em>Authentication → URL Configuration</em>: legg til adressen til denne siden og <code className={code}>/auth/callback</code> som tillatt redirect-URL.
            </li>
          </ol>
        ) : (
          <ol className="mt-5 list-decimal space-y-3 pl-5 text-sm">
            <li>
              Opprett et Supabase-prosjekt (eller bruk <code className={code}>supabase start</code> lokalt).
            </li>
            <li>
              Kjør migrasjonene i <code className={code}>supabase/migrations</code> (<code className={code}>supabase db push</code>).
            </li>
            <li>
              Kopier <code className={code}>.env.example</code> til <code className={code}>.env.local</code> og fyll inn <code className={code}>NEXT_PUBLIC_SUPABASE_URL</code> og <code className={code}>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>.
            </li>
            <li>Start utviklingsserveren på nytt.</li>
          </ol>
        )}
        <p className="mt-6 text-sm text-ink-3">Se README.md for detaljer.</p>
      </div>
    </main>
  );
}

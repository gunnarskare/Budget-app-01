"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, type AuthState } from "@/app/actions/auth";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, Input } from "@/components/ui/input";

export function LoginForm({ next, linkError }: { next: string; linkError: boolean }) {
  const [state, action] = useActionState<AuthState, FormData>(signIn, null);
  return (
    <div className="animate-fade-up">
      <h2 className="font-display text-3xl font-bold tracking-tight">Velkommen tilbake</h2>
      <p className="mt-2 text-ink-2">Logg inn for å se økonomien din.</p>

      {(state?.error || linkError) && (
        <p role="alert" className="mt-6 rounded-ctl bg-neg-soft px-4 py-3 text-sm text-neg">
          {state?.error ?? "Lenken er utløpt eller ugyldig. Prøv å logge inn eller be om en ny."}
        </p>
      )}

      <form action={action} className="mt-8 space-y-5">
        <input type="hidden" name="next" value={next} />
        <Field label="E-post" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required autoFocus placeholder="deg@eksempel.no" />
        </Field>
        <Field label="Passord" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required placeholder="••••••••" />
        </Field>
        <SubmitButton size="lg" className="w-full">
          Logg inn
        </SubmitButton>
      </form>

      <div className="mt-6 flex items-center justify-between text-sm">
        <Link href="/glemt-passord" className="text-accent hover:underline">
          Glemt passord?
        </Link>
        <span className="text-ink-2">
          Ny her?{" "}
          <Link href="/registrer" className="font-medium text-accent hover:underline">
            Opprett konto
          </Link>
        </span>
      </div>
    </div>
  );
}

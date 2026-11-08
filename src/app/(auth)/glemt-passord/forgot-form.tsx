"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPassword, type AuthState } from "@/app/actions/auth";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

export function ForgotForm() {
  const [state, action] = useActionState<AuthState, FormData>(forgotPassword, null);
  return (
    <div className="animate-fade-up">
      <h2 className="font-display text-3xl font-bold tracking-tight">Glemt passord?</h2>
      <p className="mt-2 text-ink-2">Skriv inn e-posten din, så sender vi en lenke for å lage et nytt.</p>

      {state?.error && (
        <p role="alert" className="mt-6 rounded-ctl bg-neg-soft px-4 py-3 text-sm text-neg">
          {state.error}
        </p>
      )}
      {state?.message && <p className="mt-6 rounded-ctl bg-pos-soft px-4 py-3 text-sm text-pos">{state.message}</p>}

      <form action={action} className="mt-8 space-y-5">
        <Field label="E-post" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
        </Field>
        <SubmitButton size="lg" className="w-full">
          Send lenke
        </SubmitButton>
      </form>
      <Link href="/login" className="mt-6 inline-block text-sm font-medium text-accent hover:underline">
        Tilbake til innlogging
      </Link>
    </div>
  );
}

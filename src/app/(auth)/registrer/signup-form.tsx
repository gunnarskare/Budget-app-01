"use client";

import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { signUp, type AuthState } from "@/app/actions/auth";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

export function SignupForm() {
  const [state, action] = useActionState<AuthState, FormData>(signUp, null);

  if (state?.message) {
    return (
      <div className="animate-fade-up text-center">
        <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-pos-soft text-pos">
          <MailCheck className="size-7" aria-hidden="true" />
        </div>
        <h2 className="font-display text-2xl font-bold">Sjekk e-posten din</h2>
        <p className="mt-2 text-ink-2">{state.message}</p>
        <Link href="/login" className="mt-6 inline-block text-sm font-medium text-accent hover:underline">
          Tilbake til innlogging
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <h2 className="font-display text-3xl font-bold tracking-tight">Kom i gang</h2>
      <p className="mt-2 text-ink-2">Det tar under fem minutter å få oversikt. Ingen kort, ingen bankinnlogging.</p>

      {state?.error && (
        <p role="alert" className="mt-6 rounded-ctl bg-neg-soft px-4 py-3 text-sm text-neg">
          {state.error}
        </p>
      )}

      <form action={action} className="mt-8 space-y-5">
        <Field label="Fornavn (valgfritt)" htmlFor="name">
          <Input id="name" name="name" autoComplete="given-name" maxLength={80} placeholder="Hva skal vi kalle deg?" />
        </Field>
        <Field label="E-post" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required placeholder="deg@eksempel.no" />
        </Field>
        <Field label="Passord" htmlFor="password" hint="Minst 8 tegn.">
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} placeholder="••••••••" />
        </Field>
        <SubmitButton size="lg" className="w-full">
          Opprett konto
        </SubmitButton>
      </form>

      <p className="mt-6 text-sm text-ink-2">
        Har du allerede en konto?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Logg inn
        </Link>
      </p>
    </div>
  );
}

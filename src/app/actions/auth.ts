"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/supabase/env";

export type AuthState = { error?: string; message?: string } | null;

const email = z.string().trim().toLowerCase().pipe(z.email("Skriv inn en gyldig e-postadresse").max(200));
const password = z.string().min(8, "Passordet må ha minst 8 tegn").max(200, "Passordet er for langt");

function translate(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "Feil e-post eller passord.";
  if (m.includes("email not confirmed")) return "E-posten er ikke bekreftet ennå. Sjekk innboksen din.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Det finnes allerede en bruker med denne e-posten. Prøv å logge inn.";
  if (m.includes("password") && (m.includes("weak") || m.includes("short") || m.includes("at least"))) return "Passordet er for svakt. Bruk minst 8 tegn.";
  if (m.includes("rate limit") || m.includes("too many")) return "For mange forsøk. Vent litt og prøv igjen.";
  return "Noe gikk galt. Prøv igjen om litt.";
}

/** Tillat kun interne stier som omdirigeringsmål (hindrer åpen redirect). */
export function safeNext(value: FormDataEntryValue | string | null | undefined, fallback = "/oversikt"): string {
  const v = typeof value === "string" ? value : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.includes("\\") ? v : fallback;
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z.object({ email, password: z.string().min(1, "Skriv inn passordet").max(200) }).safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: translate(error.message) };
  redirect(safeNext(formData.get("next")));
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z
    .object({ email, password, name: z.string().trim().max(80).optional() })
    .safeParse({ email: formData.get("email"), password: formData.get("password"), name: formData.get("name") || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${SITE_URL}/auth/callback`,
      data: parsed.data.name ? { display_name: parsed.data.name } : undefined,
    },
  });
  if (error) return { error: translate(error.message) };

  // Med e-postbekreftelse påslått får vi ingen sesjon før brukeren har klikket i e-posten.
  if (!data.session) {
    return { message: "Nesten ferdig! Vi har sendt en bekreftelseslenke til e-posten din. Klikk på den for å komme i gang." };
  }
  redirect("/onboarding");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function forgotPassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z.object({ email }).safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: `${SITE_URL}/auth/callback?next=/innstillinger` });
  // Samme svar uansett – avslører ikke hvilke e-poster som finnes.
  return { message: "Hvis e-posten finnes hos oss, har vi sendt en lenke for å lage nytt passord." };
}

import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Logg inn" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; feil?: string }> }) {
  const { next, feil } = await searchParams;
  return <LoginForm next={next ?? ""} linkError={feil === "lenke"} />;
}

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Sikker JSON-parsing fra Server Action-resultat osv. */
export function errorMessage(e: unknown, fallback = "Noe gikk galt. Prøv igjen."): string {
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

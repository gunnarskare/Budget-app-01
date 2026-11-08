import "server-only";
import { headers } from "next/headers";

/**
 * Basis-URL som brukes i lenker i e-post (bekreftelse / glemt passord).
 * Rekkefølge: eksplisitt NEXT_PUBLIC_SITE_URL → adressen forespørselen kom fra
 * (virker likt lokalt, i preview og produksjon) → Vercels produksjons-URL → localhost.
 */
export async function resolveSiteUrl(): Promise<string> {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  try {
    const h = await headers();
    const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
    if (host) {
      const local = host.startsWith("localhost") || host.startsWith("127.0.0.1");
      const proto = (h.get("x-forwarded-proto") ?? (local ? "http" : "https")).split(",")[0].trim();
      return `${proto}://${host}`;
    }
  } catch {
    /* utenfor en forespørsel */
  }

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return production ? `https://${production}` : "http://localhost:3000";
}

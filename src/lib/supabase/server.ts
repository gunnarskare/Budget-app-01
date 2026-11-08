import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "./env";

/** Supabase-klient for Server Components, Server Actions og Route Handlers. */
export async function createClient() {
  // cookies() først: da markeres siden som dynamisk under bygging, også når miljøvariablene mangler
  // (f.eks. første Vercel-bygg før Supabase er koblet til) – ellers feiler forhåndsrenderingen.
  const cookieStore = await cookies();
  const { url, key } = getSupabaseEnv();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Kalt fra en Server Component – kan ignoreres siden proxy.ts fornyer sesjonen.
        }
      },
    },
  });
}

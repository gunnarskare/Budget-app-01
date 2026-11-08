import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export const getSupabase = cache(async () => createClient());

/** Innlogget bruker (verifisert mot Auth-serveren), eller null. */
export const getUser = cache(async () => {
  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** For sider og Server Actions: krever innlogging. */
export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  const supabase = await getSupabase();
  return { supabase, user };
}

export const getProfile = cache(async (): Promise<Profile> => {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, currency, ai_enabled, onboarded_at")
    .eq("id", user.id)
    .maybeSingle();
  if (data) return data as Profile;
  // Brukere som ble opprettet før profil-triggeren fantes
  const { data: created } = await supabase
    .from("profiles")
    .upsert({ id: user.id }, { onConflict: "id" })
    .select("id, display_name, currency, ai_enabled, onboarded_at")
    .single();
  return created as Profile;
});

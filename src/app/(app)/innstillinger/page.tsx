import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { SettingsView } from "@/components/settings/settings-view";
import { getAiConfig } from "@/lib/data/ai";
import { getProfile, requireUser } from "@/lib/data/context";
import { getCore } from "@/lib/data/core";
import { countTransactions } from "@/lib/data/loaders";

export const metadata: Metadata = { title: "Innstillinger" };

export default async function SettingsPage() {
  const { supabase, user } = await requireUser();
  const [profile, { accounts }, txCount] = await Promise.all([getProfile(), getCore(), countTransactions(supabase)]);

  // Beregnet saldo per konto: startsaldo + sum av alle transaksjoner
  const sums = new Map<string, number>();
  for (let offset = 0; ; offset += 1000) {
    const { data } = await supabase.from("transactions").select("account_id, amount").order("id").range(offset, offset + 999);
    for (const r of (data ?? []) as Array<{ account_id: string; amount: number }>) sums.set(r.account_id, (sums.get(r.account_id) ?? 0) + Number(r.amount));
    if (!data || data.length < 1000) break;
  }
  const balances = Object.fromEntries(accounts.map((a) => [a.id, Math.round((a.opening_balance + (sums.get(a.id) ?? 0)) * 100) / 100]));

  return (
    <>
      <PageHeader title="Innstillinger" description="Profil, kontoer, utseende og personvern." />
      <SettingsView profile={profile} email={user.email ?? ""} accounts={accounts} balances={balances} txCount={txCount} aiConfigured={!!getAiConfig()} />
    </>
  );
}

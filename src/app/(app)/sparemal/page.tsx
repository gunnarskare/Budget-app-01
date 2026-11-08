import type { Metadata } from "next";
import { GoalsView } from "@/components/goals/goals-view";
import { PageHeader } from "@/components/page-header";
import { getProfile, requireUser } from "@/lib/data/context";
import { fetchGoals } from "@/lib/data/loaders";
import { todayISO } from "@/lib/dates";
import { goalProgress } from "@/lib/finance/goals";

export const metadata: Metadata = { title: "Sparemål" };

export default async function GoalsPage() {
  const { supabase } = await requireUser();
  const { currency } = await getProfile();
  const goals = await fetchGoals(supabase);
  const today = todayISO();
  return (
    <>
      <PageHeader title="Sparemål" description="Følg fremgangen mot det du sparer til." />
      <GoalsView goals={goals.map((goal) => ({ goal, progress: goalProgress(goal, today) }))} currency={currency} />
    </>
  );
}

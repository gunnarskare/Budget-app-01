import { redirect } from "next/navigation";
import { getProfile } from "@/lib/data/context";
import { getCore } from "@/lib/data/core";
import { OnboardingFlow } from "./onboarding-flow";

// Server Actions på denne siden (import, eksempeldata, omberegning) kan ta noen sekunder.
export const maxDuration = 60;

export const metadata = { title: "Kom i gang" };

export default async function OnboardingPage() {
  const profile = await getProfile();
  if (profile.onboarded_at) redirect("/oversikt");
  const { accounts, categories, subcategories } = await getCore();
  return <OnboardingFlow name={profile.display_name ?? ""} currency={profile.currency} accounts={accounts} categories={categories} subcategories={subcategories} />;
}

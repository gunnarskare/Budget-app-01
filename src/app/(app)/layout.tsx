import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getProfile, requireUser } from "@/lib/data/context";
import { getCore } from "@/lib/data/core";
import { countReview } from "@/lib/data/loaders";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser();
  const profile = await getProfile();
  if (!profile.onboarded_at) redirect("/onboarding");

  const [{ categories, subcategories, accounts }, reviewCount] = await Promise.all([getCore(), countReview(supabase)]);

  return (
    <AppShell
      user={{ name: profile.display_name, email: user.email ?? "" }}
      reviewCount={reviewCount}
      currency={profile.currency}
      accounts={accounts}
      categories={categories}
      subcategories={subcategories}
    >
      <a href="#innhold" className="sr-only focus:not-sr-only">
        Hopp til innhold
      </a>
      {children}
    </AppShell>
  );
}

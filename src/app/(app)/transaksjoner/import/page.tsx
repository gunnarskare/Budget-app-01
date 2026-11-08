import { History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ImportWizard } from "@/components/import/import-wizard";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getProfile } from "@/lib/data/context";
import { getCore } from "@/lib/data/core";

export const metadata: Metadata = { title: "Importer transaksjoner" };

export default async function ImportPage() {
  const [{ accounts, categories, subcategories }, profile] = await Promise.all([getCore(), getProfile()]);
  return (
    <>
      <PageHeader
        title="Importer fra banken"
        description="Last opp en CSV-fil – så kategoriserer vi transaksjonene for deg."
        actions={
          <Button asChild variant="secondary">
            <Link href="/transaksjoner/historikk">
              <History /> Importhistorikk
            </Link>
          </Button>
        }
      />
      <ImportWizard accounts={accounts} categories={categories} subcategories={subcategories} currency={profile.currency} />
    </>
  );
}

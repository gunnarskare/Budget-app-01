import { FileUp, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { HistoryList } from "@/components/import/history-list";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/data/context";
import { getCore } from "@/lib/data/core";
import { fetchImportBatches } from "@/lib/data/loaders";

export const metadata: Metadata = { title: "Importhistorikk" };

export default async function HistoryPage() {
  const { supabase } = await requireUser();
  const [{ accounts }, batches] = await Promise.all([getCore(), fetchImportBatches(supabase)]);
  return (
    <>
      <PageHeader
        title="Importhistorikk"
        description="Alle filer du har importert. Du kan angre en hel import hvis noe ble feil."
        actions={
          <Button asChild>
            <Link href="/transaksjoner/import">
              <Upload /> Ny import
            </Link>
          </Button>
        }
      />
      {batches.length === 0 ? (
        <Card>
          <EmptyState icon={<FileUp />} title="Ingen importer ennå" description="Når du importerer en bankfil dukker den opp her, slik at du kan se hva som ble lagt til – og angre om nødvendig.">
            <Button asChild>
              <Link href="/transaksjoner/import">Importer din første fil</Link>
            </Button>
          </EmptyState>
        </Card>
      ) : (
        <HistoryList batches={batches} accountNames={Object.fromEntries(accounts.map((a) => [a.id, a.name]))} />
      )}
    </>
  );
}

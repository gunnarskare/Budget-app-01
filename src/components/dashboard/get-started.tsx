"use client";

import { FlaskConical, Hammer, PenLine, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { seedDemoData } from "@/app/actions/onboarding";
import { TransactionFormDialog } from "@/components/transactions/transaction-form-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Account, Category, Subcategory } from "@/lib/types";

/** Tomtilstand for en bruker uten transaksjoner: tre tydelige veier videre. */
export function GetStarted({ accounts, categories, subcategories }: { accounts: Account[]; categories: Category[]; subcategories: Subcategory[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [manual, setManual] = useState(false);

  function demo() {
    start(async () => {
      const res = await seedDemoData();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Eksempeldata lastet inn (${res.transactions} transaksjoner)`);
      router.refresh();
    });
  }

  const options = [
    {
      icon: <Hammer className="size-6" />,
      title: "Bygg et budsjett",
      badge: "Uten bankfil",
      text: "Start med inntekt og faste utgifter, sett rammer og bestem hvor mye du vil spare. Du trenger ingen transaksjoner.",
      action: (
        <Button asChild>
          <Link href="/budsjett/bygg">Start budsjettet</Link>
        </Button>
      ),
    },
    {
      icon: <Upload className="size-6" />,
      title: "Importer bankfil",
      text: "Last opp en CSV fra nettbanken. Vi kategoriserer for deg – du godkjenner det som er uklart.",
      action: (
        <Button asChild>
          <Link href="/transaksjoner/import">Last opp CSV</Link>
        </Button>
      ),
    },
    {
      icon: <FlaskConical className="size-6" />,
      title: "Prøv med eksempeldata",
      text: "Se hvordan appen ser ut med realistiske tall fra en norsk husholdning. Kan fjernes når som helst.",
      action: (
        <Button variant="soft" onClick={demo} loading={pending}>
          Last inn eksempel
        </Button>
      ),
    },
    {
      icon: <PenLine className="size-6" />,
      title: "Legg inn manuelt",
      text: "Registrer utgifter og inntekter selv, én og én.",
      action: (
        <Button variant="secondary" onClick={() => setManual(true)}>
          Ny transaksjon
        </Button>
      ),
    },
  ];

  return (
    <div className="animate-fade-up">
      <div className="mx-auto max-w-2xl py-6 text-center sm:py-10">
        <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">La oss få oversikt over pengene dine</h2>
        <p className="mt-3 text-ink-2">Du kan planlegge fremover med et budsjett, eller se tilbake på det du har brukt. Velg det som passer best:</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {options.map((o) => (
          <Card key={o.title} className="flex flex-col p-6 transition-transform duration-200 hover:-translate-y-1">
            <span aria-hidden="true" className="mb-4 grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary-soft-ink">
              {o.icon}
            </span>
            <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
              {o.title}
              {o.badge && <span className="rounded-full bg-pos-soft px-2 py-0.5 text-xs font-medium text-pos">{o.badge}</span>}
            </h3>
            <p className="mt-1.5 flex-1 text-sm text-ink-2">{o.text}</p>
            <div className="mt-5">{o.action}</div>
          </Card>
        ))}
      </div>
      <TransactionFormDialog open={manual} onOpenChange={setManual} accounts={accounts} categories={categories} subcategories={subcategories} />
    </div>
  );
}

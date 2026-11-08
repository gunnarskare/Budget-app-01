import { ChevronLeft, ChevronRight, FileUp, History, Inbox, PenLine, SearchX, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { TransactionFilters, type FilterValues } from "@/components/transactions/filters";
import { TransactionList } from "@/components/transactions/transaction-list";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/data/context";
import { COLUMNS, getCore } from "@/lib/data/core";
import { countReview } from "@/lib/data/loaders";
import { isValidISO } from "@/lib/dates";
import { plural } from "@/lib/format";
import type { Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";
import { NewTransactionButton } from "./new-transaction-button";

export const metadata: Metadata = { title: "Transaksjoner" };

const PAGE_SIZE = 50;
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const num = (s: string) => {
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return s.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const { categories, subcategories, accounts } = await getCore();

  const values: FilterValues = {
    q: one(sp.q).replace(/[,()"%*\\]/g, " ").trim().slice(0, 60),
    fra: isValidISO(one(sp.fra)) ? one(sp.fra) : "",
    til: isValidISO(one(sp.til)) ? one(sp.til) : "",
    kategori: one(sp.kategori) === "ukategorisert" || UUID.test(one(sp.kategori)) ? one(sp.kategori) : "",
    konto: UUID.test(one(sp.konto)) ? one(sp.konto) : "",
    type: one(sp.type) === "inn" || one(sp.type) === "ut" ? one(sp.type) : "",
    min: num(one(sp.min)) !== null ? one(sp.min) : "",
    maks: num(one(sp.maks)) !== null ? one(sp.maks) : "",
    visning: one(sp.visning) === "godkjenning" ? "godkjenning" : "",
  };
  const page = Math.max(1, Math.floor(Number(one(sp.side)) || 1));
  const reviewMode = values.visning === "godkjenning";

  let query = supabase.from("transactions").select(COLUMNS.txFull, { count: "exact" });
  if (reviewMode) query = query.or("review_status.eq.review,transfer_status.eq.suggested");
  if (values.q) query = query.or(`description.ilike.%${values.q}%,original_description.ilike.%${values.q}%`);
  if (values.fra) query = query.gte("booked_date", values.fra);
  if (values.til) query = query.lte("booked_date", values.til);
  if (values.kategori === "ukategorisert") query = query.is("category_id", null);
  else if (values.kategori) query = query.eq("category_id", values.kategori);
  if (values.konto) query = query.eq("account_id", values.konto);
  if (values.type === "inn") query = query.gt("amount", 0);
  if (values.type === "ut") query = query.lt("amount", 0);
  const min = num(values.min);
  const max = num(values.maks);
  if (min !== null) {
    if (values.type === "inn") query = query.gte("amount", min);
    else if (values.type === "ut") query = query.lte("amount", -min);
    else query = query.or(`amount.gte.${min},amount.lte.${-min}`);
  }
  if (max !== null) {
    if (values.type === "inn") query = query.lte("amount", max);
    else if (values.type === "ut") query = query.gte("amount", -max);
    else query = query.lte("amount", max).gte("amount", -max);
  }
  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await query
    .order("booked_date", { ascending: false })
    .order("id")
    .range(from, from + PAGE_SIZE - 1);

  const rows = (data ?? []) as unknown as Transaction[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const reviewCount = await countReview(supabase);
  const hasFilters = Object.entries(values).some(([k, v]) => k !== "visning" && v);

  const hrefFor = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(values)) if (v) params.set(k, v);
    if (p > 1) params.set("side", String(p));
    return `/transaksjoner${params.size ? `?${params}` : ""}`;
  };
  const tabHref = (visning: string) => (visning ? "/transaksjoner?visning=godkjenning" : "/transaksjoner");

  return (
    <>
      <PageHeader
        title="Transaksjoner"
        description={error ? undefined : `${plural(total, "transaksjon", "transaksjoner")}${hasFilters ? " som matcher filtrene" : ""}`}
        actions={
          <>
            <Button asChild variant="ghost" size="md" className="hidden sm:inline-flex">
              <Link href="/transaksjoner/historikk">
                <History /> Historikk
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/transaksjoner/import">
                <Upload /> Importer
              </Link>
            </Button>
            <NewTransactionButton accounts={accounts} categories={categories} subcategories={subcategories} />
          </>
        }
      />

      <div role="tablist" aria-label="Visning" className="mb-4 inline-flex gap-1 rounded-ctl bg-surface-2 p-1">
        {[
          { v: "", label: "Alle" },
          { v: "godkjenning", label: "Til godkjenning", count: reviewCount },
        ].map((t) => (
          <Link
            key={t.v}
            role="tab"
            aria-selected={values.visning === t.v}
            href={tabHref(t.v)}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3.5 text-[13px] font-medium text-ink-2 transition-all", values.visning === t.v && "bg-surface text-ink shadow-sm")}
          >
            {t.label}
            {t.count ? <span className="rounded-full bg-warn-fill px-1.5 text-[11px] font-semibold text-[#2b1b00]">{t.count}</span> : null}
          </Link>
        ))}
      </div>

      <TransactionFilters values={values} categories={categories} accounts={accounts} autoFocusSearch={one(sp.sok) === "1"} />

      {error ? (
        <Card className="p-6 text-sm text-neg">Kunne ikke hente transaksjonene. Prøv å laste siden på nytt.</Card>
      ) : rows.length === 0 ? (
        <Card>
          {reviewMode && !hasFilters ? (
            <EmptyState icon={<Inbox />} title="Alt er godkjent 🎉" description="Ingenting venter på godkjenning akkurat nå. Når du importerer nye transaksjoner som vi er usikre på, dukker de opp her.">
              <Button asChild variant="secondary">
                <Link href="/transaksjoner">Se alle transaksjoner</Link>
              </Button>
            </EmptyState>
          ) : hasFilters ? (
            <EmptyState icon={<SearchX />} title="Ingen treff" description="Ingen transaksjoner matcher filtrene dine. Prøv å fjerne noen av dem.">
              <Button asChild variant="secondary">
                <Link href={tabHref(values.visning)}>Nullstill filtre</Link>
              </Button>
            </EmptyState>
          ) : (
            <EmptyState icon={<FileUp />} title="Ingen transaksjoner ennå" description="Importer en bankfil fra nettbanken, eller legg inn en transaksjon manuelt for å komme i gang.">
              <Button asChild>
                <Link href="/transaksjoner/import">
                  <Upload /> Importer CSV
                </Link>
              </Button>
              <NewTransactionButton accounts={accounts} categories={categories} subcategories={subcategories} variant="secondary" label="Legg inn manuelt" icon={<PenLine />} />
            </EmptyState>
          )}
        </Card>
      ) : (
        <TransactionList rows={rows} categories={categories} subcategories={subcategories} accounts={accounts} reviewMode={reviewMode} />
      )}

      {pages > 1 && (
        <nav aria-label="Sider" className="mt-2 flex items-center justify-between pb-8">
          <Button asChild variant="secondary" size="sm" className={cn(page <= 1 && "pointer-events-none opacity-40")}>
            <Link href={hrefFor(page - 1)} aria-disabled={page <= 1}>
              <ChevronLeft /> Forrige
            </Link>
          </Button>
          <span className="text-sm text-ink-2">
            Side {page} av {pages}
          </span>
          <Button asChild variant="secondary" size="sm" className={cn(page >= pages && "pointer-events-none opacity-40")}>
            <Link href={hrefFor(page + 1)} aria-disabled={page >= pages}>
              Neste <ChevronRight />
            </Link>
          </Button>
        </nav>
      )}
    </>
  );
}

"use client";

import { ArrowLeftRight, Plus, Trash2, Wand2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createRule, deleteRule } from "@/app/actions/categories";
import { CategorySelect, type CategoryValue } from "@/components/category-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/input";
import type { CategorizationRule, Category, Subcategory } from "@/lib/types";

const MATCH_LABEL = { contains: "inneholder", equals: "er lik", starts_with: "starter med" } as const;
const DIR_LABEL = { any: "inn og ut", in: "kun inn", out: "kun ut" } as const;

export function RulesManager({ rules, categories, subcategories }: { rules: CategorizationRule[]; categories: Category[]; subcategories: Subcategory[] }) {
  const [pattern, setPattern] = useState("");
  const [matchType, setMatchType] = useState<"contains" | "equals" | "starts_with">("contains");
  const [direction, setDirection] = useState<"any" | "in" | "out">("any");
  const [category, setCategory] = useState<CategoryValue>({ categoryId: null, subcategoryId: null });
  const [transfer, setTransfer] = useState(false);
  const [applyExisting, setApplyExisting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const catById = new Map(categories.map((c) => [c.id, c]));
  const subById = new Map(subcategories.map((s) => [s.id, s]));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createRule({
        pattern,
        matchType,
        direction,
        categoryId: transfer ? null : category.categoryId,
        subcategoryId: category.subcategoryId,
        markTransfer: transfer,
        applyToExisting: applyExisting,
      });
      if (!res.ok) return setError(res.error);
      toast.success(res.applied > 0 ? `Regel lagret · ${res.applied} eksisterende transaksjoner oppdatert` : "Regel lagret");
      setPattern("");
      setCategory({ categoryId: null, subcategoryId: null });
      setTransfer(false);
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
      <div>
        {rules.length === 0 ? (
          <Card>
            <EmptyState icon={<Wand2 />} title="Ingen regler ennå" description="Når du endrer en kategori, lærer appen valget ditt og lager en regel automatisk. Du kan også lage egne regler her – de har høyest prioritet.">
            </EmptyState>
          </Card>
        ) : (
          <Card className="divide-y divide-line/70">
            {rules.map((r) => {
              const cat = r.category_id ? catById.get(r.category_id) : undefined;
              const sub = r.subcategory_id ? subById.get(r.subcategory_id) : undefined;
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="text-sm">
                      Beskrivelse {MATCH_LABEL[r.match_type]} <strong className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[13px]">{r.pattern}</strong>
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-2">
                      →{" "}
                      {r.mark_transfer ? (
                        <span className="inline-flex items-center gap-1">
                          <ArrowLeftRight className="size-3.5" /> Intern overføring
                        </span>
                      ) : (
                        <span className="font-medium text-ink">{cat?.name ?? "Slettet kategori"}{sub ? ` › ${sub.name}` : ""}</span>
                      )}
                      <Badge tone={r.source === "user" ? "primary" : "neutral"}>{r.source === "user" ? "Din regel" : "Lært"}</Badge>
                      {r.direction !== "any" && <Badge>{DIR_LABEL[r.direction]}</Badge>}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Slett regel for ${r.pattern}`}
                    onClick={() =>
                      start(async () => {
                        const res = await deleteRule(r.id);
                        if (!res.ok) toast.error(res.error);
                        else toast.success("Regelen er slettet");
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
          </Card>
        )}
      </div>

      <Card className="h-fit p-5">
        <h3 className="font-semibold">Ny regel</h3>
        <p className="mt-1 text-sm text-ink-2">Egne regler slår alt annet – også AI og tidligere valg.</p>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <Field label="Beskrivelsen …" htmlFor="rule-type">
            <Select id="rule-type" value={matchType} onChange={(e) => setMatchType(e.target.value as typeof matchType)}>
              <option value="contains">inneholder</option>
              <option value="starts_with">starter med</option>
              <option value="equals">er lik</option>
            </Select>
          </Field>
          <Field label="Tekst" htmlFor="rule-pattern" hint="F.eks. rema 1000 (store/små bokstaver spiller ingen rolle)">
            <Input id="rule-pattern" value={pattern} onChange={(e) => setPattern(e.target.value)} required minLength={2} maxLength={80} placeholder="rema 1000" />
          </Field>
          <Field label="Gjelder" htmlFor="rule-dir">
            <Select id="rule-dir" value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)}>
              <option value="any">Penger inn og ut</option>
              <option value="out">Kun utgifter</option>
              <option value="in">Kun inntekter</option>
            </Select>
          </Field>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <Checkbox checked={transfer} onCheckedChange={(v) => setTransfer(v === true)} />
            Marker som overføring mellom egne kontoer
          </label>
          {!transfer && (
            <Field label="Kategori" htmlFor="rule-cat">
              <CategorySelect id="rule-cat" categories={categories} subcategories={subcategories} value={category} onChange={setCategory} emptyLabel="Velg kategori …" />
            </Field>
          )}
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-2">
            <Checkbox checked={applyExisting} onCheckedChange={(v) => setApplyExisting(v === true)} />
            Bruk også på eksisterende, ikke-godkjente transaksjoner
          </label>
          {error && (
            <p role="alert" className="rounded-ctl bg-neg-soft px-3.5 py-2.5 text-sm text-neg">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" loading={pending}>
            <Plus /> Lagre regel
          </Button>
        </form>
      </Card>
    </div>
  );
}

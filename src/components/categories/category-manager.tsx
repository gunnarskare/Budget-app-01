"use client";

import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createCategory, createSubcategory, deleteCategory, deleteSubcategory, renameSubcategory, updateCategory } from "@/app/actions/categories";
import { setBudgetAmount } from "@/app/actions/budgets";
import { CategoryIcon } from "@/components/category-chip";
import { Icon, ICON_NAMES } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Meter } from "@/components/ui/progress";
import { COLOR_CHOICES } from "@/lib/categories/defaults";
import { themed } from "@/lib/colors";
import { formatMoney, formatPercent } from "@/lib/format";
import { monthStart } from "@/lib/dates";
import type { Category, Subcategory } from "@/lib/types";
import { cn, toggled } from "@/lib/utils";

export interface CategoryStat {
  categoryId: string;
  spent: number;
  share: number;
  count: number;
  planned: number | null;
  subs: Array<{ subcategoryId: string | null; amount: number; count: number }>;
}

export function CategoryManager({
  categories,
  subcategories,
  stats,
  currency,
  monthKey,
}: {
  categories: Category[];
  subcategories: Subcategory[];
  stats: Record<string, CategoryStat>;
  currency: string;
  monthKey: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const visible = categories.filter((c) => !c.archived_at);
  const toggle = (id: string) => setExpanded((s) => toggled(s, id));

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEditing("new")}>
          <Plus /> Ny kategori
        </Button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {visible.map((c) => {
          const st = stats[c.id];
          const subs = subcategories.filter((s) => s.category_id === c.id);
          const open = expanded.has(c.id);
          return (
            <Card key={c.id} className="overflow-hidden">
              <div className="flex items-center gap-3 p-4 sm:p-5">
                <CategoryIcon icon={c.icon} color={c.color} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold">{c.name}</h3>
                    {c.kind === "income" && <span className="rounded-full bg-pos-soft px-2 py-0.5 text-[11px] font-medium text-pos">Inntekt</span>}
                  </div>
                  <p className="text-sm text-ink-2">
                    {c.kind === "income" ? "Mottatt" : "Brukt"} <span className="font-medium tabular-nums text-ink">{formatMoney(st?.spent ?? 0, { currency })}</span>
                    {c.kind === "expense" && st && st.share > 0 && <span className="text-ink-3"> · {formatPercent(st.share)} av totalen</span>}
                  </p>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label={`Rediger ${c.name}`} onClick={() => setEditing(c)}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-expanded={open} aria-label={`${open ? "Skjul" : "Vis"} underkategorier for ${c.name}`} onClick={() => toggle(c.id)}>
                  <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
                </Button>
              </div>
              {c.kind === "expense" && <BudgetLimit category={c} stat={st} currency={currency} monthKey={monthKey} />}
              {open && (
                <SubcategoryList category={c} subs={subs} stat={st} currency={currency} />
              )}
            </Card>
          );
        })}
      </div>

      <CategoryDialog target={editing} onClose={() => setEditing(null)} onDelete={(c) => { setEditing(null); setDeleting(c); }} />
      <DeleteCategoryDialog category={deleting} categories={visible} count={deleting ? (stats[deleting.id]?.count ?? 0) : 0} onClose={() => setDeleting(null)} />
    </>
  );
}

function BudgetLimit({ category, stat, currency, monthKey }: { category: Category; stat?: CategoryStat; currency: string; monthKey: string }) {
  const [value, setValue] = useState(stat?.planned ? String(stat.planned) : "");
  const [pending, start] = useTransition();
  const planned = stat?.planned ?? 0;
  const spent = Math.max(0, stat?.spent ?? 0);

  function save() {
    const n = Number(value.replace(/\s/g, "").replace(",", "."));
    if (value.trim() !== "" && (!Number.isFinite(n) || n < 0)) return void toast.error("Skriv et gyldig beløp");
    const amount = value.trim() === "" ? 0 : Math.round(n);
    if (amount === planned) return;
    start(async () => {
      const res = await setBudgetAmount({ periodType: "month", periodStart: monthStart(monthKey), categoryId: category.id, amount });
      if (!res.ok) toast.error(res.error);
      else toast.success(amount === 0 ? "Budsjettgrensen er fjernet" : "Budsjettgrensen er lagret");
    });
  }

  return (
    <div className="border-t border-line/70 bg-surface-2/40 px-4 py-3 sm:px-5">
      <div className="flex items-center gap-3">
        <label htmlFor={`limit-${category.id}`} className="text-[13px] text-ink-2">
          Budsjettgrense / mnd
        </label>
        <Input
          id={`limit-${category.id}`}
          inputMode="numeric"
          placeholder="Ikke satt"
          className="ml-auto h-8 w-28 text-right text-[13px]"
          value={value}
          disabled={pending}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        />
      </div>
      {planned > 0 && (
        <div className="mt-2.5">
          <Meter value={spent / planned} tone={spent > planned ? "over" : spent / planned >= 0.85 ? "warn" : "ok"} label={`${category.name}: ${formatMoney(spent, { currency })} av ${formatMoney(planned, { currency })}`} height={6} />
          <p className="mt-1 text-xs text-ink-3">
            {spent > planned ? `Overskredet med ${formatMoney(spent - planned, { currency })}` : `${formatMoney(planned - spent, { currency })} gjenstår`}
          </p>
        </div>
      )}
    </div>
  );
}

function SubcategoryList({ category, subs, stat, currency }: { category: Category; subs: Subcategory[]; stat?: CategoryStat; currency: string }) {
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [pending, start] = useTransition();
  const spentBy = new Map((stat?.subs ?? []).map((s) => [s.subcategoryId, s.amount]));

  function add(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await createSubcategory({ categoryId: category.id, name });
      if (!res.ok) return void toast.error(res.error);
      setName("");
    });
  }

  return (
    <div className="border-t border-line/70 px-4 py-3 sm:px-5">
      <ul className="divide-y divide-line/60">
        {subs.map((s) => (
          <li key={s.id} className="flex items-center gap-2 py-2">
            {renaming?.id === s.id ? (
              <form
                className="flex flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  start(async () => {
                    const res = await renameSubcategory(s.id, renaming.name);
                    if (!res.ok) return void toast.error(res.error);
                    setRenaming(null);
                  });
                }}
              >
                <Input autoFocus value={renaming.name} onChange={(e) => setRenaming({ id: s.id, name: e.target.value })} className="h-8" aria-label="Nytt navn" maxLength={60} />
                <Button size="sm" type="submit" loading={pending}>
                  Lagre
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                  Avbryt
                </Button>
              </form>
            ) : (
              <>
                <span className="flex-1 text-sm">
                  {s.name}
                  {s.is_saving && <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] text-primary-soft-ink">Sparing</span>}
                </span>
                <span className="text-sm tabular-nums text-ink-2">{formatMoney(spentBy.get(s.id) ?? 0, { currency })}</span>
                <Button variant="ghost" size="icon-sm" aria-label={`Gi ${s.name} nytt navn`} onClick={() => setRenaming({ id: s.id, name: s.name })}>
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Slett ${s.name}`}
                  onClick={() =>
                    start(async () => {
                      const res = await deleteSubcategory(s.id);
                      if (!res.ok) toast.error(res.error);
                      else toast.success(`«${s.name}» er slettet. Transaksjonene beholder hovedkategorien.`);
                    })
                  }
                >
                  <Trash2 />
                </Button>
              </>
            )}
          </li>
        ))}
        {(spentBy.get(null) ?? 0) !== 0 && (
          <li className="flex items-center gap-2 py-2 text-sm text-ink-2">
            <span className="flex-1">Uten underkategori</span>
            <span className="tabular-nums">{formatMoney(spentBy.get(null) ?? 0, { currency })}</span>
          </li>
        )}
      </ul>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ny underkategori …" aria-label={`Ny underkategori i ${category.name}`} className="h-9" maxLength={60} required />
        <Button type="submit" variant="soft" size="md" loading={pending}>
          <Plus /> Legg til
        </Button>
      </form>
    </div>
  );
}

function CategoryDialog({ target, onClose, onDelete }: { target: Category | "new" | null; onClose: () => void; onDelete: (c: Category) => void }) {
  const isNew = target === "new";
  const editing = target && target !== "new" ? target : null;
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("tag");
  const [color, setColor] = useState<string>(COLOR_CHOICES[6]);
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [seen, setSeen] = useState<unknown>(null);

  // Nullstill skjema når dialogen åpnes for et nytt mål
  if (target !== seen) {
    setSeen(target);
    setName(editing?.name ?? "");
    setIcon(editing?.icon ?? "tag");
    setColor(editing?.color ?? COLOR_CHOICES[6]);
    setKind(editing?.kind ?? "expense");
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = editing ? await updateCategory(editing.id, { name, icon, color, kind }) : await createCategory({ name, icon, color, kind });
      if (!res.ok) return setError(res.error);
      toast.success(editing ? "Kategorien er oppdatert" : "Kategorien er opprettet");
      onClose();
    });
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={isNew ? "Ny kategori" : "Rediger kategori"} description="Velg navn, ikon og farge.">
        <form onSubmit={submit} className="mt-2 space-y-5">
          <Field label="Navn" htmlFor="cat-name">
            <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoFocus />
          </Field>
          <Field label="Type" htmlFor="cat-kind">
            <Select id="cat-kind" value={kind} onChange={(e) => setKind(e.target.value as "expense" | "income")}>
              <option value="expense">Utgift</option>
              <option value="income">Inntekt</option>
            </Select>
          </Field>
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Farge</span>
            <div role="radiogroup" aria-label="Farge" className="flex flex-wrap gap-2">
              {COLOR_CHOICES.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} onClick={() => setColor(c)} className={cn("size-8 rounded-full ring-offset-2 ring-offset-surface transition-all", color === c ? "scale-110 ring-2 ring-ink" : "hover:scale-110")} style={{ background: themed(c) }} />
              ))}
            </div>
          </div>
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Ikon</span>
            <div role="radiogroup" aria-label="Ikon" className="grid grid-cols-8 gap-1.5">
              {ICON_NAMES.map((n) => (
                <button key={n} type="button" role="radio" aria-checked={icon === n} aria-label={n} onClick={() => setIcon(n)} className={cn("grid size-9 place-items-center rounded-xl border transition-colors", icon === n ? "border-primary bg-primary-soft text-primary-soft-ink" : "border-line text-ink-2 hover:bg-surface-2")}>
                  <Icon name={n} className="size-[18px]" />
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3">
            <CategoryIcon icon={icon} color={color} />
            <span className="font-medium">{name || "Forhåndsvisning"}</span>
          </div>
          {error && (
            <p role="alert" className="rounded-ctl bg-neg-soft px-3.5 py-2.5 text-sm text-neg">
              {error}
            </p>
          )}
          <DialogFooter className="sm:justify-between">
            {editing ? (
              <Button variant="ghost" onClick={() => onDelete(editing)}>
                <Trash2 /> Slett
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="ghost" onClick={onClose}>
                Avbryt
              </Button>
              <Button type="submit" loading={pending}>
                Lagre
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteCategoryDialog({ category, categories, count, onClose }: { category: Category | null; categories: Category[]; count: number; onClose: () => void }) {
  const [target, setTarget] = useState("");
  const [pending, start] = useTransition();
  const others = categories.filter((c) => c.id !== category?.id && c.kind === category?.kind);

  if (!category) return null;
  const needsTarget = count > 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Slette «${category.name}»?`} description={needsTarget ? `${count} transaksjoner bruker denne kategorien. Velg hvor de skal flyttes – de havner i «Til godkjenning».` : "Kategorien er ikke i bruk. Regler og budsjettlinjer for den slettes også."}>
        {needsTarget && (
          <Field label="Flytt transaksjonene til" htmlFor="del-target">
            <Select id="del-target" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Velg kategori …</option>
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Avbryt
          </Button>
          <Button
            variant="destructive"
            disabled={needsTarget && !target}
            loading={pending}
            onClick={() =>
              start(async () => {
                const res = await deleteCategory(category.id, needsTarget ? target : null);
                if (!res.ok) return void toast.error(res.error);
                toast.success("Kategorien er slettet");
                onClose();
              })
            }
          >
            Slett kategori
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { CalendarClock, PartyPopper, Pencil, Plus, PiggyBank, Trash2, TrendingUp } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addContribution, createGoal, deleteGoal, updateGoal } from "@/app/actions/goals";
import { Icon, ICON_NAMES } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { celebrate } from "@/lib/confetti";
import { COLOR_CHOICES } from "@/lib/categories/defaults";
import { themed } from "@/lib/colors";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import type { GoalProgress } from "@/lib/finance/goals";
import type { SavingsGoal } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface GoalView {
  goal: SavingsGoal;
  progress: GoalProgress;
}

const toNum = (s: string) => {
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};

function Ring({ ratio, color, children }: { ratio: number; color: string; children: React.ReactNode }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-28 shrink-0">
      <svg viewBox="0 0 108 108" className="-rotate-90" role="img" aria-label={`${Math.round(ratio * 100)} prosent`}>
        <circle cx="54" cy="54" r={r} fill="none" stroke="var(--line)" strokeWidth="10" />
        <circle
          cx="54"
          cy="54"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, ratio))}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.2,0.7,0.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

export function GoalsView({ goals, currency }: { goals: GoalView[]; currency: string }) {
  const [form, setForm] = useState<SavingsGoal | "new" | null>(null);
  const [adding, setAdding] = useState<SavingsGoal | null>(null);
  const [deleting, setDeleting] = useState<SavingsGoal | null>(null);

  const total = goals.reduce((n, g) => n + g.goal.current_amount, 0);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">
          {goals.length > 0 ? (
            <>
              Totalt spart: <strong className="text-ink tabular-nums">{formatMoney(total, { currency })}</strong>
            </>
          ) : (
            "Sett deg et mål og følg med på fremgangen."
          )}
        </p>
        <Button onClick={() => setForm("new")}>
          <Plus /> Nytt sparemål
        </Button>
      </div>

      {goals.length === 0 ? (
        <Card>
          <EmptyState icon={<PiggyBank />} title="Ingen sparemål ennå" description="Bufferkonto, ferie, ny bil eller bolig – opprett et mål, sett et månedlig beløp, så regner vi ut når du er i mål.">
            <Button onClick={() => setForm("new")}>
              <Plus /> Lag ditt første mål
            </Button>
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {goals.map(({ goal: g, progress: p }, i) => {
            const done = p.status === "done";
            return (
              <Card key={g.id} className="animate-fade-up p-5" style={{ animationDelay: `${i * 70}ms` }}>
                <div className="flex items-start gap-4">
                  <Ring ratio={p.ratio} color={themed(g.color)}>
                    <span className="grid place-items-center text-center">
                      <span className="grid size-8 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${themed(g.color)} 16%, var(--surface))`, color: themed(g.color) }}>
                        <Icon name={g.icon} className="size-[18px]" />
                      </span>
                      <span className="num-display mt-0.5 text-sm">{formatPercent(p.ratio)}</span>
                    </span>
                  </Ring>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="truncate font-semibold">{g.name}</h3>
                      <div className="-mr-2 -mt-1 flex">
                        <Button variant="ghost" size="icon-sm" aria-label={`Rediger ${g.name}`} onClick={() => setForm(g)}>
                          <Pencil />
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label={`Slett ${g.name}`} onClick={() => setDeleting(g)}>
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                    <p className="num-display text-2xl">{formatMoney(g.current_amount, { currency })}</p>
                    <p className="text-sm text-ink-2">av {formatMoney(g.target_amount, { currency })}</p>
                    <div className="mt-2">
                      {done ? (
                        <Badge tone="pos">
                          <PartyPopper className="size-3" aria-hidden="true" /> Målet er nådd!
                        </Badge>
                      ) : p.status === "on_track" ? (
                        <Badge tone="pos">
                          <TrendingUp className="size-3" aria-hidden="true" /> På rett spor
                        </Badge>
                      ) : p.status === "behind" ? (
                        <Badge tone="warn">Henger etter planen</Badge>
                      ) : (
                        <Badge>Ingen sparplan</Badge>
                      )}
                    </div>
                  </div>
                </div>

                <dl className="mt-4 space-y-1.5 border-t border-line/70 pt-4 text-sm">
                  {!done && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-2">Gjenstår</dt>
                      <dd className="font-medium tabular-nums">{formatMoney(p.remaining, { currency })}</dd>
                    </div>
                  )}
                  {g.monthly_contribution > 0 && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-2">Sparer per måned</dt>
                      <dd className="font-medium tabular-nums">{formatMoney(g.monthly_contribution, { currency })}</dd>
                    </div>
                  )}
                  {!done && p.estimatedDate && (
                    <div className="flex justify-between gap-3">
                      <dt className="flex items-center gap-1.5 text-ink-2">
                        <CalendarClock className="size-3.5" aria-hidden="true" /> Estimert i mål
                      </dt>
                      <dd className="font-medium">{formatDate(p.estimatedDate)}</dd>
                    </div>
                  )}
                  {g.target_date && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-2">Måldato</dt>
                      <dd className="font-medium">{formatDate(g.target_date)}</dd>
                    </div>
                  )}
                  {!done && p.status === "behind" && p.requiredMonthly != null && (
                    <p className="rounded-xl bg-warn-soft px-3 py-2 text-xs text-warn">For å nå måldatoen må du spare omtrent {formatMoney(p.requiredMonthly, { currency })} i måneden.</p>
                  )}
                </dl>

                <Button className="mt-4 w-full" variant={done ? "secondary" : "soft"} onClick={() => setAdding(g)}>
                  <Plus /> Legg til penger
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <GoalForm target={form} currency={currency} onClose={() => setForm(null)} />
      <AddMoneyDialog goal={adding} currency={currency} onClose={() => setAdding(null)} />
      <DeleteDialog goal={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}

function GoalForm({ target, currency, onClose }: { target: SavingsGoal | "new" | null; currency: string; onClose: () => void }) {
  const editing = target && target !== "new" ? target : null;
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("piggy-bank");
  const [color, setColor] = useState<string>(COLOR_CHOICES[0]);
  const [targetAmount, setTargetAmount] = useState("");
  const [current, setCurrent] = useState("");
  const [date, setDate] = useState("");
  const [monthly, setMonthly] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [seen, setSeen] = useState<unknown>(null);

  if (target !== seen) {
    setSeen(target);
    setName(editing?.name ?? "");
    setIcon(editing?.icon ?? "piggy-bank");
    setColor(editing?.color ?? COLOR_CHOICES[0]);
    setTargetAmount(editing ? String(editing.target_amount) : "");
    setCurrent(editing ? String(editing.current_amount) : "");
    setDate(editing?.target_date ?? "");
    setMonthly(editing ? String(editing.monthly_contribution) : "");
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = toNum(targetAmount);
    if (t === null || t <= 0) return setError("Skriv inn en målsum større enn 0.");
    const payload = { name, icon, color, targetAmount: t, currentAmount: toNum(current) ?? 0, targetDate: date || null, monthlyContribution: toNum(monthly) ?? 0 };
    setError(null);
    start(async () => {
      const res = editing ? await updateGoal(editing.id, payload) : await createGoal(payload);
      if (!res.ok) return setError(res.error);
      toast.success(editing ? "Sparemålet er oppdatert" : "Sparemålet er opprettet");
      onClose();
    });
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={editing ? "Rediger sparemål" : "Nytt sparemål"} description="Hva sparer du til?">
        <form onSubmit={submit} className="mt-2 space-y-4">
          <Field label="Navn" htmlFor="g-name">
            <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="F.eks. Ferie, Bufferkonto, Ny bil" required maxLength={80} autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Målsum (${currency === "NOK" ? "kr" : currency})`} htmlFor="g-target">
              <Input id="g-target" inputMode="decimal" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} required placeholder="50 000" />
            </Field>
            <Field label="Spart så langt" htmlFor="g-current">
              <Input id="g-current" inputMode="decimal" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="0" />
            </Field>
            <Field label="Sparer per måned" htmlFor="g-monthly">
              <Input id="g-monthly" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="2 500" />
            </Field>
            <Field label="Måldato (valgfri)" htmlFor="g-date">
              <Input id="g-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
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
          {error && (
            <p role="alert" className="rounded-ctl bg-neg-soft px-3.5 py-2.5 text-sm text-neg">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>
              Avbryt
            </Button>
            <Button type="submit" loading={pending}>
              Lagre
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddMoneyDialog({ goal, currency, onClose }: { goal: SavingsGoal | null; currency: string; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [seen, setSeen] = useState<unknown>(null);
  if (goal !== seen) {
    setSeen(goal);
    setAmount("");
    setError(null);
  }
  if (!goal) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = toNum(amount);
    if (n === null || n === 0) return setError("Skriv inn et beløp.");
    setError(null);
    start(async () => {
      const res = await addContribution({ goalId: goal!.id, amount: n });
      if (!res.ok) return setError(res.error);
      if (res.milestone === 100) {
        toast.success(`🎉 Du nådde målet «${goal!.name}»!`);
        void celebrate("big");
      } else if (res.milestone) {
        toast.success(`Fantastisk! ${res.milestone} % av «${goal!.name}» er spart`);
        void celebrate("small");
      } else toast.success(n > 0 ? "Penger lagt til" : "Beløpet er trukket fra");
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Legg til penger – ${goal.name}`} description={`Nå: ${formatMoney(goal.current_amount, { currency })} av ${formatMoney(goal.target_amount, { currency })}`}>
        <form onSubmit={submit} className="mt-2 space-y-4">
          <div className="flex flex-wrap gap-2">
            {[500, 1000, 2500, 5000].map((v) => (
              <Button key={v} type="button" variant="soft" size="sm" onClick={() => setAmount(String(v))}>
                + {formatMoney(v, { currency })}
              </Button>
            ))}
          </div>
          <Field label="Beløp" htmlFor="am-amount" hint="Bruk minus for å ta ut penger.">
            <Input id="am-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus required />
          </Field>
          {error && (
            <p role="alert" className="rounded-ctl bg-neg-soft px-3.5 py-2.5 text-sm text-neg">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>
              Avbryt
            </Button>
            <Button type="submit" loading={pending}>
              Lagre
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ goal, onClose }: { goal: SavingsGoal | null; onClose: () => void }) {
  const [pending, start] = useTransition();
  if (!goal) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Slette «${goal.name}»?`} description="Sparemålet og innskuddshistorikken fjernes. Dette kan ikke angres.">
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Behold
          </Button>
          <Button
            variant="destructive"
            loading={pending}
            onClick={() =>
              start(async () => {
                const res = await deleteGoal(goal.id);
                if (!res.ok) return void toast.error(res.error);
                toast.success("Sparemålet er slettet");
                onClose();
              })
            }
          >
            Slett
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

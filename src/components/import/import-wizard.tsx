"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { commitImport, previewImport } from "@/app/actions/import";
import { createAccount } from "@/app/actions/settings";
import { detectMapping, type ColumnMapping, type Detection } from "@/lib/csv/columns";
import { normalizeRows } from "@/lib/csv/normalize";
import { ImportError, parseCsvBuffer, validateFileMeta, type ParsedCsv } from "@/lib/csv/parse";
import { payloadTooLarge, TOO_LARGE_MESSAGE, type CommitResult } from "@/lib/import/types";
import type { Account, AccountKind, Category, Subcategory } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CategorizeStep } from "./categorize-step";
import { CheckStep } from "./check-step";
import { DoneStep } from "./done-step";
import type { ReviewRow } from "./types";
import { UploadStep } from "./upload-step";

type Step = "upload" | "check" | "categorize" | "done";
const STEPS: Array<{ id: Step; label: string }> = [
  { id: "upload", label: "Last opp" },
  { id: "check", label: "Kontroller" },
  { id: "categorize", label: "Kategoriser" },
  { id: "done", label: "Ferdig" },
];

function Stepper({ step }: { step: Step }) {
  const current = STEPS.findIndex((s) => s.id === step);
  return (
    <ol className="mb-6 flex items-center gap-2 sm:mb-8" aria-label="Fremdrift">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.id} className="flex flex-1 items-center gap-2" aria-current={active ? "step" : undefined}>
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors",
                done ? "bg-pos-fill text-white" : active ? "bg-primary text-primary-ink" : "bg-surface-2 text-ink-3",
              )}
            >
              {done ? <Check className="size-4" strokeWidth={3} aria-label="Fullført" /> : i + 1}
            </span>
            <span className={cn("hidden text-sm font-medium sm:inline", active ? "text-ink" : "text-ink-3")}>{s.label}</span>
            {i < STEPS.length - 1 && <span aria-hidden="true" className={cn("h-0.5 flex-1 rounded-full", done ? "bg-pos-fill" : "bg-line")} />}
          </li>
        );
      })}
    </ol>
  );
}

/** Importveiviser: last opp → kontroller kolonner → kategoriser → importer. */
export function ImportWizard({
  accounts: initialAccounts,
  categories,
  subcategories,
  currency,
  onFinish,
  finishLabel,
}: {
  accounts: Account[];
  categories: Category[];
  subcategories: Subcategory[];
  currency: string;
  /** Brukes i oppstarten: erstatter «Se oversikten» */
  onFinish?: () => void;
  finishLabel?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [step, setStep] = useState<Step>("upload");
  const [accounts, setAccounts] = useState(initialAccounts);
  const [accountId, setAccountId] = useState(() => (initialAccounts.find((a) => a.kind === "checking" && !a.archived_at) ?? initialAccounts.find((a) => !a.archived_at))?.id ?? "");
  const [filename, setFilename] = useState("");
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [detection, setDetection] = useState<Detection | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [ai, setAi] = useState({ used: false, available: false, note: null as string | null });
  const [learn, setLearn] = useState(true);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const account = accounts.find((a) => a.id === accountId);
  const norm = useMemo(
    () => (parsed && mapping ? normalizeRows(parsed, mapping, { defaultCurrency: account?.currency ?? currency }) : null),
    [parsed, mapping, account?.currency, currency],
  );

  function reset() {
    setStep("upload");
    setParsed(null);
    setDetection(null);
    setMapping(null);
    setRows([]);
    setResult(null);
    setError(null);
    setFilename("");
  }

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      validateFileMeta(file.name, file.size);
      const buf = await file.arrayBuffer();
      const p = parseCsvBuffer(buf);
      const det = detectMapping(p.headers, p.rows.map((r) => r.cells));
      setParsed(p);
      setDetection(det);
      setMapping(det.mapping);
      setFilename(file.name);
      setStep("check");
    } catch (e) {
      setError(e instanceof ImportError ? e.message : "Kunne ikke lese filen. Kontroller at den er en CSV-fil eksportert fra nettbanken.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateAccount(name: string, kind: AccountKind): Promise<string | null> {
    const res = await createAccount({ name, kind, openingBalance: 0 });
    if (!res.ok) return null;
    const acc: Account = { id: res.id, name, bank: null, account_number_last4: null, kind, currency, opening_balance: 0, is_demo: false, archived_at: null };
    setAccounts((a) => [...a, acc]);
    setAccountId(res.id);
    return res.id;
  }

  function toCategorize() {
    if (!norm || !accountId) return;
    const payload = {
      accountId,
      rows: norm.rows.map((r) => ({ line: r.line, date: r.date, description: r.description, amount: r.amount, currency: r.currency, balance: r.balance, bankType: r.bankType })),
    };
    if (payloadTooLarge(payload)) return setError(TOO_LARGE_MESSAGE);
    setError(null);
    setBusy(true);
    startTransition(async () => {
      const res = await previewImport(payload);
      setBusy(false);
      if (!res.ok) return setError(res.error);
      const p = res.preview;
      setAi({ used: p.aiUsed, available: p.aiAvailable, note: p.aiNote });
      setRows(
        norm.rows.map((r, i) => {
          const pr = p.rows[i];
          return {
            index: i,
            line: r.line,
            date: r.date,
            description: r.description,
            amount: r.amount,
            currency: r.currency,
            balance: r.balance,
            bankType: r.bankType,
            raw: r.raw,
            display: pr.display,
            merchantKey: pr.merchantKey,
            reason: pr.reason,
            isSubscription: pr.isSubscription,
            isRefund: pr.isRefund,
            duplicate: pr.duplicate,
            categoryId: pr.categoryId,
            subcategoryId: pr.subcategoryId,
            transfer: pr.transfer,
            source: pr.source,
            confidence: pr.confidence,
            approved: false,
            include: pr.duplicate !== "exact",
            edited: false,
          } satisfies ReviewRow;
        }),
      );
      setStep("categorize");
    });
  }

  function commit() {
    if (!norm || !accountId) return;
    const learned = new Map<string, { merchantKey: string; categoryId: string; subcategoryId: string | null }>();
    if (learn) {
      for (const r of rows) {
        if (r.edited && r.categoryId && r.merchantKey.length >= 3) learned.set(r.merchantKey, { merchantKey: r.merchantKey, categoryId: r.categoryId, subcategoryId: r.subcategoryId });
      }
    }
    const payload = {
      accountId,
      filename,
      bankProfile: detection?.bank ?? null,
      mapping: mapping as unknown as Record<string, unknown>,
      skippedRows: norm.skipped,
      rows: rows.map((r) => ({
        line: r.line, date: r.date, description: r.description, amount: r.amount, currency: r.currency, balance: r.balance, bankType: r.bankType,
        // Rader som hoppes over trenger ikke originalraden – sparer plass i forespørselen
        raw: r.include ? r.raw : {},
        categoryId: r.categoryId, subcategoryId: r.subcategoryId, transfer: r.transfer, source: r.source,
        confidence: r.confidence, approved: r.approved, include: r.include, duplicate: r.duplicate,
      })),
      learn: [...learned.values()],
    };
    if (payloadTooLarge(payload)) return setError(TOO_LARGE_MESSAGE);
    setError(null);
    setBusy(true);
    startTransition(async () => {
      const res = await commitImport(payload);
      setBusy(false);
      if (!res.ok) return setError(res.error);
      setResult(res.result);
      setStep("done");
      router.refresh();
    });
  }

  return (
    <div>
      <Stepper step={step} />
      {step === "upload" && (
        <UploadStep accounts={accounts} accountId={accountId} onAccountChange={setAccountId} onFile={handleFile} onCreateAccount={handleCreateAccount} error={error} busy={busy} />
      )}
      {step === "check" && parsed && detection && mapping && norm && (
        <CheckStep filename={filename} parsed={parsed} detection={detection} mapping={mapping} onMappingChange={setMapping} norm={norm} onBack={reset} onContinue={toCategorize} busy={busy} error={error} />
      )}
      {step === "categorize" && (
        <CategorizeStep
          rows={rows}
          setRows={(u) => setRows(u)}
          categories={categories}
          subcategories={subcategories}
          ai={ai}
          learn={learn}
          onLearnChange={setLearn}
          onBack={() => setStep("check")}
          onCommit={commit}
          committing={busy}
          error={error}
          currency={account?.currency ?? currency}
        />
      )}
      {step === "done" && result && <DoneStep result={result} onAnother={reset} onUndone={reset} onFinish={onFinish} finishLabel={finishLabel} />}
    </div>
  );
}

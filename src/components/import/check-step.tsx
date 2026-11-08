"use client";

import { AlertTriangle, CheckCircle2, ChevronDown, FileText, Settings2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { ColumnMapping, Detection } from "@/lib/csv/columns";
import type { ImportIssue, ImportRow, NormalizeResult } from "@/lib/csv/normalize";
import type { ParsedCsv } from "@/lib/csv/parse";
import { formatDate, formatMoney, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

const DELIM_NAME: Record<string, string> = { ";": "semikolon", ",": "komma", "\t": "tabulator", "|": "loddrett strek" };

function ColSelect({
  id,
  label,
  headers,
  value,
  onChange,
  optional,
}: {
  id: string;
  label: string;
  headers: string[];
  value: number | null;
  onChange: (v: number | null) => void;
  optional?: boolean;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <Select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}>
        <option value="">{optional ? "– ingen –" : "– velg kolonne –"}</option>
        {headers.map((h, i) => (
          <option key={i} value={i}>
            {h || `Kolonne ${i + 1}`}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function CheckStep({
  filename,
  parsed,
  detection,
  mapping,
  onMappingChange,
  norm,
  onBack,
  onContinue,
  busy,
  error,
}: {
  filename: string;
  parsed: ParsedCsv;
  detection: Detection;
  mapping: ColumnMapping;
  onMappingChange: (m: ColumnMapping) => void;
  norm: NormalizeResult;
  onBack: () => void;
  onContinue: () => void;
  busy: boolean;
  error: string | null;
}) {
  const [showMapping, setShowMapping] = useState(!detection.complete);
  const [showIssues, setShowIssues] = useState(false);
  const set = (patch: Partial<ColumnMapping>) => onMappingChange({ ...mapping, ...patch });
  const usesSplit = mapping.amountCol == null && (mapping.inCol != null || mapping.outCol != null);
  const errors = norm.issues.filter((i) => i.severity === "error");
  const infos = norm.issues.filter((i) => i.severity !== "error");
  const fatal = norm.rows.length === 0;
  const dates = norm.rows.map((r) => r.date).sort();

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center gap-4 p-5">
        <span aria-hidden="true" className="grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary-soft-ink">
          <FileText className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{filename}</p>
          <p className="text-sm text-ink-2">
            {plural(parsed.rows.length, "rad", "rader")} · skilletegn: {DELIM_NAME[parsed.delimiter] ?? parsed.delimiter} · tegnsett: {parsed.encoding === "utf-8" ? "UTF-8" : "Windows-1252"}
          </p>
        </div>
        {detection.bank ? (
          <Badge tone="pos" className="px-3 py-1 text-[13px]">
            <CheckCircle2 className="size-3.5" aria-hidden="true" /> Gjenkjent: {detection.bank}
          </Badge>
        ) : detection.complete ? (
          <Badge tone="primary" className="px-3 py-1 text-[13px]">
            <CheckCircle2 className="size-3.5" aria-hidden="true" /> Standard CSV-format
          </Badge>
        ) : (
          <Badge tone="warn" className="px-3 py-1 text-[13px]">
            <AlertTriangle className="size-3.5" aria-hidden="true" /> Ukjent format – velg kolonner
          </Badge>
        )}
      </Card>

      <Card className="overflow-hidden">
        <button
          type="button"
          onClick={() => setShowMapping((s) => !s)}
          aria-expanded={showMapping}
          className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-2/60 sm:px-6"
        >
          <Settings2 className="size-5 text-ink-3" aria-hidden="true" />
          <span className="flex-1">
            <span className="block font-semibold">Kolonner</span>
            <span className="block text-sm text-ink-2">
              {detection.complete ? "Vi har funnet dato, beskrivelse og beløp. Endre hvis noe ser feil ut." : `Mangler: ${detection.missing.join(", ")}. Velg kolonnene under.`}
            </span>
          </span>
          <ChevronDown className={cn("size-5 text-ink-3 transition-transform", showMapping && "rotate-180")} aria-hidden="true" />
        </button>
        {showMapping && (
          <div className="grid gap-4 border-t border-line px-5 py-5 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
            <ColSelect id="m-date" label="Dato" headers={parsed.headers} value={mapping.dateCol} onChange={(v) => set({ dateCol: v })} />
            <ColSelect
              id="m-desc"
              label="Beskrivelse / mottaker"
              headers={parsed.headers}
              value={mapping.descriptionCols[0] ?? null}
              onChange={(v) => set({ descriptionCols: [v, mapping.descriptionCols[1] ?? null].filter((x): x is number => x != null && x !== undefined) })}
            />
            <ColSelect
              id="m-desc2"
              label="Beskrivelse 2 (valgfri)"
              headers={parsed.headers}
              value={mapping.descriptionCols[1] ?? null}
              optional
              onChange={(v) => set({ descriptionCols: [mapping.descriptionCols[0] ?? null, v].filter((x): x is number => x != null) })}
            />
            <div className="sm:col-span-2 lg:col-span-3">
              <div role="radiogroup" aria-label="Hvordan står beløpet i filen?" className="mb-3 inline-flex rounded-ctl bg-surface-2 p-1">
                {[
                  { v: false, l: "Ett beløpsfelt" },
                  { v: true, l: "Inn og ut i hver sin kolonne" },
                ].map((o) => (
                  <button
                    key={String(o.v)}
                    type="button"
                    role="radio"
                    aria-checked={usesSplit === o.v}
                    onClick={() => (o.v ? set({ amountCol: null }) : set({ inCol: null, outCol: null }))}
                    className={cn("h-8 rounded-[9px] px-3.5 text-[13px] font-medium text-ink-2", usesSplit === o.v && "bg-surface text-ink shadow-sm")}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {usesSplit ? (
                  <>
                    <ColSelect id="m-in" label="Inn (penger inn)" headers={parsed.headers} value={mapping.inCol} onChange={(v) => set({ inCol: v })} optional />
                    <ColSelect id="m-out" label="Ut (penger ut)" headers={parsed.headers} value={mapping.outCol} onChange={(v) => set({ outCol: v })} optional />
                  </>
                ) : (
                  <ColSelect id="m-amount" label="Beløp" headers={parsed.headers} value={mapping.amountCol} onChange={(v) => set({ amountCol: v })} />
                )}
              </div>
            </div>
            <ColSelect id="m-cur" label="Valuta (valgfri)" headers={parsed.headers} value={mapping.currencyCol} onChange={(v) => set({ currencyCol: v })} optional />
            <ColSelect id="m-bal" label="Saldo (valgfri)" headers={parsed.headers} value={mapping.balanceCol} onChange={(v) => set({ balanceCol: v })} optional />
            <ColSelect id="m-status" label="Status (valgfri)" headers={parsed.headers} value={mapping.statusCol} onChange={(v) => set({ statusCol: v })} optional />
            <Field label="Datoformat" htmlFor="m-dfmt" hint={`Gjenkjent: ${norm.dateOrder === "dmy" ? "dag-måned-år" : norm.dateOrder === "ymd" ? "år-måned-dag" : "måned-dag-år"}`}>
              <Select id="m-dfmt" value={mapping.dateOrder} onChange={(e) => set({ dateOrder: e.target.value as ColumnMapping["dateOrder"] })}>
                <option value="auto">Automatisk</option>
                <option value="dmy">Dag-måned-år (31.12.2026)</option>
                <option value="ymd">År-måned-dag (2026-12-31)</option>
                <option value="mdy">Måned-dag-år (12/31/2026)</option>
              </Select>
            </Field>
            <Field label="Desimaltegn" htmlFor="m-dec" hint={`Gjenkjent: ${norm.decimal === "," ? "komma (1 234,56)" : "punktum (1,234.56)"}`}>
              <Select id="m-dec" value={mapping.decimal} onChange={(e) => set({ decimal: e.target.value as ColumnMapping["decimal"] })}>
                <option value="auto">Automatisk</option>
                <option value=",">Komma (1 234,56)</option>
                <option value=".">Punktum (1,234.56)</option>
              </Select>
            </Field>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-3 pt-5 sm:px-6">
          <div>
            <h3 className="font-semibold">Forhåndsvisning</h3>
            <p className="text-sm text-ink-2">
              {norm.rows.length > 0
                ? `${plural(norm.rows.length, "transaksjon", "transaksjoner")} klare${dates.length ? ` · ${formatDate(dates[0])} – ${formatDate(dates[dates.length - 1])}` : ""}`
                : "Ingen gyldige rader ennå."}
            </p>
          </div>
          {norm.skipped > 0 && (
            <button type="button" onClick={() => setShowIssues((s) => !s)} className="text-sm font-medium text-warn hover:underline" aria-expanded={showIssues}>
              {plural(norm.skipped, "rad hoppet over", "rader hoppet over")}
            </button>
          )}
        </div>
        <PreviewTable rows={norm.rows.slice(0, 8)} />
        {showIssues && <IssueList issues={[...errors, ...infos]} />}
      </Card>

      {error && (
        <p role="alert" className="rounded-ctl bg-neg-soft px-4 py-3 text-sm text-neg">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-between gap-3">
        <Button variant="ghost" onClick={onBack}>
          Velg en annen fil
        </Button>
        <Button size="lg" onClick={onContinue} disabled={fatal} loading={busy}>
          Fortsett til kategorisering
        </Button>
      </div>
    </div>
  );
}

function PreviewTable({ rows }: { rows: ImportRow[] }) {
  if (rows.length === 0) return <p className="px-6 pb-6 text-sm text-ink-2">Velg kolonnene over for å se en forhåndsvisning.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-sm">
        <thead>
          <tr className="border-y border-line bg-surface-2/60 text-left text-xs text-ink-3">
            <th className="px-5 py-2 font-medium sm:px-6">Dato</th>
            <th className="px-3 py-2 font-medium">Beskrivelse</th>
            <th className="px-5 py-2 text-right font-medium sm:px-6">Beløp</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.line} className="border-b border-line/60 last:border-0">
              <td className="whitespace-nowrap px-5 py-2.5 text-ink-2 sm:px-6">{formatDate(r.date)}</td>
              <td className="max-w-[22rem] truncate px-3 py-2.5">{r.description}</td>
              <td className={cn("whitespace-nowrap px-5 py-2.5 text-right font-medium tabular-nums sm:px-6", r.amount < 0 ? "text-neg" : "text-pos")}>{formatMoney(r.amount, { currency: r.currency, decimals: 2, signed: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IssueList({ issues }: { issues: ImportIssue[] }) {
  return (
    <ul className="max-h-60 overflow-auto border-t border-line px-5 py-3 text-sm sm:px-6" aria-label="Rader som ble hoppet over">
      {issues.slice(0, 100).map((i, idx) => (
        <li key={idx} className="flex gap-3 py-1">
          <span className="w-16 shrink-0 text-ink-3">{i.line ? `Rad ${i.line}` : "Fil"}</span>
          <span className={i.severity === "error" ? "text-neg" : i.severity === "warning" ? "text-warn" : "text-ink-2"}>{i.message}</span>
        </li>
      ))}
      {issues.length > 100 && <li className="py-1 text-ink-3">… og {issues.length - 100} til</li>}
    </ul>
  );
}

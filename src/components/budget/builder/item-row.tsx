"use client";

import { Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { CategoryIcon } from "@/components/category-chip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { draftMonthly, formatAmountText, parseAmountText, type DraftItem } from "@/lib/budget/draft";
import { FREQUENCY_OPTIONS } from "@/lib/finance/frequency";
import { formatMoney } from "@/lib/format";
import type { Frequency } from "@/lib/types";

export interface CategoryOption {
  id: string;
  name: string;
}

/** Én post: navn (eller forslagstekst), beløp og hvor ofte beløpet kommer. */
export function ItemRow({
  item,
  currency,
  categoryOptions,
  error,
  reference,
  leading,
  onChange,
  onRemove,
}: {
  item: DraftItem;
  currency: string;
  /** Kategorivalg for egne poster */
  categoryOptions?: CategoryOption[];
  error?: string;
  /** Hint om hva du vanligvis bruker, med knapp for å ta det i bruk */
  reference?: { text: string; onUse: () => void } | null;
  /** Ikon foran navnet (f.eks. kategoriikon) */
  leading?: ReactNode;
  onChange: (patch: Partial<DraftItem>) => void;
  onRemove?: () => void;
}) {
  const monthly = draftMonthly(item);
  const showMonthly = item.frequency !== "monthly" && monthly > 0;
  const label = item.name.trim() || "Ny post";

  return (
    <div className="py-3.5">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {leading}
          <div className="min-w-0 flex-1">
          {item.custom ? (
            <div className="flex flex-wrap gap-2">
              <Input
                aria-label="Navn på posten"
                placeholder="Navn, f.eks. Parkeringsplass"
                value={item.name}
                maxLength={80}
                onChange={(e) => onChange({ name: e.target.value })}
                className="h-9 min-w-40 flex-1"
              />
              {categoryOptions && categoryOptions.length > 0 && (
                <Select
                  aria-label={`Kategori for ${label}`}
                  className="h-9 w-full sm:w-48"
                  value={item.categoryId ?? ""}
                  onChange={(e) => onChange({ categoryId: e.target.value || null, subcategoryId: null })}
                >
                  <option value="">Velg kategori</option>
                  {categoryOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm font-medium">{item.name}</p>
              {item.hint && <p className="mt-0.5 text-xs text-ink-3">{item.hint}</p>}
            </>
          )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            aria-label={`${label}: beløp`}
            inputMode="decimal"
            placeholder="0"
            value={item.amount}
            aria-invalid={error ? true : undefined}
            onChange={(e) => onChange({ amount: e.target.value })}
            onBlur={() => {
              const n = parseAmountText(item.amount);
              if (n && n > 0 && formatAmountText(n) !== item.amount) onChange({ amount: formatAmountText(n) });
            }}
            className="h-9 w-28 text-right tabular-nums"
          />
          <Select aria-label={`${label}: hvor ofte`} className="h-9 w-32" value={item.frequency} onChange={(e) => onChange({ frequency: e.target.value as Frequency })}>
            {FREQUENCY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          {onRemove ? (
            <Button variant="ghost" size="icon-sm" aria-label={`Fjern ${label}`} onClick={onRemove}>
              <Trash2 />
            </Button>
          ) : (
            <span className="size-8 shrink-0 max-sm:hidden" aria-hidden="true" />
          )}
        </div>
      </div>
      {(error || reference || showMonthly) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:justify-end sm:pr-10">
          {error && (
            <span role="alert" className="text-neg">
              {error}
            </span>
          )}
          {reference && (
            <button type="button" onClick={reference.onUse} className="text-left text-accent hover:underline">
              {reference.text}
            </button>
          )}
          {showMonthly && <span className="text-ink-2">≈ {formatMoney(monthly, { currency })} per måned</span>}
        </div>
      )}
    </div>
  );
}

/** Kort med overskrift (kategori eller gruppe) og en sum per måned. */
export function SectionCard({
  title,
  icon,
  color,
  total,
  currency,
  children,
  footer,
}: {
  title: string;
  icon?: string;
  color?: string;
  total?: number;
  currency: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
        {icon && color && <CategoryIcon icon={icon} color={color} size="sm" />}
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h3>
        {total !== undefined && total > 0 && (
          <span className="text-sm font-semibold tabular-nums">
            {formatMoney(total, { currency })}
            <span className="font-normal text-ink-3"> /mnd</span>
          </span>
        )}
      </div>
      <div className="divide-y divide-line px-4 sm:px-5">{children}</div>
      {footer && <div className="border-t border-line bg-surface-2/50 px-4 py-2.5 sm:px-5">{footer}</div>}
    </Card>
  );
}

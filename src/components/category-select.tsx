"use client";

import * as React from "react";
import { Select } from "@/components/ui/input";
import type { Category, Subcategory } from "@/lib/types";

export interface CategoryValue {
  categoryId: string | null;
  subcategoryId: string | null;
}

export const TRANSFER_VALUE = "__transfer";

export function encodeCategory(v: CategoryValue): string {
  if (!v.categoryId) return "";
  return v.subcategoryId ? `${v.categoryId}:${v.subcategoryId}` : v.categoryId;
}

export function decodeCategory(s: string): CategoryValue {
  if (!s || s === TRANSFER_VALUE) return { categoryId: null, subcategoryId: null };
  const [categoryId, subcategoryId] = s.split(":");
  return { categoryId, subcategoryId: subcategoryId ?? null };
}

/**
 * Kategorivelger: hovedkategorier som grupper med underkategorier under.
 * Bruker native <select> – raskt, tilgjengelig og godt på mobil.
 */
export const CategorySelect = React.forwardRef<
  HTMLSelectElement,
  {
    categories: Category[];
    subcategories: Subcategory[];
    value: CategoryValue;
    onChange: (v: CategoryValue) => void;
    kind?: "expense" | "income" | "all";
    emptyLabel?: string;
    allowTransfer?: boolean;
    isTransfer?: boolean;
    onTransfer?: () => void;
    className?: string;
    id?: string;
    "aria-label"?: string;
    disabled?: boolean;
  }
>(function CategorySelect(
  { categories, subcategories, value, onChange, kind = "all", emptyLabel, allowTransfer, isTransfer, onTransfer, className, ...rest },
  ref,
) {
  const visible = categories.filter((c) => !c.archived_at && (kind === "all" || c.kind === kind || c.id === value.categoryId));
  const current = isTransfer ? TRANSFER_VALUE : encodeCategory(value);
  return (
    <Select
      ref={ref}
      className={className}
      value={current}
      onChange={(e) => {
        if (e.target.value === TRANSFER_VALUE) onTransfer?.();
        else onChange(decodeCategory(e.target.value));
      }}
      {...rest}
    >
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {allowTransfer && <option value={TRANSFER_VALUE}>↔ Intern overføring</option>}
      {visible.map((c) => {
        const subs = subcategories.filter((s) => s.category_id === c.id);
        return (
          <optgroup key={c.id} label={c.name}>
            <option value={c.id}>{c.name}</option>
            {subs.map((s) => (
              <option key={s.id} value={`${c.id}:${s.id}`}>
                {c.name} › {s.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </Select>
  );
});

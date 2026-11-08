"use client";

import { createContext, useCallback, useContext } from "react";
import { formatMoney, type MoneyOptions } from "@/lib/format";

const CurrencyContext = createContext("NOK");

/** Gir klientkomponenter brukerens valuta (fra profilen). */
export function CurrencyProvider({ currency, children }: { currency: string; children: React.ReactNode }) {
  return <CurrencyContext.Provider value={currency}>{children}</CurrencyContext.Provider>;
}

export const useCurrency = () => useContext(CurrencyContext);

/** Beløpsformaterer som bruker profilens valuta. */
export function useMoney() {
  const currency = useCurrency();
  return useCallback((value: number, opts: MoneyOptions = {}) => formatMoney(value, { currency, ...opts }), [currency]);
}

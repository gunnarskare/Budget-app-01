"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { TransactionFormDialog } from "@/components/transactions/transaction-form-dialog";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { Account, Category, Subcategory } from "@/lib/types";

export function NewTransactionButton({
  accounts,
  categories,
  subcategories,
  variant = "primary",
  label = "Ny",
  icon = <Plus />,
}: {
  accounts: Account[];
  categories: Category[];
  subcategories: Subcategory[];
  variant?: ButtonProps["variant"];
  label?: string;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {icon} {label}
      </Button>
      <TransactionFormDialog open={open} onOpenChange={setOpen} accounts={accounts} categories={categories} subcategories={subcategories} />
    </>
  );
}

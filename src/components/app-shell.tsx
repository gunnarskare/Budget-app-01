"use client";

import { ArrowLeftRight, LogOut, MoreHorizontal, PenLine, Plus, Search, Upload } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/app/actions/auth";
import { Logo, LogoMark } from "@/components/logo";
import { CurrencyProvider } from "@/lib/currency-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { TransactionFormDialog } from "@/components/transactions/transaction-form-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { NAV_ITEMS, isActive } from "@/lib/nav";
import type { Account, Category, Subcategory } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ShellUser {
  name: string | null;
  email: string;
}

const MOBILE_PRIMARY = ["/oversikt", "/transaksjoner", "/budsjett"] as const;
const MORE_ITEMS = NAV_ITEMS.filter((n) => !MOBILE_PRIMARY.includes(n.href as (typeof MOBILE_PRIMARY)[number]));

export function AppShell({
  user,
  reviewCount,
  accounts,
  categories,
  subcategories,
  currency,
  children,
}: {
  user: ShellUser;
  currency: string;
  reviewCount: number;
  accounts: Account[];
  categories: Category[];
  subcategories: Subcategory[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [txOpen, setTxOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const displayName = user.name || user.email.split("@")[0];
  const initial = displayName.charAt(0).toUpperCase();

  const navLink = (item: (typeof NAV_ITEMS)[number], variant: "side" | "bottom") => {
    const active = isActive(pathname, item.href);
    const Icon = item.icon;
    const badge = item.href === "/transaksjoner" && reviewCount > 0 ? reviewCount : 0;
    if (variant === "side") {
      return (
        <Link
          key={item.href}
          href={item.href}
          title={item.label}
          aria-current={active ? "page" : undefined}
          className={cn(
            "group relative flex h-11 items-center gap-3 rounded-xl px-3.5 text-[14px] font-medium transition-all md:justify-center lg:justify-start",
            active ? "bg-primary-soft text-primary-soft-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
          )}
        >
          <Icon className={cn("size-[19px] shrink-0 transition-transform group-hover:scale-110", active && "text-accent")} aria-hidden="true" />
          <span className="hidden lg:inline">{item.label}</span>
          {badge > 0 && (
            <span className="ml-auto hidden min-w-5 rounded-full bg-warn-fill px-1.5 text-center text-[11px] font-semibold leading-5 text-[#2b1b00] lg:inline-block" aria-label={`${badge} venter på godkjenning`}>
              {badge > 99 ? "99+" : badge}
            </span>
          )}
          {badge > 0 && <span className="absolute right-2.5 top-2 size-2 rounded-full bg-warn-fill lg:hidden" aria-hidden="true" />}
        </Link>
      );
    }
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn("relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors", active ? "text-accent" : "text-ink-3")}
      >
        <Icon className={cn("size-6 transition-transform", active && "scale-110")} strokeWidth={active ? 2.3 : 1.9} aria-hidden="true" />
        <span className="truncate">{item.label}</span>
        {badge > 0 && <span className="absolute right-[calc(50%-18px)] top-1.5 size-2.5 rounded-full bg-warn-fill ring-2 ring-surface" aria-label={`${badge} venter på godkjenning`} />}
      </Link>
    );
  };

  return (
    <CurrencyProvider currency={currency}>
    <div className="min-h-dvh">
      {/* ---------- sidefelt (nettbrett/desktop) ---------- */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-20 flex-col border-r border-line bg-surface md:flex lg:w-64">
        <div className="flex h-16 items-center px-5 md:justify-center lg:justify-start">
          <Link href="/oversikt" aria-label="Pengeflyt – til oversikten">
            <Logo className="[&>span:last-child]:hidden lg:[&>span:last-child]:inline" />
          </Link>
        </div>
        <nav aria-label="Hovedmeny" className="flex-1 space-y-1 px-3 py-2">
          {NAV_ITEMS.map((item) => navLink(item, "side"))}
        </nav>
        <div className="border-t border-line p-3">
          <div className="flex items-center gap-3 rounded-xl p-2 md:justify-center lg:justify-start">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary-soft-ink" aria-hidden="true">
              {initial}
            </span>
            <div className="hidden min-w-0 flex-1 lg:block">
              <p className="truncate text-sm font-medium">{displayName}</p>
              <p className="truncate text-xs text-ink-3">{user.email}</p>
            </div>
            <form action={signOut} className="hidden lg:block">
              <Button type="submit" variant="ghost" size="icon-sm" aria-label="Logg ut" title="Logg ut">
                <LogOut />
              </Button>
            </form>
          </div>
          <form action={signOut} className="mt-1 lg:hidden">
            <Button type="submit" variant="ghost" size="sm" className="w-full" aria-label="Logg ut" title="Logg ut">
              <LogOut />
            </Button>
          </form>
        </div>
      </aside>

      <div className="md:pl-20 lg:pl-64">
        {/* ---------- topplinje ---------- */}
        <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-3 px-4 md:h-16 md:px-8">
            <Link href="/oversikt" className="md:hidden" aria-label="Pengeflyt">
              <LogoMark className="size-8" />
            </Link>
            <form action="/transaksjoner" method="get" role="search" className="relative min-w-0 flex-1 md:max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
              <input
                name="q"
                type="search"
                aria-label="Søk i transaksjoner"
                placeholder="Søk i transaksjoner …"
                className="h-10 w-full rounded-full border border-line bg-surface pl-10 pr-4 text-sm placeholder:text-ink-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </form>
            <div className="ml-auto hidden items-center gap-2 md:flex">
              <Button asChild variant="secondary" size="md">
                <Link href="/transaksjoner/import">
                  <Upload /> Importer CSV
                </Link>
              </Button>
              <Button onClick={() => setTxOpen(true)}>
                <Plus /> Ny transaksjon
              </Button>
            </div>
          </div>
        </header>

        <main id="innhold" className="mx-auto max-w-[1200px] px-4 pb-32 pt-5 md:px-8 md:pb-14 md:pt-8">
          {children}
        </main>
      </div>

      {/* ---------- fast bunnmeny (mobil) ---------- */}
      <nav aria-label="Hovedmeny" className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md md:hidden">
        <div className="mx-auto flex max-w-md items-stretch px-2">
          {navLink(NAV_ITEMS[0], "bottom")}
          {navLink(NAV_ITEMS[1], "bottom")}
          <div className="flex flex-1 items-center justify-center">
            <button
              type="button"
              onClick={() => setQuickOpen(true)}
              aria-label="Hurtighandlinger"
              className="-mt-6 grid size-14 place-items-center rounded-full bg-primary text-primary-ink shadow-[0_8px_20px_-6px_rgb(91_63_209/0.7)] ring-4 ring-bg transition-transform active:scale-95"
            >
              <Plus className="size-7" strokeWidth={2.4} />
            </button>
          </div>
          {navLink(NAV_ITEMS[2], "bottom")}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="Mer"
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium",
              MORE_ITEMS.some((i) => isActive(pathname, i.href)) ? "text-accent" : "text-ink-3",
            )}
          >
            <MoreHorizontal className="size-6" strokeWidth={1.9} aria-hidden="true" />
            Mer
          </button>
        </div>
      </nav>

      {/* ---------- hurtighandlinger (mobil) ---------- */}
      <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
        <DialogContent title="Hva vil du gjøre?">
          <div className="mt-2 grid gap-2">
            <Button asChild variant="soft" size="lg" className="justify-start" onClick={() => setQuickOpen(false)}>
              <Link href="/transaksjoner/import">
                <Upload /> Importer bankfil (CSV)
              </Link>
            </Button>
            <Button
              variant="soft"
              size="lg"
              className="justify-start"
              onClick={() => {
                setQuickOpen(false);
                setTxOpen(true);
              }}
            >
              <PenLine /> Legg til transaksjon
            </Button>
            <Button asChild variant="soft" size="lg" className="justify-start" onClick={() => setQuickOpen(false)}>
              <Link href="/transaksjoner?visning=godkjenning">
                <ArrowLeftRight /> Gå gjennom det som venter{reviewCount > 0 ? ` (${reviewCount})` : ""}
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------- «Mer» (mobil) ---------- */}
      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent title="Mer">
          <nav className="mt-2 grid gap-1" aria-label="Flere sider">
            {MORE_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={cn("flex h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium", isActive(pathname, item.href) ? "bg-primary-soft text-primary-soft-ink" : "hover:bg-surface-2")}
                >
                  <Icon className="size-5" aria-hidden="true" /> {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-4 space-y-3 border-t border-line pt-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-ink-2">Utseende</span>
              <ThemeToggle />
            </div>
            <p className="truncate text-xs text-ink-3">Innlogget som {user.email}</p>
            <form action={signOut}>
              <Button type="submit" variant="secondary" className="w-full">
                <LogOut /> Logg ut
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      <TransactionFormDialog open={txOpen} onOpenChange={setTxOpen} accounts={accounts} categories={categories} subcategories={subcategories} />
    </div>
    </CurrencyProvider>
  );
}

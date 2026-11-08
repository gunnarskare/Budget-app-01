import { ArrowLeftRight, BarChart3, LayoutDashboard, PiggyBank, Settings, Tags, Wallet, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/oversikt", label: "Oversikt", icon: LayoutDashboard },
  { href: "/transaksjoner", label: "Transaksjoner", icon: ArrowLeftRight },
  { href: "/budsjett", label: "Budsjett", icon: Wallet },
  { href: "/kategorier", label: "Kategorier", icon: Tags },
  { href: "/sparemal", label: "Sparemål", icon: PiggyBank },
  { href: "/rapporter", label: "Rapporter", icon: BarChart3 },
  { href: "/innstillinger", label: "Innstillinger", icon: Settings },
];

/** Hvilke ruter hører til hvilket menypunkt (f.eks. /transaksjoner/import under Transaksjoner). */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

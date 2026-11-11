"use client";

import {
  ArrowLeftRight,
  CalendarClock,
  CreditCard,
  FileUp,
  LayoutDashboard,
  PiggyBank,
  Settings,
  Wallet,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";

export const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/budget", label: "Presupuesto", icon: PiggyBank },
  { href: "/transactions", label: "Movimientos", icon: ArrowLeftRight },
  { href: "/installments", label: "Cuotas", icon: CreditCard },
  { href: "/subscriptions", label: "Suscripciones", icon: CalendarClock },
  { href: "/accounts", label: "Cuentas", icon: Wallet },
  { href: "/rules", label: "Reglas", icon: Wand2 },
  { href: "/import", label: "Importar CSV", icon: FileUp },
  { href: "/settings", label: "Datos y backup", icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
              active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

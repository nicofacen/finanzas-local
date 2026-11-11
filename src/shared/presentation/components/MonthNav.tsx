import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { YearMonth } from "@/shared/domain";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

/** Navegación entre meses vía ?month=AAAA-MM (Server Component). */
export function MonthNav({ month, basePath, extra = {} }: { month: string; basePath: string; extra?: Record<string, string> }) {
  const ym = YearMonth.fromString(month);
  const href = (m: YearMonth) => `${basePath}?${new URLSearchParams({ ...extra, month: m.toString() })}`;
  return (
    <div className="flex items-center gap-1">
      <Link href={href(ym.previous())} className={cn(buttonVariants({ variant: "outline", size: "icon" }))} aria-label="Mes anterior">
        <ChevronLeft />
      </Link>
      <span className="min-w-36 text-center text-sm font-medium">{ym.label}</span>
      <Link href={href(ym.next())} className={cn(buttonVariants({ variant: "outline", size: "icon" }))} aria-label="Mes siguiente">
        <ChevronRight />
      </Link>
    </div>
  );
}

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

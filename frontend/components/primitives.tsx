import type { ComponentProps } from "react";
import { cn } from "./cn";

// ─────────────── Card ───────────────
export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cn("rounded-lg border bg-card text-card-foreground shadow-xs", className)} {...p} />;
}
export function CardHeader({ className, ...p }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-3", className)} {...p} />;
}
export function CardTitle({ className, ...p }: ComponentProps<"h3">) {
  return <h3 className={cn("text-sm font-semibold leading-none tracking-tight", className)} {...p} />;
}
export function CardDescription({ className, ...p }: ComponentProps<"p">) {
  return <p className={cn("text-xs text-muted-foreground", className)} {...p} />;
}
export function CardContent({ className, ...p }: ComponentProps<"div">) {
  return <div className={cn("p-5 pt-0", className)} {...p} />;
}

// ─────────────── Form controls ───────────────
const field =
  "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input className={cn(field, className)} {...p} />;
}
export function Select({ className, ...p }: ComponentProps<"select">) {
  return <select className={cn(field, "pr-8", className)} {...p} />;
}
export function Label({ className, ...p }: ComponentProps<"label">) {
  return <label className={cn("text-xs font-medium text-muted-foreground", className)} {...p} />;
}
export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

// ─────────────── Badge ───────────────
const badgeTones = {
  neutral: "bg-muted text-muted-foreground",
  positive: "bg-positive/15 text-positive",
  negative: "bg-negative/15 text-negative",
  warning: "bg-warning/20 text-warning",
  primary: "bg-primary/15 text-primary",
};
export function Badge({ tone = "neutral", className, ...p }: ComponentProps<"span"> & { tone?: keyof typeof badgeTones }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", badgeTones[tone], className)}
      {...p}
    />
  );
}

// ─────────────── Progress ───────────────
export function Progress({ value, tone = "primary", className }: { value: number; tone?: "primary" | "negative" | "warning"; className?: string }) {
  const color = tone === "negative" ? "bg-negative" : tone === "warning" ? "bg-warning" : "bg-primary";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

// ─────────────── Table ───────────────
export function Table({ className, ...p }: ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-sm", className)} {...p} />
    </div>
  );
}
export function Th({ className, ...p }: ComponentProps<"th">) {
  return <th className={cn("h-9 px-3 text-left align-middle text-xs font-medium text-muted-foreground", className)} {...p} />;
}
export function Td({ className, ...p }: ComponentProps<"td">) {
  return <td className={cn("px-3 py-2 align-middle", className)} {...p} />;
}
export function Tr({ className, ...p }: ComponentProps<"tr">) {
  return <tr className={cn("border-b transition-colors hover:bg-muted/40", className)} {...p} />;
}

// ─────────────── Empty state ───────────────
export function EmptyState({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {children}
    </div>
  );
}

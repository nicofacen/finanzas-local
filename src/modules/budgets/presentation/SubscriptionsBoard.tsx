"use client";

import { CheckCircle2, Circle, Clock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Select } from "@/components/ui/primitives";
import type { SubscriptionCalendar } from "../application/useCases";
import { MoneyText } from "@/shared/presentation/components/Money";
import { formToObject, useAction } from "@/shared/presentation/useAction";
import { createSubscriptionAction, paySubscriptionAction } from "./actions";

const STATUS = {
  paid: { label: "Pagado", tone: "positive", icon: CheckCircle2 },
  pending: { label: "Pendiente", tone: "neutral", icon: Circle },
  overdue: { label: "Vencido", tone: "negative", icon: Clock },
} as const;

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function SubscriptionsBoard({
  calendar,
  accounts,
  categories,
  today,
}: {
  calendar: SubscriptionCalendar;
  accounts: { id: string; name: string; currency: string }[];
  categories: { id: string; name: string }[];
  today: string;
}) {
  const pay = useAction(paySubscriptionAction, { success: "Pago registrado como gasto" });
  const create = useAction(createSubscriptionAction, { success: "Suscripción creada" });

  const [y, m] = calendar.month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // lunes = 0
  const byDay = new Map<number, typeof calendar.items>();
  for (const item of calendar.items) byDay.set(item.day, [...(byDay.get(item.day) ?? []), item]);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader>
          <CardTitle>Calendario de vencimientos — {calendar.monthLabel}</CardTitle>
          <CardDescription>
            {calendar.totals.paid} pagadas · {calendar.totals.pending} pendientes · {calendar.totals.overdue} vencidas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
            {WEEKDAYS.map((d) => <div key={d} className="pb-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: offset }, (_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const items = byDay.get(day) ?? [];
              const isToday = today === `${calendar.month}-${String(day).padStart(2, "0")}`;
              return (
                <div key={day} className={cn("min-h-16 rounded-md border p-1 text-left", isToday && "border-primary ring-1 ring-primary")}>
                  <span className="text-[11px] text-muted-foreground">{day}</span>
                  {items.map((it) => {
                    const S = STATUS[it.status];
                    return (
                      <div
                        key={it.subscriptionId}
                        title={`${it.name} · ${it.amount.formatted} · ${S.label}`}
                        className={cn(
                          "mt-0.5 flex items-center gap-1 truncate rounded px-1 text-[10px]",
                          it.status === "paid" ? "bg-positive/15 text-positive" : it.status === "overdue" ? "bg-negative/15 text-negative" : "bg-muted",
                        )}
                      >
                        <S.icon className="size-2.5 shrink-0" /> {it.name}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Este mes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {calendar.items.length === 0 && <p className="text-sm text-muted-foreground">No hay suscripciones activas.</p>}
            {calendar.items.map((it) => {
              const S = STATUS[it.status];
              return (
                <div key={it.subscriptionId} className="flex items-center gap-3 rounded-md border p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{it.name}</p>
                    <p className="text-xs text-muted-foreground">Día {it.day} · {it.accountName}</p>
                  </div>
                  <div className="text-right">
                    <MoneyText value={it.amount} className="text-sm" />
                    <div><Badge tone={S.tone}><S.icon className="size-3" /> {S.label}</Badge></div>
                  </div>
                  {it.status !== "paid" && (
                    <Button size="sm" variant="outline" disabled={pay.pending} onClick={() => void pay.run({ subscriptionId: it.subscriptionId, month: calendar.month })}>
                      Pagar
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nueva suscripción / gasto fijo</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid grid-cols-2 gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const r = await create.run(formToObject(form));
                if (r.ok) form.reset();
              }}
            >
              <Field label="Nombre" className="col-span-2"><Input name="name" required placeholder="Netflix" /></Field>
              <Field label="Monto"><Input name="amount" required inputMode="decimal" /></Field>
              <Field label="Día de débito"><Input name="billingDay" type="number" min={1} max={31} required defaultValue={10} /></Field>
              <Field label="Cuenta">
                <Select name="accountId">{accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}</Select>
              </Field>
              <Field label="Categoría">
                <Select name="categoryId" defaultValue="">
                  <option value="">—</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Button className="col-span-2" disabled={create.pending || accounts.length === 0}><Plus /> Agregar</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

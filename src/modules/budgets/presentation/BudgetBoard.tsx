"use client";

import { AlertTriangle, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Progress,
  Select,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui/primitives";
import type { BudgetOverview, BudgetSummaryView, EnvelopeView } from "../application/GetBudgetOverviewUseCase";
import type { SavingsGoalView } from "../application/useCases";
import { MoneyText } from "@/shared/presentation/components/Money";
import { formToObject, useAction } from "@/shared/presentation/useAction";
import {
  assignToEnvelopeAction,
  contributeToGoalAction,
  createCategoryAction,
  createSavingsGoalAction,
  setMethodologyAction,
} from "./actions";

type View = "zero-based" | "safe-to-spend" | "combined";

const toneClass: Record<string, string> = {
  positive: "text-positive",
  negative: "text-negative",
  warning: "text-warning",
  neutral: "text-foreground",
};

function SummaryCard({ s, compact = false }: { s: BudgetSummaryView; compact?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{s.title}</CardDescription>
        <CardTitle className="text-xs font-medium text-muted-foreground">{s.headline.label}</CardTitle>
        <p className={cn("text-3xl font-semibold tracking-tight tabular", toneClass[s.headline.tone])}>{s.headline.amount.formatted}</p>
        {s.headline.hint && <p className="text-xs text-muted-foreground">{s.headline.hint}</p>}
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="space-y-1.5 text-sm">
          {s.lines.map((l) => (
            <div key={l.label} className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{l.label}</dt>
              <dd className={cn("tabular", toneClass[l.tone])}>{l.amount.formatted}</dd>
            </div>
          ))}
          {s.dailyAllowance && (
            <div className="flex justify-between gap-4 border-t pt-1.5 font-medium">
              <dt>Disponible por día ({s.daysRemaining} días)</dt>
              <dd className="tabular">{s.dailyAllowance.formatted}</dd>
            </div>
          )}
        </dl>
        {!compact &&
          s.warnings.map((w) => (
            <p key={w} className="flex gap-2 rounded-md bg-warning/10 p-2 text-xs text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {w}
            </p>
          ))}
      </CardContent>
    </Card>
  );
}

function AssignInput({ envelope, month }: { envelope: EnvelopeView; month: string }) {
  const [value, setValue] = useState(envelope.assigned.decimal.replace(".", ","));
  const { run, pending } = useAction(assignToEnvelopeAction, { silent: false });
  const initial = envelope.assigned.decimal.replace(".", ",");
  const save = () => {
    if (value === initial) return;
    void run({ categoryId: envelope.categoryId, month, amount: value || "0" });
  };
  return (
    <Input
      value={value}
      inputMode="decimal"
      disabled={pending}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      className="h-8 w-32 text-right tabular"
      aria-label={`Asignado a ${envelope.name}`}
    />
  );
}

export function BudgetBoard({ overview, goals }: { overview: BudgetOverview; goals: SavingsGoalView[] }) {
  const [view, setView] = useState<View>(overview.preferredMethodology);
  const methodology = useAction(setMethodologyAction, { silent: true });
  const choose = (v: View) => {
    setView(v);
    if (v !== "combined") void methodology.run({ methodology: v });
  };

  const groups = new Map<string, EnvelopeView[]>();
  for (const e of overview.envelopes) groups.set(e.group, [...(groups.get(e.group) ?? []), e]);

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-lg border bg-card p-1">
        {(
          [
            ["zero-based", "Sobres (base cero)"],
            ["safe-to-spend", "Safe-to-Spend"],
            ["combined", "Combinada"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => choose(id)}
            className={cn("rounded-md px-3 py-1.5 text-sm transition-colors", view === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={cn("grid gap-4", view === "combined" ? "lg:grid-cols-2" : "lg:grid-cols-[minmax(0,420px)_1fr]")}>
        {(view === "zero-based" || view === "combined") && <SummaryCard s={overview.summaries["zero-based"]} compact={view === "combined"} />}
        {(view === "safe-to-spend" || view === "combined") && <SummaryCard s={overview.summaries["safe-to-spend"]} compact={view === "combined"} />}
        {view !== "combined" && (
          <Card>
            <CardHeader>
              <CardTitle>Compromisos fijos del mes</CardTitle>
              <CardDescription>Suscripciones, cuotas y categorías fijas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              {overview.commitments.length === 0 && <p className="text-muted-foreground">Sin compromisos.</p>}
              {overview.commitments.map((c, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <span className="truncate">
                    {c.label}{" "}
                    <Badge tone={c.paid ? "positive" : "neutral"}>
                      {c.source === "subscription" ? "suscripción" : c.source === "installment" ? "cuota" : "fijo"}
                      {c.paid ? " · pagado" : ""}
                    </Badge>
                  </span>
                  <MoneyText value={c.amount} />
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {view !== "safe-to-spend" && (
        <Card>
          <CardHeader>
            <CardTitle>Sobres de {overview.monthLabel}</CardTitle>
            <CardDescription>
              Disponible = arrastre del mes anterior + asignado + actividad. El sobrante pasa al mes siguiente; los sobregiros se descuentan de “Listo para asignar”.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <thead>
                <tr className="border-b">
                  <Th>Categoría</Th>
                  <Th className="text-right">Arrastre</Th>
                  <Th className="text-right">Asignado</Th>
                  <Th className="text-right">Actividad</Th>
                  <Th className="text-right">Disponible</Th>
                  <Th className="w-40">Uso</Th>
                </tr>
              </thead>
              <tbody>
                {[...groups.entries()].map(([group, list]) => (
                  <GroupRows key={group} group={group} list={list} month={overview.month} />
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <GoalsCard goals={goals} />
        <NewCategoryCard />
      </div>
    </div>
  );
}

function GroupRows({ group, list, month }: { group: string; list: EnvelopeView[]; month: string }) {
  return (
    <>
      <tr>
        <td colSpan={6} className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {group}
        </td>
      </tr>
      {list.map((e) => (
        <Tr key={e.categoryId}>
          <Td>
            {e.name} {e.kind === "fixed" && <Badge>fijo</Badge>} {e.kind === "savings" && <Badge tone="primary">ahorro</Badge>}
          </Td>
          <Td className="text-right text-muted-foreground"><MoneyText value={e.carryover} /></Td>
          <Td><div className="flex justify-end"><AssignInput envelope={e} month={month} /></div></Td>
          <Td className="text-right"><MoneyText value={e.activity} /></Td>
          <Td className="text-right font-medium">
            <Badge tone={e.overspent ? "negative" : /^0+$/.test(e.available.minor) ? "neutral" : "positive"} className="text-xs">
              {e.available.formatted}
            </Badge>
          </Td>
          <Td>
            {e.usagePercent !== null && (
              <Progress value={e.usagePercent} tone={e.overspent ? "negative" : e.usagePercent > 85 ? "warning" : "primary"} />
            )}
          </Td>
        </Tr>
      ))}
    </>
  );
}

function GoalsCard({ goals }: { goals: SavingsGoalView[] }) {
  const create = useAction(createSavingsGoalAction, { success: "Meta creada" });
  const contribute = useAction(contributeToGoalAction, { success: "Aporte registrado" });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Metas de ahorro</CardTitle>
        <CardDescription>Su aporte mensual se reserva en el modo Safe-to-Spend</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {goals.map((g) => (
          <div key={g.id} className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="font-medium">{g.name}</span>
              <span className="text-muted-foreground tabular">
                {g.saved.formatted} / {g.target.formatted}
              </span>
            </div>
            <Progress value={g.progressPercent} />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {g.progressPercent}% · aporte {g.monthlyContribution.formatted}/mes
                {g.monthsToComplete !== null && ` · ~${g.monthsToComplete} meses`}
                {g.requiredMonthly && ` · necesitás ${g.requiredMonthly.formatted}/mes para ${g.targetMonth}`}
              </span>
              <form
                className="flex gap-1"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const r = await contribute.run({ goalId: g.id, amount: formToObject(form).amount });
                  if (r.ok) form.reset();
                }}
              >
                <Input name="amount" placeholder="Aporte" className="h-7 w-24 text-xs" />
                <Button size="sm" variant="outline" className="h-7" disabled={contribute.pending}>+</Button>
              </form>
            </div>
          </div>
        ))}
        <form
          className="grid grid-cols-2 gap-2 border-t pt-4 sm:grid-cols-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const r = await create.run(formToObject(form));
            if (r.ok) form.reset();
          }}
        >
          <Input name="name" placeholder="Nueva meta" required className="col-span-2 sm:col-span-1" />
          <Input name="target" placeholder="Objetivo" required />
          <Input name="monthlyContribution" placeholder="Aporte/mes" required />
          <Button disabled={create.pending}><Plus /> Crear</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function NewCategoryCard() {
  const create = useAction(createCategoryAction, { success: "Categoría creada" });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nueva categoría</CardTitle>
        <CardDescription>Las categorías de ingreso no tienen sobre: alimentan “Listo para asignar”.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const r = await create.run(formToObject(form));
            if (r.ok) form.reset();
          }}
        >
          <Field label="Nombre"><Input name="name" required /></Field>
          <Field label="Grupo"><Input name="group" placeholder="Día a día" /></Field>
          <Field label="Tipo">
            <Select name="kind" defaultValue="variable">
              <option value="variable">Gasto variable</option>
              <option value="fixed">Gasto fijo</option>
              <option value="savings">Ahorro</option>
              <option value="income">Ingreso</option>
            </Select>
          </Field>
          <div className="flex items-end">
            <Button className="w-full" disabled={create.pending}><Plus /> Agregar</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

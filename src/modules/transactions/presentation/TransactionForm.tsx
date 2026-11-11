"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Card, CardContent, Field, Input, Select } from "@/components/ui/primitives";
import { formToObject, useAction } from "@/shared/presentation/useAction";
import {
  createInstallmentPurchaseAction,
  recordExpenseAction,
  recordIncomeAction,
  transferAction,
} from "./actions";

export interface Option {
  id: string;
  name: string;
  currency?: string;
  type?: string;
  kind?: string;
}

type Mode = "expense" | "income" | "transfer" | "installments";
const MODES: [Mode, string][] = [
  ["expense", "Gasto"],
  ["income", "Ingreso"],
  ["transfer", "Transferencia"],
  ["installments", "Compra en cuotas"],
];

export function TransactionForm({ accounts, categories, today }: { accounts: Option[]; categories: Option[]; today: string }) {
  const [mode, setMode] = useState<Mode>("expense");
  const [from, setFrom] = useState(accounts[0]?.id ?? "");
  const [to, setTo] = useState(accounts[1]?.id ?? "");
  const expense = useAction(recordExpenseAction, { success: (d) => (d.appliedRuleId ? "Gasto registrado (categoría por regla)" : "Gasto registrado") });
  const income = useAction(recordIncomeAction, { success: "Ingreso registrado" });
  const transfer = useAction(transferAction, { success: "Transferencia registrada" });
  const installments = useAction(createInstallmentPurchaseAction, {
    success: (d) => `Compra registrada: cuotas de ${d.installmentAmount} desde ${d.firstInstallmentMonth}`,
  });
  const pending = expense.pending || income.pending || transfer.pending || installments.pending;

  const cards = accounts.filter((a) => a.type === "credit_card");
  const fromAcc = accounts.find((a) => a.id === from);
  const toAcc = accounts.find((a) => a.id === to);
  const crossCurrency = mode === "transfer" && fromAcc && toAcc && fromAcc.currency !== toAcc.currency;
  const visibleCategories = categories.filter((c) => (mode === "income" ? c.kind === "income" : c.kind !== "income"));

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = formToObject(form);
    const r =
      mode === "expense"
        ? await expense.run(data)
        : mode === "income"
          ? await income.run(data)
          : mode === "transfer"
            ? await transfer.run(data)
            : await installments.run(data);
    if (r.ok) {
      (form.elements.namedItem("amount") as HTMLInputElement | null)?.focus();
      form.querySelectorAll<HTMLInputElement>("input[data-reset]").forEach((i) => (i.value = ""));
    }
  };

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="mb-4 inline-flex flex-wrap rounded-lg border bg-muted/40 p-1">
          {MODES.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={cn("rounded-md px-3 py-1 text-sm", mode === id ? "bg-card shadow-xs font-medium" : "text-muted-foreground")}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" key={mode}>
          {mode === "transfer" ? (
            <>
              <Field label="Desde">
                <Select name="fromAccountId" value={from} onChange={(e) => setFrom(e.target.value)}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                </Select>
              </Field>
              <Field label="Hacia">
                <Select name="toAccountId" value={to} onChange={(e) => setTo(e.target.value)}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                </Select>
              </Field>
              <Field label={`Monto (${fromAcc?.currency ?? ""})`}>
                <Input name="amount" data-reset required inputMode="decimal" placeholder="0,00" />
              </Field>
              {crossCurrency && (
                <Field label={`Se acredita (${toAcc?.currency})`}>
                  <Input name="receivedAmount" data-reset required inputMode="decimal" placeholder="0,00" />
                </Field>
              )}
              <Field label="Descripción"><Input name="description" data-reset placeholder="Opcional" /></Field>
            </>
          ) : (
            <>
              <Field label={mode === "installments" ? "Tarjeta" : "Cuenta"}>
                <Select name="accountId" required>
                  {(mode === "installments" ? cards : accounts).map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                  ))}
                </Select>
              </Field>
              <Field label={mode === "installments" ? "Total" : "Monto"}>
                <Input name={mode === "installments" ? "total" : "amount"} data-reset required inputMode="decimal" placeholder="15.000,00" />
              </Field>
              {mode === "installments" && (
                <Field label="Cuotas"><Input name="installments" type="number" min={1} max={72} defaultValue={3} required /></Field>
              )}
              <Field label="Descripción" className="lg:col-span-2">
                <Input name="description" data-reset required placeholder={mode === "income" ? "Sueldo" : "Supermercado"} />
              </Field>
              <Field label="Categoría">
                <Select name="categoryId" defaultValue="">
                  <option value="">Automática (reglas)</option>
                  {visibleCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
            </>
          )}
          <Field label="Fecha">
            <Input name={mode === "installments" ? "purchaseDate" : "date"} type="date" defaultValue={today} required />
          </Field>
          <div className="flex items-end">
            <Button className="w-full" disabled={pending || (mode === "installments" && cards.length === 0)}>
              <Plus /> Registrar
            </Button>
          </div>
        </form>
        {mode === "installments" && cards.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">Creá una cuenta de tipo tarjeta de crédito para cargar compras en cuotas.</p>
        )}
      </CardContent>
    </Card>
  );
}

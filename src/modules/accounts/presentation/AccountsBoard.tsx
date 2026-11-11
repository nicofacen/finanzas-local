"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Progress, Select } from "@/components/ui/primitives";
import type { AccountView, ExchangeRateView } from "../application/useCases";
import { ACCOUNT_TYPE_POLICIES, ACCOUNT_TYPES, type AccountType } from "../domain/AccountType";
import { MoneyText } from "@/shared/presentation/components/Money";
import { formToObject, useAction } from "@/shared/presentation/useAction";
import { createAccountAction, setExchangeRateAction } from "./actions";

const CURRENCIES = ["ARS", "USD", "EUR", "BRL", "UYU", "CLP", "MXN"];

export function AccountsBoard({ accounts, rates, baseCurrency }: { accounts: AccountView[]; rates: ExchangeRateView[]; baseCurrency: string }) {
  const [type, setType] = useState<AccountType>("checking");
  const create = useAction(createAccountAction, { success: "Cuenta creada" });
  const setRate = useAction(setExchangeRateAction, { success: (r) => `1 ${r.from} = ${r.rate} ${r.to}` });

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="grid gap-4 sm:grid-cols-2">
        {accounts.map((a) => {
          const usedPct =
            a.creditLimit && Number(a.creditLimit.minor) > 0 ? (Math.abs(Number(a.balance.minor)) / Number(a.creditLimit.minor)) * 100 : null;
          return (
            <Card key={a.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{a.name}</CardTitle>
                  <Badge tone={a.isLiability ? "warning" : "neutral"}>{a.typeLabel}</Badge>
                </div>
                {a.aliases.length > 0 && <CardDescription>Alias Ctrl+K: {a.aliases.join(", ")}</CardDescription>}
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-2xl font-semibold tracking-tight">
                  <MoneyText value={a.balance} colored={a.isLiability} />
                </p>
                {a.currency !== baseCurrency && (
                  <p className="text-xs text-muted-foreground">
                    {a.baseBalance ? <>≈ <MoneyText value={a.baseBalance} /></> : `Sin tipo de cambio ${a.currency}→${baseCurrency}`}
                  </p>
                )}
                {usedPct !== null && (
                  <div className="space-y-1">
                    <Progress value={usedPct} tone={usedPct > 80 ? "negative" : usedPct > 50 ? "warning" : "primary"} />
                    <p className="text-xs text-muted-foreground">
                      Disponible <MoneyText value={a.available} /> de <MoneyText value={a.creditLimit!} />
                      {a.closingDay && ` · cierre día ${a.closingDay}`}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {accounts.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay cuentas. Creá la primera →</p>}
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Nueva cuenta</CardTitle>
            <CardDescription>Para tarjetas, el saldo inicial es la deuda actual.</CardDescription>
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
              <Field label="Nombre" className="col-span-2"><Input name="name" required placeholder="Cuenta Sueldo" /></Field>
              <Field label="Tipo">
                <Select name="type" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
                  {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{ACCOUNT_TYPE_POLICIES[t].label}</option>)}
                </Select>
              </Field>
              <Field label="Moneda">
                <Select name="currency" defaultValue={baseCurrency}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select>
              </Field>
              <Field label={type === "credit_card" ? "Deuda actual" : "Saldo inicial"}>
                <Input name="openingBalance" defaultValue="0" inputMode="decimal" />
              </Field>
              <Field label="Alias (coma)"><Input name="aliases" placeholder="débito, banco" /></Field>
              {type === "credit_card" && (
                <>
                  <Field label="Límite"><Input name="creditLimit" inputMode="decimal" /></Field>
                  <Field label="Día de cierre"><Input name="closingDay" type="number" min={1} max={31} /></Field>
                </>
              )}
              <Button className="col-span-2" disabled={create.pending}><Plus /> Crear cuenta</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tipos de cambio manuales</CardTitle>
            <CardDescription>Moneda base: {baseCurrency}. Se usan para convertir saldos, gastos y reportes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {rates.map((r) => (
              <div key={r.from} className="flex justify-between text-sm">
                <span>1 {r.from}</span>
                <span className="tabular">{Number(r.rate).toLocaleString("es-AR", { maximumFractionDigits: 8 })} {r.to}</span>
                <span className="text-xs text-muted-foreground">{r.effectiveDate}</span>
              </div>
            ))}
            <form
              className="flex gap-2 border-t pt-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const r = await setRate.run(formToObject(form));
                if (r.ok) form.reset();
              }}
            >
              <Select name="currency" className="w-24">
                {CURRENCIES.filter((c) => c !== baseCurrency).map((c) => <option key={c}>{c}</option>)}
              </Select>
              <Input name="rate" placeholder="1450,50" required inputMode="decimal" />
              <Button variant="outline" disabled={setRate.pending}>Guardar</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

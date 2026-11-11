"use client";

import { FlaskConical, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Field, Input, Select } from "@/components/ui/primitives";
import type { RuleView } from "../application/useCases";
import type { ConditionField, ConditionOperator } from "../domain/RuleSpecifications";
import { formToObject, useAction } from "@/shared/presentation/useAction";
import { createRuleAction, deleteRuleAction, testRulesAction, toggleRuleAction } from "./actions";

const OPERATORS: Record<ConditionField, [ConditionOperator, string][]> = {
  description: [["contains", "contiene"], ["starts_with", "empieza con"], ["equals", "es igual a"], ["regex", "regex"]],
  amount: [["lte", "≤"], ["gte", "≥"]],
  account: [["equals", "es"]],
};

interface Cond { field: ConditionField; operator: ConditionOperator; value: string }

export function RulesBoard({ rules, categories, accounts }: { rules: RuleView[]; categories: { id: string; name: string }[]; accounts: { id: string; name: string }[] }) {
  const [conditions, setConditions] = useState<Cond[]>([{ field: "description", operator: "contains", value: "" }]);
  const [result, setResult] = useState<string | null>(null);
  const create = useAction(createRuleAction, { success: "Regla creada" });
  const toggle = useAction(toggleRuleAction, { silent: true });
  const remove = useAction(deleteRuleAction, { success: "Regla eliminada" });
  const test = useAction(testRulesAction, { silent: true });

  const update = (i: number, patch: Partial<Cond>) =>
    setConditions((cs) => cs.map((c, k) => (k === i ? { ...c, ...patch, ...(patch.field ? { operator: OPERATORS[patch.field][0][0], value: "" } : {}) } : c)));

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
      <Card>
        <CardHeader>
          <CardTitle>Reglas activas</CardTitle>
          <CardDescription>Se evalúan por prioridad (menor número primero). La primera que coincide asigna la categoría.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {rules.length === 0 && <EmptyState title="Sin reglas" description="Creá reglas para categorizar automáticamente la carga rápida y las importaciones." />}
          {rules.map((r) => (
            <div key={r.id} className="flex items-start gap-3 rounded-md border p-3">
              <input
                type="checkbox"
                checked={r.active}
                onChange={(e) => void toggle.run({ id: r.id, active: e.target.checked })}
                className="mt-1 size-4 accent-[var(--primary)]"
                aria-label="Activa"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {r.name} <Badge>#{r.priority}</Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  Si {r.explanation} → <span className="font-medium text-foreground">{r.categoryName}</span>
                  {r.renameTo && <> · renombrar a “{r.renameTo}”</>}
                </p>
              </div>
              <Button variant="ghost" size="icon" aria-label="Eliminar regla" onClick={() => confirm("¿Eliminar la regla?") && void remove.run({ id: r.id })}>
                <Trash2 className="text-muted-foreground" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Nueva regla</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const data = formToObject(form);
                const r = await create.run({ ...data, conditions });
                if (r.ok) {
                  form.reset();
                  setConditions([{ field: "description", operator: "contains", value: "" }]);
                }
              }}
            >
              <Field label="Nombre"><Input name="name" required placeholder="Uber" /></Field>
              <Field label="Coincidir">
                <Select name="matchMode" defaultValue="all">
                  <option value="all">Todas las condiciones (Y)</option>
                  <option value="any">Cualquier condición (O)</option>
                </Select>
              </Field>
              {conditions.map((c, i) => (
                <div key={i} className="flex gap-1.5">
                  <Select value={c.field} onChange={(e) => update(i, { field: e.target.value as ConditionField })} className="w-28">
                    <option value="description">Descripción</option>
                    <option value="amount">Monto</option>
                    <option value="account">Cuenta</option>
                  </Select>
                  <Select value={c.operator} onChange={(e) => update(i, { operator: e.target.value as ConditionOperator })} className="w-28">
                    {OPERATORS[c.field].map(([op, label]) => <option key={op} value={op}>{label}</option>)}
                  </Select>
                  {c.field === "account" ? (
                    <Select value={c.value} onChange={(e) => update(i, { value: e.target.value })}>
                      <option value="">—</option>
                      {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </Select>
                  ) : (
                    <Input value={c.value} onChange={(e) => update(i, { value: e.target.value })} placeholder={c.field === "amount" ? "5000" : "uber"} />
                  )}
                  {conditions.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => setConditions((cs) => cs.filter((_, k) => k !== i))}>
                      <X />
                    </Button>
                  )}
                </div>
              ))}
              {conditions.length < 5 && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setConditions((cs) => [...cs, { field: "description", operator: "contains", value: "" }])}>
                  <Plus /> Condición
                </Button>
              )}
              <Field label="Categoría">
                <Select name="categoryId" required>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
              </Field>
              <Field label="Renombrar descripción (opcional)"><Input name="renameTo" placeholder="Uber" /></Field>
              <Button className="w-full" disabled={create.pending || categories.length === 0}><Plus /> Crear regla</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FlaskConical className="size-4" /> Probar el motor</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await test.run(formToObject(e.currentTarget));
                setResult(r.ok ? (r.data ? `→ ${r.data.categoryName} (regla “${r.data.ruleName}”)` : "Ninguna regla coincide") : r.error);
              }}
            >
              <Input name="description" placeholder="MERPAGO*UBER TRIP" required />
              <Input name="amount" placeholder="Monto" className="w-24" />
              <Button variant="outline" disabled={test.pending}>Probar</Button>
            </form>
            {result && <p className="mt-3 text-sm">{result}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

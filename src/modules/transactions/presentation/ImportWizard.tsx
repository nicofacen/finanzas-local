"use client";

import { FileUp, Upload } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Select, Table, Td, Th, Tr } from "@/components/ui/primitives";
import type { PreviewLine } from "../application/ImportBankStatementUseCases";
import { MoneyText } from "@/shared/presentation/components/Money";
import { useAction } from "@/shared/presentation/useAction";
import { importStatementAction, previewStatementAction } from "./actions";

export function ImportWizard({
  accounts,
  adapters,
  categories,
}: {
  accounts: { id: string; name: string; currency: string }[];
  adapters: { id: string; label: string; description: string }[];
  categories: { id: string; name: string }[];
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [adapterId, setAdapterId] = useState(adapters[0]?.id ?? "auto");
  const [content, setContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [lines, setLines] = useState<PreviewLine[] | null>(null);
  const [overrides, setOverrides] = useState<Record<number, string | null>>({});
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const preview = useAction(previewStatementAction);
  const importer = useAction(importStatementAction, { success: (d) => `Importados ${d.imported} movimientos (${d.skipped} omitidos)` });

  const loadPreview = async (text: string, acc = accountId, adp = adapterId) => {
    const r = await preview.run({ accountId: acc, adapterId: adp, content: text });
    if (r.ok) {
      setLines(r.data);
      setOverrides({});
      setExcluded(new Set(r.data.filter((l) => l.duplicate).map((l) => l.index)));
    } else setLines(null);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setFileName(file.name);
    setContent(text);
    await loadPreview(text);
  };

  const pending = lines?.filter((l) => !excluded.has(l.index)).length ?? 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Elegí cuenta y formato</CardTitle>
          <CardDescription>
            Los adaptadores CSV aíslan las diferencias entre bancos (Protected Variations). Para Excel, exportá la hoja como CSV.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Field label="Cuenta destino">
            <Select value={accountId} onChange={(e) => { setAccountId(e.target.value); if (content) void loadPreview(content, e.target.value); }}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </Select>
          </Field>
          <Field label="Formato">
            <Select value={adapterId} onChange={(e) => { setAdapterId(e.target.value); if (content) void loadPreview(content, accountId, e.target.value); }}>
              {adapters.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </Select>
          </Field>
          <Field label="Archivo CSV">
            <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 text-sm text-muted-foreground hover:bg-muted">
              <FileUp className="size-4" /> {fileName || "Seleccionar archivo…"}
              <input type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
            </label>
          </Field>
          <p className="text-xs text-muted-foreground sm:col-span-3">{adapters.find((a) => a.id === adapterId)?.description}</p>
        </CardContent>
      </Card>

      {preview.pending && <p className="text-sm text-muted-foreground">Analizando archivo…</p>}

      {lines && (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>2. Revisá y confirmá</CardTitle>
              <CardDescription>
                {lines.length} líneas · {lines.filter((l) => l.duplicate).length} ya importadas · {lines.filter((l) => l.ruleId).length} categorizadas por reglas
              </CardDescription>
            </div>
            <Button
              disabled={importer.pending || pending === 0}
              onClick={async () => {
                const r = await importer.run({
                  accountId,
                  adapterId,
                  content: content!,
                  categoryOverrides: Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, v])),
                  excluded: [...excluded],
                });
                if (r.ok) await loadPreview(content!);
              }}
            >
              <Upload /> Importar {pending} movimientos
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <thead>
                <tr className="border-b">
                  <Th className="w-8" />
                  <Th>Fecha</Th>
                  <Th>Descripción</Th>
                  <Th>Categoría</Th>
                  <Th className="text-right">Monto</Th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const value = l.index in overrides ? overrides[l.index] : l.suggestedCategoryId;
                  return (
                    <Tr key={l.index} className={excluded.has(l.index) ? "opacity-50" : ""}>
                      <Td>
                        <input
                          type="checkbox"
                          checked={!excluded.has(l.index)}
                          disabled={l.duplicate}
                          onChange={(e) => {
                            const next = new Set(excluded);
                            if (e.target.checked) next.delete(l.index);
                            else next.add(l.index);
                            setExcluded(next);
                          }}
                          aria-label="Incluir"
                        />
                      </Td>
                      <Td className="whitespace-nowrap text-muted-foreground tabular">{l.date}</Td>
                      <Td>
                        {l.description}
                        {l.description !== l.originalDescription && <span className="block text-[11px] text-muted-foreground">{l.originalDescription}</span>}
                        {l.duplicate && <Badge className="ml-2">duplicado</Badge>}
                      </Td>
                      <Td>
                        <Select
                          value={value ?? ""}
                          onChange={(e) => setOverrides((o) => ({ ...o, [l.index]: e.target.value || null }))}
                          className="h-7 w-40 text-xs"
                        >
                          <option value="">Sin categoría</option>
                          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </Select>
                        {l.ruleId && !(l.index in overrides) && <Badge tone="primary" className="ml-1">regla</Badge>}
                      </Td>
                      <Td className="text-right"><MoneyText value={l.amount} colored /></Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

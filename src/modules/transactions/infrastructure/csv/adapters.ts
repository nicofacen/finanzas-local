import Papa from "papaparse";
import { DomainError, err, normalizeText, ok, type Result } from "@/shared/domain";
import type { ICsvParserAdapter, ICsvParserRegistry, StatementLine } from "../../domain";
import { BaseCsvAdapter, amountOrNull, type Row } from "./BaseCsvAdapter";

/** Formato con una única columna de importe con signo (billeteras, exportaciones genéricas). */
export class SignedAmountCsvAdapter extends BaseCsvAdapter {
  readonly id = "signed-amount";
  readonly label = "Genérico (importe con signo)";
  readonly description = "Columnas: Fecha, Descripción, Importe/Monto (negativo = gasto).";
  private amountCol: string | null = null;

  protected prepare(headers: string[]): Result<void, DomainError> {
    this.amountCol = this.findColumn(headers, ["importe", "monto", "amount", "valor", "importe ars", "monto bruto"]);
    return this.amountCol ? ok(undefined) : err(new DomainError("PARSE_ERROR", "No encontré la columna de importe/monto"));
  }

  protected amountOf(row: Row): string | null {
    return amountOrNull(row[this.amountCol!]);
  }
}

/** Formato bancario con columnas Débito / Crédito separadas y siempre positivas. */
export class DebitCreditCsvAdapter extends BaseCsvAdapter {
  readonly id = "debit-credit";
  readonly label = "Banco (columnas Débito / Crédito)";
  readonly description = "Columnas: Fecha, Concepto, Débito, Crédito (montos positivos).";
  private debitCol: string | null = null;
  private creditCol: string | null = null;

  protected prepare(headers: string[]): Result<void, DomainError> {
    this.debitCol = this.findColumn(headers, ["debito", "debitos", "debe", "egreso", "egresos", "debit"]);
    this.creditCol = this.findColumn(headers, ["credito", "creditos", "haber", "ingreso", "ingresos", "credit"]);
    if (!this.debitCol || !this.creditCol) {
      return err(new DomainError("PARSE_ERROR", "No encontré las columnas Débito y Crédito"));
    }
    return ok(undefined);
  }

  protected amountOf(row: Row): string | null {
    const debit = amountOrNull(row[this.debitCol!]);
    const credit = amountOrNull(row[this.creditCol!]);
    if (debit && !/^-?0+(\.0+)?$/.test(debit)) return debit.startsWith("-") ? debit : `-${debit}`;
    if (credit) return credit.replace(/^-/, "");
    return debit ?? credit ?? null;
  }
}

/** Detecta automáticamente el formato por los encabezados. */
export class AutoDetectCsvAdapter implements ICsvParserAdapter {
  readonly id = "auto";
  readonly label = "Detectar automáticamente";
  readonly description = "Elige el formato según los encabezados del archivo.";

  constructor(private readonly candidates: readonly ICsvParserAdapter[]) {}

  parse(content: string): Result<StatementLine[], DomainError> {
    const header = Papa.parse<string[]>(content.replace(/^﻿/, "").trim(), { preview: 1 }).data[0] ?? [];
    const normalized = header.map((h) => normalizeText(String(h)));
    const hasDebitCredit = normalized.some((h) => h.includes("debito") || h === "debe") && normalized.some((h) => h.includes("credito") || h === "haber");
    const preferred = this.candidates.find((c) => c.id === (hasDebitCredit ? "debit-credit" : "signed-amount"));
    const ordered = preferred ? [preferred, ...this.candidates.filter((c) => c !== preferred)] : this.candidates;
    let lastError: DomainError | null = null;
    for (const adapter of ordered) {
      const r = adapter.parse(content);
      if (r.ok) return r;
      lastError = r.error;
    }
    return err(lastError ?? new DomainError("PARSE_ERROR", "Formato de archivo no reconocido"));
  }
}

export class CsvParserRegistry implements ICsvParserRegistry {
  private readonly adapters: ICsvParserAdapter[];

  constructor(adapters?: ICsvParserAdapter[]) {
    const base = adapters ?? [new SignedAmountCsvAdapter(), new DebitCreditCsvAdapter()];
    this.adapters = [new AutoDetectCsvAdapter(base), ...base];
  }

  get(id: string) {
    return this.adapters.find((a) => a.id === id);
  }

  list() {
    return this.adapters;
  }
}

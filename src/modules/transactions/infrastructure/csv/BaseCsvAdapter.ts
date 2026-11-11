import Papa from "papaparse";
import { DomainError, LocalDate, err, normalizeText, ok, type Result } from "@/shared/domain";
import { parseLocalizedAmount, type ICsvParserAdapter, type StatementLine } from "../../domain";

export type Row = Record<string, string>;

/**
 * Template Method: el parseo del archivo, la detección de encabezados y de
 * fechas es común; cada banco define sólo cómo obtener el monto de una fila.
 */
export abstract class BaseCsvAdapter implements ICsvParserAdapter {
  abstract readonly id: string;
  abstract readonly label: string;
  abstract readonly description: string;

  protected readonly dateHeaders = ["fecha", "date", "fecha operacion", "fecha de operacion", "fecha movimiento", "dia"];
  protected readonly descriptionHeaders = ["descripcion", "concepto", "detalle", "description", "movimiento", "referencia comercio", "comercio"];
  protected readonly referenceHeaders = ["referencia", "comprobante", "nro comprobante", "id", "reference"];

  parse(content: string): Result<StatementLine[], DomainError> {
    const parsed = Papa.parse<Row>(content.replace(/^﻿/, "").trim(), {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => normalizeText(h),
    });
    if (parsed.data.length === 0) return err(new DomainError("PARSE_ERROR", "El archivo no tiene filas"));
    const headers = parsed.meta.fields ?? [];

    const dateCol = this.findColumn(headers, this.dateHeaders);
    const descCol = this.findColumn(headers, this.descriptionHeaders);
    if (!dateCol || !descCol) {
      return err(
        new DomainError(
          "PARSE_ERROR",
          `No encontré las columnas de fecha y descripción. Encabezados detectados: ${headers.join(", ")}`,
        ),
      );
    }
    const prepared = this.prepare(headers);
    if (!prepared.ok) return prepared;
    const refCol = this.findColumn(headers, this.referenceHeaders);

    const lines: StatementLine[] = [];
    for (const [index, row] of parsed.data.entries()) {
      const date = parseStatementDate(row[dateCol] ?? "");
      if (!date) return err(new DomainError("PARSE_ERROR", `Fila ${index + 2}: fecha inválida "${row[dateCol]}"`));
      const amount = this.amountOf(row);
      if (amount === null) return err(new DomainError("PARSE_ERROR", `Fila ${index + 2}: monto inválido`));
      if (/^-?0+(\.0+)?$/.test(amount)) continue;
      lines.push({
        date,
        description: (row[descCol] ?? "").trim() || "(sin descripción)",
        amount,
        reference: refCol ? row[refCol]?.trim() || null : null,
      });
    }
    return ok(lines);
  }

  /** Verifica/ubica las columnas de monto propias del formato. */
  protected abstract prepare(headers: string[]): Result<void, DomainError>;
  /** Devuelve el monto con signo (negativo = egreso) como decimal canónico. */
  protected abstract amountOf(row: Row): string | null;

  protected findColumn(headers: string[], candidates: string[]): string | null {
    return headers.find((h) => candidates.includes(h)) ?? headers.find((h) => candidates.some((c) => h.includes(c))) ?? null;
  }
}

/** Acepta dd/mm/aaaa, dd-mm-aaaa, dd/mm/aa y aaaa-mm-dd. */
export function parseStatementDate(raw: string): LocalDate | null {
  const s = raw.trim().split(/[ T]/)[0];
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) {
    const r = LocalDate.of(Number(m[1]), Number(m[2]), Number(m[3]));
    return r.ok ? r.value : null;
  }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const r = LocalDate.of(year, Number(m[2]), Number(m[1]));
    return r.ok ? r.value : null;
  }
  return null;
}

export function amountOrNull(raw: string | undefined): string | null {
  if (raw === undefined || raw.trim() === "") return null;
  return parseLocalizedAmount(raw);
}

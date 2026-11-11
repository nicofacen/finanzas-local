import { DomainError, LocalDate, err, normalizeText, ok, type Result } from "@/shared/domain";
import { parseLocalizedAmount } from "./LocalizedAmount";

/** Lo mínimo que el parser necesita de una cuenta (ISP: no depende de toda la entidad). */
export interface AccountMatcher {
  readonly id: string;
  readonly name: string;
  matchesAlias(token: string): boolean;
}

export interface CategoryRef {
  readonly id: string;
  readonly name: string;
}

export interface QuickEntryContext {
  accounts: readonly AccountMatcher[];
  categories: readonly CategoryRef[];
  today: LocalDate;
}

export interface ParsedQuickEntry {
  kind: "expense" | "income";
  /** Decimal canónico positivo, ej "15000.50". */
  amount: string;
  /** Moneda explícita si el usuario la escribió (usd 20, 20usd). */
  currencyCode: string | null;
  description: string;
  accountId: string | null;
  accountName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  installments: number | null;
  date: LocalDate;
}

const CURRENCY_TOKENS: Record<string, string> = {
  usd: "USD", "u$s": "USD", "us$": "USD", "u$d": "USD", dolares: "USD", dolar: "USD",
  ars: "ARS", pesos: "ARS", eur: "EUR", euros: "EUR", "€": "EUR", brl: "BRL", reales: "BRL",
};

const INSTALLMENT_PATTERNS = [/^(\d{1,2})c$/i, /^x(\d{1,2})$/i, /^(\d{1,2})cuotas?$/i];

/**
 * Servicio de dominio para la barra Ctrl+K.
 * Ejemplos válidos:
 *   "15000 Supermercado Débito"
 *   "+850000 Sueldo Galicia"
 *   "usd 20 Netflix Visa"
 *   "120.000 Zapatillas Visa 6c ayer"
 */
export class QuickEntryParser {
  parse(input: string, ctx: QuickEntryContext): Result<ParsedQuickEntry, DomainError> {
    let tokens = input.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return err(new DomainError("PARSE_ERROR", "Escribí un monto y una descripción"));

    let kind: "expense" | "income" = "expense";
    if (tokens[0].startsWith("+")) {
      kind = "income";
      tokens[0] = tokens[0].slice(1);
      if (!tokens[0]) tokens = tokens.slice(1);
    }

    // 1) Moneda + monto
    let currencyCode: string | null = null;
    let amount: string | null = null;
    const rest: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const lower = normalizeText(t);
      if (amount === null) {
        if (CURRENCY_TOKENS[lower] && i + 1 < tokens.length && parseLocalizedAmount(tokens[i + 1])) {
          currencyCode = CURRENCY_TOKENS[lower];
          continue;
        }
        const glued = /^(usd|u\$s|us\$|eur|ars|brl)?([\d.,$]+)(usd|eur|ars|brl)?$/i.exec(t);
        const parsed = glued ? parseLocalizedAmount(glued[2]) : null;
        if (glued && parsed && !parsed.startsWith("-")) {
          amount = parsed;
          const cur = glued[1] ?? glued[3];
          if (cur) currencyCode = CURRENCY_TOKENS[cur.toLowerCase()] ?? currencyCode;
          continue;
        }
      } else if (currencyCode === null && CURRENCY_TOKENS[lower] && rest.length === 0) {
        currencyCode = CURRENCY_TOKENS[lower];
        continue;
      }
      rest.push(t);
    }
    if (amount === null || /^0+(\.0+)?$/.test(amount)) {
      return err(new DomainError("PARSE_ERROR", 'No encontré un monto válido. Ejemplo: "15000 Supermercado Débito"'));
    }

    // 2) Cuotas y fecha
    let installments: number | null = null;
    let date = ctx.today;
    const remaining: string[] = [];
    for (let i = 0; i < rest.length; i++) {
      const t = rest[i];
      const lower = normalizeText(t);
      const inst = INSTALLMENT_PATTERNS.map((p) => p.exec(t)).find(Boolean);
      if (inst) {
        installments = Number(inst[1]);
        continue;
      }
      if (/^\d{1,2}$/.test(t) && /^cuotas?$/i.test(rest[i + 1] ?? "")) {
        installments = Number(t);
        i++;
        continue;
      }
      if (lower === "hoy") continue;
      if (lower === "ayer") {
        date = ctx.today.addDays(-1);
        continue;
      }
      if (lower === "anteayer") {
        date = ctx.today.addDays(-2);
        continue;
      }
      const dm = /^(\d{1,2})\/(\d{1,2})$/.exec(t);
      if (dm) {
        const d = LocalDate.of(ctx.today.year, Number(dm[2]), Number(dm[1]));
        if (d.ok) {
          // Una fecha "futura" sin año se interpreta como del año anterior (ej. 28/12 cargado en enero).
          const previousYear = LocalDate.of(ctx.today.year - 1, d.value.month, d.value.day);
          date = d.value.isAfter(ctx.today) && previousYear.ok ? previousYear.value : d.value;
          continue;
        }
      }
      remaining.push(t);
    }
    if (installments !== null && (installments < 1 || installments > 72)) {
      return err(new DomainError("PARSE_ERROR", "La cantidad de cuotas debe estar entre 1 y 72"));
    }

    // 3) Cuenta: se buscan bigramas y luego unigramas, priorizando el final del texto.
    let account: AccountMatcher | null = null;
    const words = [...remaining];
    outer: for (const size of [2, 1]) {
      for (let i = words.length - size; i >= 0; i--) {
        const candidate = words.slice(i, i + size).join(" ");
        const found = ctx.accounts.find((a) => a.matchesAlias(candidate));
        if (found && words.length > size) {
          account = found;
          words.splice(i, size);
          break outer;
        }
        if (found && !account) {
          // La única palabra es la cuenta: se acepta pero se deja como descripción.
          account = found;
        }
      }
    }

    const description = words.join(" ").trim();

    // 4) Categoría por nombre exacto (frase completa o palabra).
    const normDesc = normalizeText(description);
    const descWords = new Set(normDesc.split(" "));
    const category =
      ctx.categories.find((c) => normalizeText(c.name) === normDesc) ??
      ctx.categories.find((c) => descWords.has(normalizeText(c.name))) ??
      null;

    return ok({
      kind,
      amount,
      currencyCode,
      description: description || category?.name || (kind === "income" ? "Ingreso" : "Gasto"),
      accountId: account?.id ?? null,
      accountName: account?.name ?? null,
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
      installments,
      date,
    });
  }
}

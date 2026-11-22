import { DomainError } from "../DomainError";
import { err, ok, type Result } from "../Result";

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** Value Object mes calendario ("2026-11"): unidad de presupuesto y de cuotas. */
export class YearMonth {
  private constructor(
    readonly year: number,
    readonly month: number,
  ) {
    Object.freeze(this);
  }

  static fromParts(year: number, month: number): YearMonth {
    // Normaliza desbordes (mes 13 → enero del año siguiente).
    const index = year * 12 + (month - 1);
    return new YearMonth(Math.floor(index / 12), (index % 12) + 1);
  }

  static parse(value: string): Result<YearMonth, DomainError> {
    const m = /^(\d{4})-(\d{2})$/.exec(value.trim());
    if (!m) return err(DomainError.validation(`Mes inválido: "${value}" (formato AAAA-MM)`));
    const month = Number(m[2]);
    if (month < 1 || month > 12) return err(DomainError.validation(`Mes inválido: "${value}"`));
    return ok(new YearMonth(Number(m[1]), month));
  }

  static fromString(value: string): YearMonth {
    const r = YearMonth.parse(value);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }

  static daysIn(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  get daysInMonth(): number {
    return YearMonth.daysIn(this.year, this.month);
  }

  get label(): string {
    return `${MONTH_NAMES[this.month - 1]} ${this.year}`;
  }

  get shortLabel(): string {
    return `${MONTH_NAMES[this.month - 1].slice(0, 3)} ${String(this.year).slice(2)}`;
  }

  addMonths(n: number): YearMonth {
    return YearMonth.fromParts(this.year, this.month + n);
  }
  next() {
    return this.addMonths(1);
  }
  previous() {
    return this.addMonths(-1);
  }

  /** Cantidad de meses desde `other` hasta this (positivo si this es posterior). */
  monthsSince(other: YearMonth): number {
    return this.year * 12 + this.month - (other.year * 12 + other.month);
  }

  compare(other: YearMonth): -1 | 0 | 1 {
    const d = this.monthsSince(other);
    return d < 0 ? -1 : d > 0 ? 1 : 0;
  }
  isBefore(other: YearMonth) {
    return this.compare(other) < 0;
  }
  isAfter(other: YearMonth) {
    return this.compare(other) > 0;
  }
  equals(other: YearMonth) {
    return this.compare(other) === 0;
  }

  /** Lista inclusiva de meses entre `from` y `to`. */
  static range(from: YearMonth, to: YearMonth): YearMonth[] {
    const out: YearMonth[] = [];
    for (let m = from; !m.isAfter(to); m = m.next()) out.push(m);
    return out;
  }

  firstDayISO(): string {
    return `${this.toString()}-01`;
  }
  lastDayISO(): string {
    return `${this.toString()}-${String(this.daysInMonth).padStart(2, "0")}`;
  }

  toString(): string {
    return `${this.year}-${String(this.month).padStart(2, "0")}`;
  }
}

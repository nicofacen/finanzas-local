import { DomainError } from "../DomainError";
import { err, ok, type Result } from "../Result";
import { YearMonth } from "./YearMonth";

/**
 * Fecha calendario sin hora ni zona horaria ("2026-11-11").
 * Evita los corrimientos de día típicos de `Date` con UTC.
 */
export class LocalDate {
  private constructor(
    readonly year: number,
    readonly month: number,
    readonly day: number,
  ) {
    Object.freeze(this);
  }

  static of(year: number, month: number, day: number): Result<LocalDate, DomainError> {
    if (!Number.isInteger(year) || year < 1900 || year > 2200) return err(DomainError.validation("Año inválido"));
    if (!Number.isInteger(month) || month < 1 || month > 12) return err(DomainError.validation("Mes inválido"));
    const dim = YearMonth.daysIn(year, month);
    if (!Number.isInteger(day) || day < 1 || day > dim) return err(DomainError.validation("Día inválido"));
    return ok(new LocalDate(year, month, day));
  }

  static parse(iso: string): Result<LocalDate, DomainError> {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
    if (!m) return err(DomainError.validation(`Fecha inválida: "${iso}" (formato AAAA-MM-DD)`));
    return LocalDate.of(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  /** Para valores ya validados (persistencia). */
  static fromISO(iso: string): LocalDate {
    const r = LocalDate.parse(iso);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }

  static fromDate(date: Date): LocalDate {
    return new LocalDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }

  get yearMonth(): YearMonth {
    return YearMonth.fromParts(this.year, this.month);
  }

  addDays(days: number): LocalDate {
    const d = new Date(Date.UTC(this.year, this.month - 1, this.day + days));
    return new LocalDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  daysUntil(other: LocalDate): number {
    const a = Date.UTC(this.year, this.month - 1, this.day);
    const b = Date.UTC(other.year, other.month - 1, other.day);
    return Math.round((b - a) / 86_400_000);
  }

  compare(other: LocalDate): -1 | 0 | 1 {
    const a = this.toISO();
    const b = other.toISO();
    return a < b ? -1 : a > b ? 1 : 0;
  }

  isBefore(other: LocalDate) {
    return this.compare(other) < 0;
  }
  isAfter(other: LocalDate) {
    return this.compare(other) > 0;
  }
  equals(other: LocalDate) {
    return this.compare(other) === 0;
  }

  toISO(): string {
    return `${this.year}-${String(this.month).padStart(2, "0")}-${String(this.day).padStart(2, "0")}`;
  }

  toString() {
    return this.toISO();
  }
}

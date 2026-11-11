import { DomainError, LocalDate, Money, err, ok, type Currency, type IClock, type Result } from "@/shared/domain";
import { parseLocalizedAmount } from "../domain";

/** Acepta montos en formato local ("15.000,50") y devuelve Money positivo. */
export function parsePositiveAmount(raw: string, currency: Currency): Result<Money, DomainError> {
  const canonical = parseLocalizedAmount(raw);
  if (canonical === null) return err(DomainError.validation(`Monto inválido: "${raw}"`));
  const money = Money.fromDecimal(canonical, currency);
  if (!money.ok) return money;
  if (!money.value.isPositive()) return err(DomainError.validation("El monto debe ser mayor a cero"));
  return money;
}

export function parseDateOrToday(raw: string | undefined | null, clock: IClock): Result<LocalDate, DomainError> {
  if (!raw) return ok(clock.today());
  return LocalDate.parse(raw);
}

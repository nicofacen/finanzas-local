import { YearMonth } from "@/shared/domain";
import { getContainer } from "@/shared/infrastructure/di/container";

/** Resuelve el mes de la URL (?month=AAAA-MM) o el mes actual. */
export function resolveMonth(param: string | string[] | undefined): YearMonth {
  const raw = Array.isArray(param) ? param[0] : param;
  if (raw) {
    const parsed = YearMonth.parse(raw);
    if (parsed.ok) return parsed.value;
  }
  return getContainer().kernel.clock.today().yearMonth;
}

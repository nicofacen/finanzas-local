"use client";

import { useSearchParams } from "next/navigation";
import { LocalDate, YearMonth } from "@/shared/domain";

/** Mes de la URL (?month=AAAA-MM) o el mes actual. Requiere un <Suspense> ancestro. */
export function useMonth(): YearMonth {
  const raw = useSearchParams().get("month");
  if (raw) {
    const parsed = YearMonth.parse(raw);
    if (parsed.ok) return parsed.value;
  }
  return LocalDate.fromDate(new Date()).yearMonth;
}

export function todayISO(): string {
  return LocalDate.fromDate(new Date()).toISO();
}

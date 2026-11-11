import type { LocalDate } from "../time/LocalDate";

/** Abstracción del reloj: permite tests deterministas de cálculos por fecha. */
export interface IClock {
  today(): LocalDate;
  nowISO(): string;
}

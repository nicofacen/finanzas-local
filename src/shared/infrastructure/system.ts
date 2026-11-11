import { LocalDate, type IClock, type IIdGenerator } from "@/shared/domain";

export class UuidGenerator implements IIdGenerator {
  next(): string {
    return globalThis.crypto.randomUUID(); // disponible en navegadores modernos y Node ≥ 19
  }
}

export class SystemClock implements IClock {
  today(): LocalDate {
    return LocalDate.fromDate(new Date());
  }
  nowISO(): string {
    return new Date().toISOString();
  }
}

/** Reloj fijo para tests y para el seed reproducible. */
export class FixedClock implements IClock {
  constructor(private readonly date: LocalDate) {}
  today() {
    return this.date;
  }
  nowISO() {
    return `${this.date.toISO()}T12:00:00.000Z`;
  }
}

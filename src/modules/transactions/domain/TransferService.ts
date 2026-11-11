import { DomainError, LocalDate, Money, err, ok, type Result } from "@/shared/domain";
import type { Account } from "@/modules/accounts/domain";
import { Transaction } from "./Transaction";

export interface TransferInput {
  transferGroupId: string;
  outgoingId: string;
  incomingId: string;
  from: Account;
  to: Account;
  date: LocalDate;
  /** Monto debitado en la moneda de la cuenta origen. */
  amount: Money;
  /** Monto acreditado en la moneda destino (obligatorio si las monedas difieren). */
  receivedAmount: Money | null;
  /** Valor en moneda base (para reportes). */
  baseAmount: Money;
  description: string | null;
  createdAt: string;
}

export interface TransferResult {
  outgoing: Transaction;
  incoming: Transaction;
}

/**
 * Servicio de dominio: una transferencia involucra dos agregados (cuentas),
 * por eso la regla no pertenece a ninguno de ellos individualmente.
 * Muta las cuentas en memoria; la persistencia atómica la garantiza la UoW.
 */
export class TransferService {
  execute(input: TransferInput): Result<TransferResult, DomainError> {
    const { from, to } = input;
    if (from.id === to.id) return err(DomainError.validation("Origen y destino deben ser cuentas distintas"));

    let received = input.receivedAmount;
    if (from.currency.equals(to.currency)) {
      received = input.amount;
    } else if (!received) {
      return err(
        new DomainError("CURRENCY_MISMATCH", `Indicá cuánto se acredita en ${to.currency.code} (transferencia entre monedas)`),
      );
    }

    const withdrawn = from.withdraw(input.amount);
    if (!withdrawn.ok) return withdrawn;
    const deposited = to.deposit(received);
    if (!deposited.ok) return deposited;

    const description = input.description?.trim() || `Transferencia ${from.name} → ${to.name}`;
    const out = Transaction.transferLeg(
      {
        id: input.outgoingId,
        accountId: from.id,
        date: input.date,
        amount: input.amount,
        baseAmount: input.baseAmount,
        description,
        createdAt: input.createdAt,
        transferGroupId: input.transferGroupId,
      },
      -1,
    );
    if (!out.ok) return out;
    const inc = Transaction.transferLeg(
      {
        id: input.incomingId,
        accountId: to.id,
        date: input.date,
        amount: received,
        baseAmount: input.baseAmount,
        description,
        createdAt: input.createdAt,
        transferGroupId: input.transferGroupId,
      },
      1,
    );
    if (!inc.ok) return inc;
    return ok({ outgoing: out.value, incoming: inc.value });
  }
}

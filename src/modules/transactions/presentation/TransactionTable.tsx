"use client";

import { ArrowLeftRight, CalendarClock, CreditCard, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Select, Table, Td, Th, Tr } from "@/components/ui/primitives";
import type { TransactionView } from "../application/queries";
import { MoneyText } from "@/shared/presentation/components/Money";
import { useAction } from "@/shared/presentation/useAction";
import { deleteTransactionAction, recategorizeAction } from "./actions";
import type { Option } from "./TransactionForm";

export function TransactionTable({ items, categories }: { items: TransactionView[]; categories: Option[] }) {
  const remove = useAction(deleteTransactionAction, { success: "Movimiento eliminado (saldos y sobres revertidos)" });
  const recat = useAction(recategorizeAction, { success: "Categoría actualizada" });

  if (items.length === 0) {
    return <EmptyState title="Sin movimientos este mes" description="Usá el formulario, la barra Ctrl+K o importá un CSV." />;
  }

  return (
    <Table>
      <thead>
        <tr className="border-b">
          <Th>Fecha</Th>
          <Th>Descripción</Th>
          <Th>Cuenta</Th>
          <Th>Categoría</Th>
          <Th className="text-right">Monto</Th>
          <Th />
        </tr>
      </thead>
      <tbody>
        {items.map((t) => (
          <Tr key={t.id}>
            <Td className="whitespace-nowrap text-muted-foreground tabular">{t.date.slice(8)}/{t.date.slice(5, 7)}</Td>
            <Td>
              <span className="flex items-center gap-2">
                {t.isTransfer && <ArrowLeftRight className="size-3.5 text-muted-foreground" />}
                {t.isInstallmentPurchase && <CreditCard className="size-3.5 text-muted-foreground" />}
                {t.isSubscription && <CalendarClock className="size-3.5 text-muted-foreground" />}
                {t.description}
              </span>
            </Td>
            <Td className="text-muted-foreground">{t.accountName}</Td>
            <Td>
              {t.isTransfer ? (
                <Badge>transferencia</Badge>
              ) : t.isInstallmentPurchase ? (
                <Badge tone="warning">{t.categoryName ?? "cuotas"}</Badge>
              ) : (
                <Select
                  value={t.categoryId ?? ""}
                  disabled={recat.pending}
                  onChange={(e) => void recat.run({ transactionId: t.id, categoryId: e.target.value || null })}
                  className="h-7 w-40 text-xs"
                  aria-label="Categoría"
                >
                  <option value="">Sin categoría</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              )}
            </Td>
            <Td className="text-right font-medium">
              <MoneyText value={t.amount} colored />
              {t.amount.currency !== t.baseAmount.currency && (
                <span className="block text-[11px] text-muted-foreground">{t.baseAmount.formatted}</span>
              )}
            </Td>
            <Td className="w-10">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Eliminar"
                disabled={remove.pending}
                onClick={() => {
                  const msg = t.isTransfer
                    ? "¿Eliminar la transferencia? Se revierten ambas cuentas."
                    : t.isInstallmentPurchase
                      ? "¿Eliminar la compra en cuotas? Se eliminan todas sus cuotas."
                      : "¿Eliminar este movimiento?";
                  if (confirm(msg)) void remove.run({ transactionId: t.id });
                }}
              >
                <Trash2 className="text-muted-foreground" />
              </Button>
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

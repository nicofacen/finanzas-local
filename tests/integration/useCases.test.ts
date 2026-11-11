import initSqlJs from "sql.js";
import { beforeEach, describe, expect, it } from "vitest";
import { LocalDate, Results } from "@/shared/domain";
import { buildContainer, type AppContainer } from "@/shared/infrastructure/di/container";
import { FixedClock } from "@/shared/infrastructure/system";

let c: AppContainer;
let bank: string;
let cash: string;
let card: string;
let superCat: string;
let hogar: string;

const balances = async () => {
  const list = Results.unwrap(await c.accounts.listAccounts.execute());
  return Object.fromEntries(list.map((a) => [a.name, a.balance.decimal]));
};
const overview = async (month: string) => Results.unwrap(await c.budgets.getOverview.execute({ month }));
const envelope = async (month: string, categoryId: string) =>
  (await overview(month)).envelopes.find((e) => e.categoryId === categoryId)!;

beforeEach(async () => {
  c = await buildContainer({ sqlJs: await initSqlJs(), clock: new FixedClock(LocalDate.fromISO("2026-11-11")) });
  bank = Results.unwrap(await c.accounts.createAccount.execute({ name: "Banco", type: "checking", currency: "ARS", openingBalance: "100000", aliases: ["debito"] })).id;
  cash = Results.unwrap(await c.accounts.createAccount.execute({ name: "Efectivo", type: "cash", currency: "ARS", openingBalance: "5000" })).id;
  card = Results.unwrap(await c.accounts.createAccount.execute({ name: "Visa", type: "credit_card", currency: "ARS", openingBalance: "0", creditLimit: "500000", closingDay: 24, aliases: ["visa"] })).id;
  superCat = Results.unwrap(await c.budgets.createCategory.execute({ name: "Supermercado", group: "Día a día", kind: "variable" })).id;
  hogar = Results.unwrap(await c.budgets.createCategory.execute({ name: "Hogar", group: "Casa", kind: "variable" })).id;
});

describe("RecordExpenseUseCase + Unit of Work", () => {
  it("registra el gasto, debita la cuenta y actualiza el sobre en una sola transacción", async () => {
    const r = await c.transactions.recordExpense.execute({ accountId: bank, amount: "15.000,50", description: "Coto", categoryId: superCat });
    expect(r.ok).toBe(true);
    expect((await balances()).Banco).toBe("84999.50");
    expect((await envelope("2026-11", superCat)).activity.decimal).toBe("-15000.50");
  });

  it("si una regla de negocio falla, NO persiste nada (rollback)", async () => {
    const r = await c.transactions.recordExpense.execute({ accountId: cash, amount: "9000", description: "Algo caro", categoryId: superCat });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INSUFFICIENT_FUNDS");
    expect((await balances()).Efectivo).toBe("5000.00");
    expect((await envelope("2026-11", superCat)).activity.decimal).toBe("0.00");
    const list = Results.unwrap(await c.transactions.listTransactions.execute({ month: "2026-11" }));
    expect(list.items).toHaveLength(0);
  });

  it("aplica reglas de categorización automáticamente", async () => {
    await c.rules.createRule.execute({ name: "Super", matchMode: "all", conditions: [{ field: "description", operator: "contains", value: "carrefour" }], categoryId: superCat });
    const r = Results.unwrap(await c.transactions.recordExpense.execute({ accountId: bank, amount: "2000", description: "CARREFOUR EXPRESS" }));
    expect(r.categoryId).toBe(superCat);
    expect(r.appliedRuleId).not.toBeNull();
  });
});

describe("CreateInstallmentPurchaseUseCase", () => {
  it("carga la deuda total en la tarjeta y proyecta cada cuota en el sobre de su mes", async () => {
    // Compra el 26/11 con cierre el 24 → 1ª cuota en enero.
    const r = Results.unwrap(
      await c.transactions.createInstallmentPurchase.execute({ accountId: card, total: "120000", installments: 3, description: "Silla", categoryId: hogar, purchaseDate: "2026-11-26" }),
    );
    expect(r.firstInstallmentMonth).toBe("2027-01");
    expect((await balances()).Visa).toBe("-120000.00");
    expect((await envelope("2026-12", hogar)).activity.decimal).toBe("0.00");
    expect((await envelope("2027-01", hogar)).activity.decimal).toBe("-40000.00");
    expect((await envelope("2027-03", hogar)).activity.decimal).toBe("-40000.00");

    const overviewInst = Results.unwrap(await c.transactions.installmentsOverview.execute({ months: 6 }));
    expect(overviewInst.projection.map((p) => p.amount.decimal)).toEqual(["0.00", "0.00", "40000.00", "40000.00", "40000.00", "0.00"]);
  });

  it("respeta el límite de la tarjeta", async () => {
    const r = await c.transactions.createInstallmentPurchase.execute({ accountId: card, total: "600000", installments: 6, description: "TV" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("CREDIT_LIMIT_EXCEEDED");
  });

  it("eliminar la compra revierte saldo y todas las cuotas", async () => {
    await c.transactions.createInstallmentPurchase.execute({ accountId: card, total: "90000", installments: 3, description: "Mesa", categoryId: hogar, purchaseDate: "2026-11-05" });
    const list = Results.unwrap(await c.transactions.listTransactions.execute({ month: "2026-11" }));
    Results.unwrap(await c.transactions.deleteTransaction.execute({ transactionId: list.items[0].id }));
    expect((await balances()).Visa).toBe("0.00");
    expect((await envelope("2026-12", hogar)).activity.decimal).toBe("0.00");
  });
});

describe("TransferBetweenAccountsUseCase", () => {
  it("mueve dinero atómicamente y admite monedas distintas", async () => {
    Results.unwrap(await c.accounts.setExchangeRate.execute({ currency: "USD", rate: "1000" }));
    const usd = Results.unwrap(await c.accounts.createAccount.execute({ name: "Dólares", type: "savings", currency: "USD", openingBalance: "0" })).id;
    Results.unwrap(await c.transactions.transfer.execute({ fromAccountId: bank, toAccountId: usd, amount: "50000", receivedAmount: "48" }));
    const b = await balances();
    expect(b.Banco).toBe("50000.00");
    expect(b["Dólares"]).toBe("48.00");
  });

  it("falla sin efectos si el origen no tiene fondos", async () => {
    const r = await c.transactions.transfer.execute({ fromAccountId: cash, toAccountId: bank, amount: "6000" });
    expect(r.ok).toBe(false);
    expect(await balances()).toMatchObject({ Banco: "100000.00", Efectivo: "5000.00" });
  });
});

describe("ImportBankStatementUseCase", () => {
  const csv = `Fecha;Concepto;Débito;Crédito
05/11/2026;COTO SUC 54;12.500,00;
06/11/2026;TRANSFERENCIA RECIBIDA;;50.000,00
06/11/2026;CAFE;3.000,00;
06/11/2026;CAFE;3.000,00;`;

  it("importa con autodetección, no duplica al reimportar", async () => {
    const first = Results.unwrap(await c.transactions.importStatement.execute({ accountId: bank, adapterId: "auto", content: csv }));
    expect(first).toEqual({ imported: 4, skipped: 0 });
    expect((await balances()).Banco).toBe("131500.00");

    const preview = Results.unwrap(await c.transactions.previewStatement.execute({ accountId: bank, adapterId: "auto", content: csv }));
    expect(preview.every((l) => l.duplicate)).toBe(true);
    const second = Results.unwrap(await c.transactions.importStatement.execute({ accountId: bank, adapterId: "auto", content: csv }));
    expect(second).toEqual({ imported: 0, skipped: 4 });
  });
});

describe("QuickEntryUseCase (Ctrl+K)", () => {
  it('"15000 Supermercado Debito" registra el gasto en la cuenta y categoría correctas', async () => {
    const r = Results.unwrap(await c.transactions.quickEntry.execute({ text: "15000 Supermercado Debito" }));
    expect(r).toMatchObject({ kind: "expense", accountName: "Banco", categoryName: "Supermercado" });
    expect((await balances()).Banco).toBe("85000.00");
  });

  it('"60000 Lámpara visa 3c" crea una compra en cuotas', async () => {
    const r = Results.unwrap(await c.transactions.quickEntry.execute({ text: "60000 Lámpara visa 3c" }));
    expect(r.kind).toBe("installments");
    expect((await balances()).Visa).toBe("-60000.00");
  });
});

describe("Budgets: sobres y suscripciones", () => {
  it("asignar dinero reduce el 'Listo para asignar' y pagar una suscripción la marca como pagada", async () => {
    const sueldo = Results.unwrap(await c.budgets.createCategory.execute({ name: "Sueldo", group: "Ingresos", kind: "income" })).id;
    Results.unwrap(await c.transactions.recordIncome.execute({ accountId: bank, amount: "500000", description: "Sueldo", categoryId: sueldo }));
    Results.unwrap(await c.budgets.assignToEnvelope.execute({ categoryId: superCat, month: "2026-11", amount: "200000" }));

    let o = await overview("2026-11");
    expect(o.summaries["zero-based"].headline.amount.decimal).toBe("300000.00");

    const sub = Results.unwrap(await c.budgets.createSubscription.execute({ name: "Netflix", amount: "8000", accountId: bank, billingDay: 5 })).id;
    let cal = Results.unwrap(await c.budgets.getSubscriptionCalendar.execute({ month: "2026-11" }));
    expect(cal.items[0].status).toBe("overdue");
    Results.unwrap(await c.budgets.paySubscription.execute({ subscriptionId: sub, month: "2026-11" }));
    cal = Results.unwrap(await c.budgets.getSubscriptionCalendar.execute({ month: "2026-11" }));
    expect(cal.items[0].status).toBe("paid");
    const again = await c.budgets.paySubscription.execute({ subscriptionId: sub, month: "2026-11" });
    expect(again.ok).toBe(false);

    o = await overview("2026-11");
    // Safe-to-spend: 500.000 − 8.000 (suscripción) − 0 variables
    expect(o.summaries["safe-to-spend"].headline.amount.decimal).toBe("492000.00");
  });
});

describe("Seed + backup", () => {
  it("el seed corre completo y el backup JSON restaura idéntico", async () => {
    const seeded = await c.system.seedDemoData.execute({ reset: true });
    expect(seeded.ok).toBe(true);
    const before = await balances();
    const doc = Results.unwrap(await c.system.exportBackup.execute());
    Results.unwrap(await c.system.resetData.execute());
    expect(Object.keys(await balances())).toHaveLength(0);
    Results.unwrap(await c.system.restoreBackup.execute({ json: JSON.stringify(doc) }));
    expect(await balances()).toEqual(before);

    const dash = Results.unwrap(await c.analytics.getDashboard.execute({ month: "2026-11" }));
    expect(dash.insights.some((i) => i.kind === "ant_expense")).toBe(true);
  });
});

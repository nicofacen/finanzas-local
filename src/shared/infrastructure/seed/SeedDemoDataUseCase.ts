import type { AccountsModule } from "@/modules/accounts/infrastructure/accounts.module";
import type { BudgetsModule } from "@/modules/budgets/infrastructure/budgets.module";
import type { RulesModule } from "@/modules/rules/infrastructure/rules.module";
import type { TransactionsModule } from "@/modules/transactions/infrastructure/transactions.module";
import { DomainError, LocalDate, YearMonth, err, ok, type Result } from "@/shared/domain";
import type { IDataMaintenance } from "@/shared/application/ports";
import type { UseCase } from "@/shared/application/UseCase";
import type { SharedKernel } from "../di/SharedKernel";

interface SeedModules {
  accounts: AccountsModule["useCases"];
  transactions: TransactionsModule["useCases"];
  budgets: BudgetsModule["useCases"];
  rules: RulesModule["useCases"];
}

/** PRNG determinístico (mulberry32): el seed genera siempre los mismos datos. */
function prng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Datos de demostración generados A TRAVÉS de los casos de uso (no con INSERTs
 * directos): así los saldos, sobres y cuotas quedan consistentes. Todo corre
 * dentro de una única UoW: o se carga todo, o nada.
 */
export class SeedDemoDataUseCase implements UseCase<{ reset: boolean }, { transactions: number }> {
  constructor(
    private readonly m: SeedModules,
    private readonly kernel: SharedKernel,
    private readonly maintenance: IDataMaintenance,
  ) {}

  async execute({ reset }: { reset: boolean }): Promise<Result<{ transactions: number }, DomainError>> {
    if (!reset && !(await this.maintenance.isEmpty())) {
      return err(DomainError.conflict("La base ya tiene datos. Usá 'limpiar y cargar demo' para reemplazarlos."));
    }
    return this.kernel.uow.transaction(async () => {
      await this.maintenance.wipeAll();
      return this.seed();
    });
  }

  private async seed(): Promise<Result<{ transactions: number }, DomainError>> {
    const { accounts, budgets, rules, transactions: tx } = this.m;
    const rand = prng(42);
    const between = (min: number, max: number) => Math.round((min + rand() * (max - min)) / 10) * 10;
    let count = 0;
    const must = async <T>(r: Promise<Result<T, DomainError>>, what: string): Promise<T> => {
      const res = await r;
      if (!res.ok) throw new Error(`Seed falló en "${what}": ${res.error.message}`);
      return res.value;
    };

    await this.kernel.settings.update({ budgetMethodology: "zero-based" });
    await must(accounts.setExchangeRate.execute({ currency: "USD", rate: "1450" }), "tipo de cambio");

    // ── Cuentas ──
    const acc = {
      bank: (await must(accounts.createAccount.execute({ name: "Cuenta Sueldo", type: "checking", currency: "ARS", openingBalance: "650000", aliases: ["debito", "banco", "sueldo"] }), "cuenta")).id,
      cash: (await must(accounts.createAccount.execute({ name: "Efectivo", type: "cash", currency: "ARS", openingBalance: "60000", aliases: ["cash", "efvo"] }), "cuenta")).id,
      wallet: (await must(accounts.createAccount.execute({ name: "Billetera Virtual", type: "wallet", currency: "ARS", openingBalance: "40000", aliases: ["mp", "billetera", "qr"] }), "cuenta")).id,
      card: (await must(accounts.createAccount.execute({ name: "Visa", type: "credit_card", currency: "ARS", openingBalance: "0", creditLimit: "3000000", closingDay: 24, aliases: ["tarjeta", "credito"] }), "cuenta")).id,
      usd: (await must(accounts.createAccount.execute({ name: "Ahorro USD", type: "savings", currency: "USD", openingBalance: "1200", aliases: ["dolares", "usd"] }), "cuenta")).id,
      invest: (await must(accounts.createAccount.execute({ name: "Inversiones", type: "investment", currency: "ARS", openingBalance: "2500000", aliases: ["fci"] }), "cuenta")).id,
    };

    // ── Categorías ──
    const cat: Record<string, string> = {};
    const categories: [string, string, "income" | "fixed" | "variable" | "savings"][] = [
      ["Sueldo", "Ingresos", "income"],
      ["Extras", "Ingresos", "income"],
      ["Alquiler", "Vivienda", "fixed"],
      ["Servicios", "Vivienda", "fixed"],
      ["Suscripciones", "Vivienda", "fixed"],
      ["Supermercado", "Día a día", "variable"],
      ["Restaurantes", "Día a día", "variable"],
      ["Transporte", "Día a día", "variable"],
      ["Café y snacks", "Día a día", "variable"],
      ["Salud", "Bienestar", "variable"],
      ["Ocio", "Bienestar", "variable"],
      ["Ropa", "Personal", "variable"],
      ["Hogar", "Personal", "variable"],
      ["Fondo de emergencia", "Ahorro", "savings"],
    ];
    for (const [name, group, kind] of categories) {
      cat[name] = (await must(budgets.createCategory.execute({ name, group, kind }), `categoría ${name}`)).id;
    }

    // ── Reglas de autocategorización ──
    const ruleDefs: [string, string, string, string | null, string | null][] = [
      ["Uber / Cabify", "uber|cabify|didi", "Transporte", null, null],
      ["Supermercados", "coto|carrefour|\\bdia\\b|jumbo|chango", "Supermercado", null, null],
      ["Cafeterías", "cafe|starbucks|havanna", "Café y snacks", null, null],
      ["Streaming", "netflix|spotify|disney|max", "Suscripciones", null, null],
      ["Farmacias", "farmacia|farmacity", "Salud", null, null],
      ["Delivery", "pedidosya|rappi", "Restaurantes", null, "Delivery"],
    ];
    for (const [name, regex, category, , rename] of ruleDefs) {
      await must(
        rules.createRule.execute({
          name,
          matchMode: "all",
          conditions: [{ field: "description", operator: "regex", value: regex }],
          categoryId: cat[category],
          renameTo: rename,
        }),
        `regla ${name}`,
      );
    }
    await must(
      rules.createRule.execute({
        name: "Kiosco (gasto hormiga)",
        matchMode: "all",
        conditions: [
          { field: "description", operator: "contains", value: "kiosco" },
          { field: "amount", operator: "lte", value: "6000" },
        ],
        categoryId: cat["Café y snacks"],
      }),
      "regla kiosco",
    );

    // ── Suscripciones y metas ──
    const today = this.kernel.clock.today();
    const current = today.yearMonth;
    const start = current.addMonths(-3);
    const subs = [
      ["Netflix", "8500", acc.card, "Suscripciones", 5],
      ["Spotify", "4200", acc.card, "Suscripciones", 12],
      ["Gimnasio", "35000", acc.bank, "Ocio", 10],
      ["Internet y TV", "28000", acc.bank, "Servicios", 15],
    ] as const;
    const subIds: string[] = [];
    for (const [name, amount, accountId, category, day] of subs) {
      subIds.push(
        (await must(
          budgets.createSubscription.execute({ name, amount, accountId, categoryId: cat[category], billingDay: day, startMonth: start.toString() }),
          `suscripción ${name}`,
        )).id,
      );
    }
    await must(budgets.createSavingsGoal.execute({ name: "Fondo de emergencia", target: "3000000", saved: "600000", monthlyContribution: "150000" }), "meta");
    await must(
      budgets.createSavingsGoal.execute({ name: "Vacaciones", target: "1800000", saved: "300000", monthlyContribution: "200000", targetMonth: current.addMonths(8).toString() }),
      "meta",
    );

    // ── Movimientos mes a mes ──
    const assignments: Record<string, string> = {
      Alquiler: "420000", Servicios: "75000", Suscripciones: "50000", Supermercado: "300000",
      Restaurantes: "80000", Transporte: "55000", "Café y snacks": "30000", Salud: "35000",
      Ocio: "75000", Ropa: "30000", Hogar: "155000", "Fondo de emergencia": "150000",
    };

    for (const month of YearMonth.range(start, current)) {
      const isCurrent = month.equals(current);
      const lastDay = isCurrent ? today.day : month.daysInMonth;
      const day = (d: number) => (d <= lastDay ? LocalDate.fromISO(`${month}-${String(d).padStart(2, "0")}`).toISO() : null);
      const expense = async (d: number, accountId: string, amount: number, description: string, category?: string) => {
        const date = day(d);
        if (!date) return;
        await must(tx.recordExpense.execute({ accountId, amount: String(amount), date, description, categoryId: category ? cat[category] : null }), description);
        count++;
      };

      // Ingresos
      const salaryDay = day(1);
      if (salaryDay) {
        await must(tx.recordIncome.execute({ accountId: acc.bank, amount: "1450000", date: salaryDay, description: "Sueldo", categoryId: cat.Sueldo }), "sueldo");
        count++;
      }
      if (rand() > 0.5 && day(18)) {
        await must(tx.recordIncome.execute({ accountId: acc.wallet, amount: String(between(60000, 140000)), date: day(18)!, description: "Trabajo freelance", categoryId: cat.Extras }), "extra");
        count++;
      }

      // Presupuesto (sobres)
      for (const [name, amount] of Object.entries(assignments)) {
        await must(budgets.assignToEnvelope.execute({ categoryId: cat[name], month: month.toString(), amount }), "asignación");
      }

      // Transferencias: fondeo de la billetera y compra de dólares
      if (day(2)) {
        await must(tx.transfer.execute({ fromAccountId: acc.bank, toAccountId: acc.wallet, amount: "120000", date: day(2)!, description: "Carga billetera" }), "transferencia");
        await must(tx.transfer.execute({ fromAccountId: acc.bank, toAccountId: acc.cash, amount: "30000", date: day(2)!, description: "Extracción cajero" }), "extracción");
        count += 4;
      }
      if (day(5)) {
        await must(tx.transfer.execute({ fromAccountId: acc.bank, toAccountId: acc.usd, amount: "145000", receivedAmount: "100", date: day(5)!, description: "Compra USD ahorro" }), "compra usd");
        count += 2;
      }

      // Gastos fijos
      await expense(3, acc.bank, 420000, "Alquiler departamento", "Alquiler");
      await expense(8, acc.bank, between(28000, 42000), "Edenor luz", "Servicios");
      await expense(9, acc.bank, between(12000, 18000), "Metrogas", "Servicios");

      // Gastos variables (las reglas categorizan automáticamente)
      for (const d of [4, 11, 18, 25]) await expense(d, acc.card, between(55000, 95000), rand() > 0.5 ? "COTO Sucursal 54" : "Carrefour Market");
      for (const d of [6, 13, 20, 27]) await expense(d, acc.wallet, between(3500, 9000), "UBER *TRIP");
      for (const d of [7, 21]) await expense(d, acc.card, between(18000, 42000), "PEDIDOSYA*Restaurante");
      await expense(14, acc.card, between(15000, 30000), "Farmacity", undefined);
      await expense(16, acc.cash, between(8000, 20000), "Cine y salida", "Ocio");
      // Gastos hormiga: más frecuentes en el mes actual para disparar la alerta.
      const coffeeDays = isCurrent ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : [3, 10, 17, 24];
      for (const d of coffeeDays) await expense(d, acc.wallet, between(2800, 4800), "Café Martínez", undefined);
      for (const d of isCurrent ? [2, 5, 8, 10] : [12, 26]) await expense(d, acc.cash, between(1500, 3500), "Kiosco", undefined);
      if (isCurrent) await expense(Math.min(9, lastDay), acc.card, 128000, "Cena aniversario", "Restaurantes");

      // Suscripciones pagadas cuando ya vencieron
      for (const [i, id] of subIds.entries()) {
        if (subs[i][4] <= lastDay) {
          await must(budgets.paySubscription.execute({ subscriptionId: id, month: month.toString() }), `pago ${subs[i][0]}`);
          count++;
        }
      }

      // Compras en cuotas
      if (month.equals(start) && day(20)) {
        await must(tx.createInstallmentPurchase.execute({ accountId: acc.card, total: "900000", installments: 6, description: "Heladera no frost", categoryId: cat.Hogar, purchaseDate: day(20)! }), "cuotas heladera");
        count++;
      }
      if (month.equals(current.previous()) && day(12)) {
        await must(tx.createInstallmentPurchase.execute({ accountId: acc.card, total: "180000", installments: 3, description: "Zapatillas running", categoryId: cat.Ropa, purchaseDate: day(12)! }), "cuotas zapatillas");
        count++;
      }

      // Pago del resumen de la tarjeta (mes cerrado)
      if (!isCurrent && day(10)) {
        await must(tx.transfer.execute({ fromAccountId: acc.bank, toAccountId: acc.card, amount: "380000", date: LocalDate.fromISO(`${month.next()}-10`).isAfter(today) ? day(28)! : `${month.next()}-10`, description: "Pago resumen Visa" }), "pago tarjeta");
        count += 2;
      }
    }

    return ok({ transactions: count });
  }
}

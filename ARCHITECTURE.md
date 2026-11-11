# Finanzas Local-First — Arquitectura

Monolito modular con Clean/Hexagonal Architecture. Cada módulo tiene 4 capas y
las dependencias apuntan **siempre hacia el dominio**.

## Árbol de directorios

```
├── drizzle/                         Migraciones SQL generadas (drizzle-kit)
├── scripts/                         embed-migrations.ts (SQL → TS), copy-sqljs.ts (WASM → public/)
├── .github/workflows/pages.yml      Tests + build estático + publicación en GitHub Pages
├── tests/integration/               Casos de uso contra SQLite en memoria (sql.js)
└── src/
    ├── app/                         Next.js App Router (rutas finas: sólo componen vistas)
    │   ├── page.tsx                 Dashboard
    │   ├── budget/ transactions/ installments/ subscriptions/
    │   ├── accounts/ rules/ import/ settings/
    ├── components/ui/               Primitivas estilo shadcn/ui (Button, Card, Dialog, Table…)
    ├── shared/
    │   ├── domain/                  Núcleo compartido — TypeScript puro
    │   │   ├── Result.ts            Result<T,E>, ok/err, combine
    │   │   ├── DomainError.ts       Errores como valor + InvariantViolation
    │   │   ├── Specification.ts     ISpecification + And/Or/Not
    │   │   ├── money/               Money (bigint), Currency, ExchangeRate, CurrencyConverter
    │   │   ├── time/                LocalDate, YearMonth
    │   │   └── ports/               IUnitOfWork, IIdGenerator, IClock, ISettings*
    │   ├── application/             UseCase<I,O>, MoneyView, backup/reset use cases
    │   ├── infrastructure/
    │   │   ├── persistence/         schema.ts (Drizzle), database.ts (sql.js + migraciones), SqliteUnitOfWork, mappers
    │   │   ├── backup/              SqliteBackupService (JSON + archivo .sqlite)
    │   │   ├── seed/                SeedDemoDataUseCase (usa los casos de uso reales)
    │   │   └── di/container.ts      ★ COMPOSITION ROOT
    │   └── presentation/            runAction (Zod → caso de uso → ActionResult), CommandBar Ctrl+K, layout
    └── modules/
        ├── accounts/       domain: Account, AccountType, ports | application: Create/List, SetExchangeRate, CurrencyConversionService
        ├── transactions/   domain: Transaction, CreditCardPurchase (Creator), InstallmentPlan, Installment,
        │                           TransferService, QuickEntryParser, ImportFingerprint, ports (ICsvParserAdapter, IBudgetLedgerPort)
        │                   application: RecordExpense/Income, TransferBetweenAccounts, CreateInstallmentPurchase,
        │                                Preview/ImportBankStatement, QuickEntry, Delete/Recategorize, queries
        │                   infrastructure: repos Drizzle, csv/ (adaptadores), SqlBudgetDataSource
        ├── budgets/        domain: Category, BudgetEnvelope (rollover), Subscription, SavingsGoal,
        │                           strategies/ IBudgetingStrategy, ZeroBasedEnvelopeStrategy, SafeToSpendStrategy
        │                   application: GetBudgetOverview, AssignToEnvelope, PaySubscription, metas…
        │                   infrastructure: repos Drizzle, BudgetLedgerAdapter
        ├── rules/          domain: RuleSpecifications, CategorizationRule (ICategorizationRule), CategorizationEngine
        │                   application: CRUD de reglas + RuleBasedCategorySuggester
        └── analytics/      domain: SpendingPace, savingsRate, netWorth, AntExpenseDetector, MovingAverageDeviationDetector
                            application: GetDashboardUseCase | infrastructure: SqlAnalyticsReadModel (CQRS liviano)
```

Cada módulo además tiene `infrastructure/<modulo>.module.ts` (fábrica) y
`presentation/` (acciones con Zod que corren en el navegador + componentes React).

## Cómo se conectan los módulos

Los módulos no se llaman entre sí por implementaciones concretas: el consumidor
define un **puerto** y el proveedor lo implementa. Sólo el composition root conoce ambos lados.

| Puerto (definido por) | Implementación (provista por) | Para qué |
|---|---|---|
| `IBudgetLedgerPort` (transactions) | `BudgetLedgerAdapter` (budgets) | Un gasto/cuota mueve la actividad del sobre |
| `ICategorySuggester` (transactions) | `RuleBasedCategorySuggester` (rules) | Autocategorizar carga rápida e importaciones |
| `IBudgetDataSource` (budgets) | `SqlBudgetDataSource` (transactions) | Ingresos, gastos y cuotas del mes |
| `IExpenseRecorder` (budgets) | adaptador → `RecordExpenseUseCase` (container) | Pagar una suscripción registra un gasto |
| `ITransactionDeletedHandler` (transactions) | `SubscriptionPaymentCleanup` (budgets) | Borrar el gasto reabre la suscripción |

## Contenedor de Inyección de Dependencias

`src/shared/infrastructure/di/container.ts`:

1. `buildContainer({ sqlJs, storage?, clock? })` recibe el motor SQLite/WASM ya inicializado, carga la base
   guardada, aplica migraciones pendientes (`user_version`) y arma el `SharedKernel` (UoW, IdGenerator, Clock, Settings).
2. Ensambla en orden: `accounts` → puertos de `budgets` → `rules` → `transactions` → casos de uso de `budgets` → `analytics`.
3. `di/browser.ts` → `getContainer()`: singleton por pestaña; carga `sql-wasm` desde `public/sqljs` y
   persiste la base en **IndexedDB** tras cada escritura.
4. Tests: `buildContainer({ sqlJs: await initSqlJs(), clock })` con la base en memoria.

Flujo de una acción: formulario → `runAction` (valida con Zod, **en cola de a una**) →
`container.<modulo>.<casoDeUso>.execute()` → `IUnitOfWork.transaction()` → entidades de dominio → repositorios →
`Result` → persistencia en IndexedDB → `invalidateAll()` (las pantallas se recargan con `useQuery`).

## Decisiones clave

- **Dinero**: `Money` usa `bigint` en unidades menores; SQLite guarda `INTEGER`. Los `number` sólo existen para graficar.
- **Unit of Work**: `BEGIN/COMMIT/ROLLBACK`; una UoW invocada dentro de otra se une a la externa. Como no hay
  `AsyncLocalStorage` en el navegador, `runAction` serializa las acciones del usuario para que ese anidamiento sea siempre real.
  Un `Err` o una excepción revierte todo (saldo, transacción, sobres, cuotas).
- **Local-first en el navegador**: sin servidor; la base SQLite vive en IndexedDB de cada dispositivo (sin sincronización).
- **Cuotas**: la tarjeta registra la deuda total al comprar; el presupuesto recibe cada cuota en *su* mes.
  La 1ª cuota respeta el día de cierre de la tarjeta.
- **Multimoneda**: cada transacción guarda su monto en la moneda de la cuenta y en moneda base (al TC del momento).
- **Rollover**: el sobrante positivo pasa al mes siguiente; el sobregiro se descuenta de “Listo para asignar”.

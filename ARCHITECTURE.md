# Finanzas Local-First — Arquitectura

Aplicación que corre **100% en el navegador** (sin servidor), dividida en dos partes que se ven
directamente en la raíz del proyecto:

| | Qué es | Carpeta |
|---|---|---|
| **Frontend** | Todo lo que el usuario ve y toca: páginas, componentes, formularios, gráficos, estilos | `frontend/` |
| **Backend** | Toda la lógica y los datos: reglas de negocio, casos de uso, base de datos SQLite | `backend/` |

Aunque el backend se ejecuta dentro del navegador (SQLite/WASM guardado en IndexedDB), está
separado como si fuera un servidor: **el backend no sabe que existe una interfaz**. Si algún día
se agrega un servidor real, `backend/` se puede mover a su propio servicio casi sin cambios.

## Árbol de directorios
La raíz tiene solo tres carpetas: `frontend/`, `backend/` y `.github/`.

```
├── frontend/                        ══════ FRONTEND (lo que se ve) ══════
│   ├── app/                         Rutas de Next.js (una carpeta por pantalla: lo exige Next)
│   ├── components/                  Piezas visuales: Button, Card, Dialog… + Sidebar, CommandBar (Ctrl+K), Query…
│   ├── modules/                     Pantallas y formularios por funcionalidad (un archivo cada uno)
│   │   ├── <modulo>Actions.ts       Comandos del módulo (esquemas Zod → casos de uso)
│   │   └── *.tsx                    BudgetBoard, AccountsBoard, TransactionForm, RulesBoard, Charts…
│   ├── shared/                      Lógica de la interfaz
│   │   ├── action.ts                runAction: valida con Zod → llama al backend → persiste
│   │   ├── data.ts                  useQuery / invalidateAll (recarga de datos)
│   │   └── useAction.ts, month.ts, systemActions.ts
│   ├── public/                      Archivos estáticos (sqljs/ se genera al compilar)
│   └── next.config.ts, postcss.config.mjs, tsconfig.json
│
├── backend/                         ══════ BACKEND (la lógica y los datos) ══════
│   ├── shared/
│   │   ├── domain/                  Núcleo puro: Money, Currency, Result, YearMonth, puertos…
│   │   ├── application/             UseCase<I,O>, vistas serializables (MoneyView), backup
│   │   └── infrastructure/
│   │       ├── persistence/         schema.ts (Drizzle), database.ts (sql.js), SqliteUnitOfWork
│   │       ├── backup/              Backup JSON / archivo .sqlite
│   │       ├── seed/                Datos de demostración
│   │       └── di/                  ★ container.ts (composition root) + browser.ts (IndexedDB)
│   ├── modules/<modulo>/            accounts · transactions · budgets · rules · analytics
│   │   ├── domain/                  Entidades y reglas de negocio + puertos (interfaces)
│   │   ├── application/             Casos de uso: una clase por acción del usuario
│   │   └── infrastructure/          Repositorios Drizzle + <modulo>.module.ts (fábrica)
│   ├── migrations/                  Migraciones SQL (fuente de verdad del esquema)
│   ├── tests/                       useCases.test.ts (integración) y boundaries.test.ts (arquitectura)
│   └── drizzle.config.ts
│
├── .github/workflows/pages.yml      CI: tests + build estático + publicación en GitHub Pages
├── ARCHITECTURE.md, README.md       Documentación
└── package.json, tsconfig.json, vitest.config.ts, prepare-assets.ts   Configuración y herramientas
```

Los tests unitarios del dominio viven junto al código (`Foo.test.ts` al lado de `Foo.ts`).

## Reglas de dependencia (verificadas automáticamente)
`backend/tests/boundaries.test.ts` falla si se rompe alguna:

```
frontend ──► backend/application, backend/domain, backend/…/di
                  │
backend/infrastructure ──► backend/application ──► backend/domain
```

1. **El backend nunca importa del frontend**, ni React, ni Next, ni librerías de UI.
2. **El dominio es puro:** solo importa otros archivos de dominio. Sin librerías, sin base de datos.
3. **Application no importa infrastructure:** depende solo de interfaces (puertos).
4. **El frontend solo toca del backend** `application`, `domain` y el contenedor (`di/`); nunca los repositorios.

Alias de importación: `@frontend/…` → `frontend/…` y `@backend/…` → `backend/…`.

## Cómo se conectan los módulos del backend
Los módulos no se llaman entre sí por implementaciones concretas: el consumidor define un
**puerto** y el proveedor lo implementa. Solo el composition root conoce ambos lados.

| Puerto (definido por) | Implementación (provista por) | Para qué |
|---|---|---|
| `IBudgetLedgerPort` (transactions) | `BudgetLedgerAdapter` (budgets) | Un gasto/cuota mueve la actividad del sobre |
| `ICategorySuggester` (transactions) | `RuleBasedCategorySuggester` (rules) | Autocategorizar carga rápida e importaciones |
| `IBudgetDataSource` (budgets) | `SqlBudgetDataSource` (transactions) | Ingresos, gastos y cuotas del mes |
| `IExpenseRecorder` (budgets) | adaptador → `RecordExpenseUseCase` (container) | Pagar una suscripción registra un gasto |
| `ITransactionDeletedHandler` (transactions) | `SubscriptionPaymentCleanup` (budgets) | Borrar el gasto reabre la suscripción |

## Contenedor de Inyección de Dependencias
`backend/shared/infrastructure/di/container.ts`:

1. `buildContainer({ sqlJs, storage?, clock? })` recibe el motor SQLite/WASM ya inicializado, carga la base
   guardada, aplica migraciones pendientes (`user_version`) y arma el `SharedKernel` (UoW, IdGenerator, Clock, Settings).
2. Ensambla en orden: `accounts` → puertos de `budgets` → `rules` → `transactions` → casos de uso de `budgets` → `analytics`.
3. `di/browser.ts` → `getContainer()`: singleton por pestaña; carga `sql-wasm` desde `frontend/public/sqljs` y
   persiste la base en **IndexedDB** tras cada escritura.
4. Tests: `buildContainer({ sqlJs: await initSqlJs(), clock })` con la base en memoria.

**Flujo de una acción:** formulario (frontend) → `runAction` (valida con Zod, en cola de a una) →
`container.<modulo>.<casoDeUso>.execute()` (backend) → `IUnitOfWork.transaction()` → entidades de dominio →
repositorios → `Result` → persistencia en IndexedDB → `invalidateAll()` (las pantallas se recargan con `useQuery`).

## Convenciones de nombres
| Elemento | Convención | Ejemplo |
|---|---|---|
| Componentes React | `PascalCase.tsx` | `BudgetBoard.tsx` |
| Entidades y casos de uso | `PascalCase.ts` | `Account.ts`, `RecordExpenseUseCase.ts` |
| Puertos / implementaciones | `I…` / prefijo de tecnología | `IAccountRepository` / `DrizzleAccountRepository` |
| Comandos del frontend | `<modulo>Actions.ts` | `budgetsActions.ts` |
| Hooks | `useXxx` | `useQuery`, `useAction` |
| Utilidades | `camelCase.ts` | `helpers.ts`, `mappers.ts` |
| Carpetas | minúsculas | `domain/`, `application/` |
| Imports | siempre con alias | `@backend/shared/domain`, `@frontend/shared/data` |

## Decisiones clave
- **Dinero**: `Money` usa `bigint` en unidades menores; SQLite guarda `INTEGER`. Los `number` solo existen para graficar.
- **Unit of Work**: `BEGIN/COMMIT/ROLLBACK`; una UoW invocada dentro de otra se une a la externa. Como no hay
  `AsyncLocalStorage` en el navegador, `runAction` serializa las acciones del usuario para que ese anidamiento sea siempre real.
  Un `Err` o una excepción revierte todo (saldo, transacción, sobres, cuotas).
- **Local-first en el navegador**: sin servidor; la base SQLite vive en IndexedDB de cada dispositivo (sin sincronización).
- **Cuotas**: la tarjeta registra la deuda total al comprar; el presupuesto recibe cada cuota en *su* mes.
- **Multimoneda**: cada transacción guarda su monto en la moneda de la cuenta y en moneda base (al tipo de cambio del momento).
- **Rollover**: el sobrante positivo pasa al mes siguiente; el sobregiro se descuenta de “Listo para asignar”.
- **Pocas carpetas**: un solo `package.json`; frontend y backend se compilan juntos
  (`next dev frontend` / `next build frontend`), sin la complejidad de workspaces.

## Si algún día se agrega un servidor real
`backend/` ya está aislado: se convertiría en un paquete propio (con su `package.json`) o en una API,
el dominio y los casos de uso se reutilizan tal cual y solo se reemplaza `infrastructure/` (base de datos y
autenticación). El frontend pasaría a llamar a la API en vez del contenedor local.

# Finanzas Local-First

Gestión y planificación de gastos mensuales, 100% local (SQLite), inspirada en
Actual Budget, YNAB, Monarch Money y Firefly III. Ver [ARCHITECTURE.md](ARCHITECTURE.md).

## Requisitos
Node.js 20+ (probado con Node 26).

## Uso
```bash
npm install
npm run db:seed      # opcional: 4 meses de datos de demostración
npm run dev          # http://localhost:3000
```

| Comando | Qué hace |
|---|---|
| `npm test` | Tests unitarios (dominio) + integración (casos de uso con SQLite en memoria) |
| `npm run lint` | Chequeo de tipos |
| `npm run build && npm start` | Build de producción |
| `npm run db:generate` | Genera una migración tras cambiar `schema.ts` |
| `npm run db:reset` | Deja la base vacía |

La base vive en `data/finanzas.db` (configurable con `FINANZAS_DB_PATH`).

## Carga rápida (Ctrl+K / Cmd+K)
- `15000 Supermercado Débito` → gasto en la cuenta con alias “débito”
- `+850000 Sueldo banco` → ingreso
- `usd 20 Netflix visa` → convierte con el tipo de cambio cargado
- `120000 Zapatillas visa 6c ayer` → compra en 6 cuotas, fechada ayer
- `2000 Kiosco 03/11` → fecha explícita

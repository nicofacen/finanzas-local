# Finanzas Local-First

Gestión y planificación de gastos mensuales que corre **100% en tu navegador**
(SQLite/WASM guardado en IndexedDB), inspirada en Actual Budget, YNAB, Monarch Money
y Firefly III. No hay servidor ni cuentas: tus datos no salen de tu dispositivo.
Ver [ARCHITECTURE.md](ARCHITECTURE.md).

## Uso local
Requiere Node.js 20+.
```bash
npm install
npm run dev          # http://localhost:3000
```

| Comando | Qué hace |
|---|---|
| `npm test` | Tests unitarios (dominio) + integración (casos de uso con SQLite en memoria) |
| `npm run lint` | Chequeo de tipos |
| `npm run build` | Exportación estática en `out/` |
| `npm run db:generate` | Genera una migración tras cambiar `schema.ts` (y la embebe) |

## Publicar en GitHub Pages
1. Subí el código a GitHub (rama `main`).
2. En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Cada `git push` a `main` ejecuta `.github/workflows/pages.yml` (tests + build + publicación).
4. La URL queda en `https://<usuario>.github.io/<repositorio>/`.

## Tus datos
Viven en el navegador (IndexedDB) de cada dispositivo: no se sincronizan y se pierden si se
borran los datos del sitio. Usá **Datos y backup** para descargar un backup JSON o el archivo `.sqlite`.

## Carga rápida (Ctrl+K / Cmd+K)
- `15000 Supermercado Débito` → gasto en la cuenta con alias “débito”
- `+850000 Sueldo banco` → ingreso
- `usd 20 Netflix visa` → convierte con el tipo de cambio cargado
- `120000 Zapatillas visa 6c ayer` → compra en 6 cuotas, fechada ayer
- `2000 Kiosco 03/11` → fecha explícita

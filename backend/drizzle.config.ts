import { defineConfig } from "drizzle-kit";

// Uso: npm run db:generate  (genera la migración y la embebe para el navegador)
export default defineConfig({
  dialect: "sqlite",
  schema: "./backend/shared/infrastructure/persistence/schema.ts",
  out: "./backend/migrations",
});

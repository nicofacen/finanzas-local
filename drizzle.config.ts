import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/shared/infrastructure/persistence/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: "./data/finanzas.db" },
});

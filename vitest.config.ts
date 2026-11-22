import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@backend": at("./backend"),
      "@frontend": at("./frontend"),
    },
  },
  test: {
    // Unitarios junto al código; integración y arquitectura en backend/tests.
    include: ["backend/**/*.test.ts"],
    environment: "node",
  },
});

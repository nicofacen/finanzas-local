import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@backend": at("./backend/src"),
      "@frontend": at("./frontend"),
    },
  },
  test: {
    // Unitarios junto al código (backend/src/**), integración en backend/tests y arquitectura en tests/.
    include: ["backend/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
  },
});

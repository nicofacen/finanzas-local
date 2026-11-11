import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 es un módulo nativo: no se empaqueta, se carga desde node_modules.
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    serverActions: { bodySizeLimit: "10mb" }, // importación de CSV y restauración de backups
  },
};

export default nextConfig;

import type { NextConfig } from "next";

/**
 * Exportación estática para GitHub Pages: la app corre entera en el navegador
 * (SQLite/WASM + IndexedDB). En Pages se sirve bajo /<nombre-del-repo>, que el
 * workflow pasa en NEXT_PUBLIC_BASE_PATH. En local queda vacío.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No empaquetar estos módulos en el bundle del servidor:
  // - mssql/tedious pierde los validadores de tipos al ser bundleado
  //   (EPARAM "r.type.validate is not a function" en producción)
  // - better-sqlite3 es un módulo nativo
  serverExternalPackages: ["mssql", "tedious", "better-sqlite3"],
};

export default nextConfig;

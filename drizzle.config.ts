import { defineConfig } from "drizzle-kit";

// Configuración de drizzle-kit para la BBDD propia de la app (SQLite).
// RDBv2 (SQL Server) NO se gestiona con ORM: es solo lectura y se consulta
// con SQL directo en src/lib/rdb/queries/.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.SQLITE_PATH ?? "./data/dashboard.db",
  },
});

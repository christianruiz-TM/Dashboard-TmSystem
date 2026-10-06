// NOTA: este módulo solo debe importarse desde código de servidor
// (Server Components, Server Actions, route handlers o scripts CLI).
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

// ============================================================
// Cliente SQLite (singleton) para la BBDD propia del dashboard.
// Se auto-migra al arrancar: no hay paso manual de despliegue.
// ============================================================

const RUTA_BBDD = process.env.SQLITE_PATH ?? "./data/dashboard.db";

declare global {
  // Evita múltiples conexiones con el hot-reload de Next en desarrollo
  var __sqliteDb: ReturnType<typeof crearDb> | undefined;
}

function crearDb() {
  const rutaAbsoluta = path.resolve(/* turbopackIgnore: true */ process.cwd(), RUTA_BBDD);
  fs.mkdirSync(path.dirname(rutaAbsoluta), { recursive: true });

  const sqlite = new Database(rutaAbsoluta);
  // WAL: lecturas concurrentes sin bloquear escrituras (varios usuarios web)
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  // Aplica las migraciones pendientes de ./drizzle al arrancar
  const carpetaMigraciones = path.resolve(/* turbopackIgnore: true */ process.cwd(), "drizzle");
  if (fs.existsSync(carpetaMigraciones)) {
    try {
      migrate(db, { migrationsFolder: carpetaMigraciones });
    } catch {
      // Otro proceso migró a la vez: `next build` abre la BBDD desde varios
      // workers en paralelo y, con una migración pendiente, el segundo
      // fallaba con «table ... already exists» (06/10/2026, la 0005). La
      // segunda pasada ya la ve registrada; si el error era otro, vuelve a saltar.
      migrate(db, { migrationsFolder: carpetaMigraciones });
    }
  }

  return db;
}

export const db = globalThis.__sqliteDb ?? crearDb();
if (process.env.NODE_ENV !== "production") globalThis.__sqliteDb = db;

export * as tablas from "./schema";

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
// Se auto-migra al abrirla: no hay paso manual de despliegue.
//
// Se abre la PRIMERA VEZ QUE SE USA, no al importar el módulo (auditoría
// 11/11/2026). `next build` importa los módulos de las rutas desde varios
// procesos a la vez y cada import abría la base, cambiaba a WAL y migraba:
// de ahí el «database is locked» al compilar la imagen (cada vez más a
// menudo) y que `npm run build` migrase la SQLite del `.env` (06/10/2026).
// ============================================================

type Db = ReturnType<typeof crearDb>;

declare global {
  // Evita múltiples conexiones con el hot-reload de Next en desarrollo
  var __sqliteDb: Db | undefined;
}

function crearDb() {
  const rutaBbdd = process.env.SQLITE_PATH ?? "./data/dashboard.db";
  const rutaAbsoluta = path.resolve(/* turbopackIgnore: true */ process.cwd(), rutaBbdd);
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

let abierta: Db | undefined;

/** La base abierta (y migrada); la abre la primera vez. */
function obtenerDb(): Db {
  if (!abierta) {
    abierta = globalThis.__sqliteDb ?? crearDb();
    if (process.env.NODE_ENV !== "production") globalThis.__sqliteDb = abierta;
  }
  return abierta;
}

/**
 * La base de datos, con el mismo uso de siempre (`db.select(...)`,
 * `db.transaction(...)`): es un intermediario que la abre al primer acceso.
 */
export const db: Db = new Proxy({} as Db, {
  get(_destino, propiedad) {
    const real = obtenerDb();
    const valor = Reflect.get(real, propiedad, real);
    return typeof valor === "function" ? valor.bind(real) : valor;
  },
});

export * as tablas from "./schema";

// NOTA: solo servidor (SQLite).
import fs from "node:fs";
import path from "node:path";
import { and, eq, gt, lt, ne, or } from "drizzle-orm";
import { deserializar, serializar } from "@/lib/serializar";
import { db } from "./sqlite";
import { cacheConsultas } from "./schema";

// ============================================================
// Caché persistente de consultas de rangos cerrados (13/11/2026). La usa
// `conCache` (rdb/cache.ts) cuando el TTL es de histórico o de archivo, y la
// llena cada madrugada `npm run precalentar`. Si la SQLite falla, se sigue
// sin ella: nunca debe romper una consulta.
// ============================================================

let version: string | null = null;

/**
 * La compilación que calcula: en producción, el `.next/BUILD_ID` (el mismo en
 * `app` y en `tareas`, que comparten imagen). Tras un despliegue con otras
 * fórmulas no se lee lo de antes. En desarrollo no hay BUILD_ID: uno por
 * arranque, para no leer nunca lo calculado con código viejo.
 */
export function versionCalculos(): string {
  if (version) return version;
  version = "";
  // Solo en producción: en desarrollo puede quedar el BUILD_ID de un `npm run
  // build` viejo y el `next dev` leería resultados de otro código
  if (process.env.NODE_ENV === "production") {
    try {
      version = fs.readFileSync(path.resolve(/* turbopackIgnore: true */ process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
    } catch {
      version = "";
    }
  }
  if (!version) version = `dev-${Date.now()}`;
  return version;
}

/** El resultado guardado de `clave`, si es de esta versión y no ha caducado. */
export function leerConsultaGuardada<T>(clave: string): T | undefined {
  try {
    const fila = db
      .select({ valor: cacheConsultas.valor, version: cacheConsultas.version, caduca: cacheConsultas.caduca })
      .from(cacheConsultas)
      .where(eq(cacheConsultas.clave, clave))
      .get();
    if (!fila || fila.version !== versionCalculos() || fila.caduca <= Date.now()) return undefined;
    return deserializar<T>(fila.valor);
  } catch (e) {
    console.error("[cache] no se pudo leer la caché persistente:", e);
    return undefined;
  }
}

/** Guarda el resultado de `clave` durante `ttlMs`. */
export function guardarConsulta(clave: string, valor: unknown, ttlMs: number): void {
  try {
    const ahora = Date.now();
    const fila = {
      clave,
      version: versionCalculos(),
      valor: serializar(valor),
      caduca: ahora + ttlMs,
      calculadoAt: ahora,
    };
    db.insert(cacheConsultas)
      .values(fila)
      .onConflictDoUpdate({ target: cacheConsultas.clave, set: fila })
      .run();
  } catch (e) {
    console.error("[cache] no se pudo guardar en la caché persistente:", e);
  }
}

/** Borra lo caducado y lo de otras versiones (lo hace la tarea de madrugada). */
export function podarConsultasGuardadas(): number {
  return db
    .delete(cacheConsultas)
    .where(or(lt(cacheConsultas.caduca, Date.now()), ne(cacheConsultas.version, versionCalculos())))
    .run().changes;
}

/** Vacía la caché persistente entera (Administración → vaciar caché). */
export function vaciarConsultasGuardadas(): number {
  return db.delete(cacheConsultas).run().changes;
}

/** Cuántas hay guardadas de esta versión y vigentes (para /admin y el script). */
export function resumenConsultasGuardadas(): { vigentes: number } {
  const filas = db
    .select({ clave: cacheConsultas.clave })
    .from(cacheConsultas)
    .where(and(eq(cacheConsultas.version, versionCalculos()), gt(cacheConsultas.caduca, Date.now())))
    .all();
  return { vigentes: filas.length };
}

import { eq } from "drizzle-orm";
import { db } from "./sqlite";
import { appSettings } from "./schema";

/** Lee un ajuste clave/valor de app_settings. */
export function obtenerAjuste(clave: string, porDefecto: string): string {
  const fila = db.select().from(appSettings).where(eq(appSettings.clave, clave)).get();
  return fila?.valor ?? porDefecto;
}

/** Guarda (upsert) un ajuste. */
export function guardarAjuste(clave: string, valor: string): void {
  db.insert(appSettings)
    .values({ clave, valor })
    .onConflictDoUpdate({ target: appSettings.clave, set: { valor } })
    .run();
}

/** Umbral global de SLA en segundos (configurable en /admin). */
export function umbralSlaSeg(): number {
  return Number(obtenerAjuste("sla_umbral_seg", "20"));
}

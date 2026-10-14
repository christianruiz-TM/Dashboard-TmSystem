import { asc } from "drizzle-orm";
import { db } from "./sqlite";
import { objetivosResultados, resultadosConfig, type ResultadosConfigRow } from "./schema";
import type { ObjetivoResultados } from "@/lib/resultados-actividad";

// ============================================================
// Configuración propia de los resultados de actividad (regla 18):
// columnas y valores «no válido» por servicio, y objetivos del semáforo.
// La editan los admin en /admin/resultados.
// ============================================================

/** Configuración de todos los servicios, por nombre de servicio. */
export function configsResultados(): ResultadosConfigRow[] {
  return db.select().from(resultadosConfig).orderBy(asc(resultadosConfig.serviceName)).all();
}

/** Objetivos del semáforo (servicio o campaña). */
export function objetivosDeResultados(): (ObjetivoResultados & { id: number; notas: string | null })[] {
  return db
    .select()
    .from(objetivosResultados)
    .orderBy(
      asc(objetivosResultados.serviceName),
      asc(objetivosResultados.campaignShortname),
      asc(objetivosResultados.desde),
    )
    .all();
}

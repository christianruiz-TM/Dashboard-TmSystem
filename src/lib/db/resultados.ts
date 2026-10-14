import { asc } from "drizzle-orm";
import { db } from "./sqlite";
import { objetivosResultados, resultadosConfig, type ResultadosConfigRow } from "./schema";
import { guardarAjuste, obtenerAjuste } from "./settings";
import {
  esquemaTiposCampania,
  type ObjetivoResultados,
  type TipoCampania,
} from "@/lib/resultados-actividad";

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

/**
 * Tipos de campaña de un servicio (GH: «BBDD» = gh_bbdd_%), en app_settings
 * (`resultados.tipos.<servicio>`, JSON). Sin migración: es una lista corta
 * por cliente. Si el JSON no es válido, ninguno.
 */
export function tiposCampaniaDe(servicio: string): TipoCampania[] {
  try {
    const r = esquemaTiposCampania.safeParse(JSON.parse(obtenerAjuste(`resultados.tipos.${servicio}`, "[]")));
    return r.success ? r.data : [];
  } catch {
    return [];
  }
}

export function guardarTiposCampania(servicio: string, tipos: TipoCampania[]): void {
  guardarAjuste(`resultados.tipos.${servicio}`, JSON.stringify(tipos));
}

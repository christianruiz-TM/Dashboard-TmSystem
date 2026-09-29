import { and, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "./sqlite";
import { aggDailyCampaign } from "./schema";
import type { MetricaDiariaCampania } from "@/lib/rdb/types";
import { guardarAjuste, obtenerAjuste } from "./settings";

// ============================================================
// Agregados diarios por campaña (rellenados por el script
// scripts/aggregate-daily.ts). Evitan escanear itr_thread para
// las tendencias largas de /direccion.
//
// Las columnas horas_logadas / horas_ready de la tabla están OBSOLETAS: se
// alimentaban de un SUM por campaña de ag_in_cp_log, que multiplica el tiempo
// (~×13,8 medido). Ya no se escriben ni se leen, y al re-agregar un día sus
// filas se reescriben enteras, así que el valor inflado desaparece (queda
// NULL). La hora logada real es global y sale de
// queries/agentes.ts::horasAgenteReales. Ver regla 11 de CLAUDE.md.
// ============================================================

/**
 * REEMPLAZA los agregados de los días [desde, hasta] por `filas`, en una sola
 * transacción: borra esos días y los vuelve a escribir. Así re-ejecutar un
 * rango lo deja idéntico a RDBv2 hoy, sin filas huérfanas de campañas que ya
 * no tienen actividad ese día. `filas` debe traer TODAS las campañas del rango.
 */
export function reemplazarMetricasDiarias(
  desde: string,
  hasta: string,
  filas: MetricaDiariaCampania[],
): void {
  const fuera = filas.find((m) => m.fecha < desde || m.fecha > hasta);
  if (fuera) throw new Error(`Fila fuera del rango ${desde}..${hasta}: ${fuera.fecha}`);
  const ahora = new Date();
  db.transaction((tx) => {
    tx.delete(aggDailyCampaign)
      .where(and(gte(aggDailyCampaign.fecha, desde), lte(aggDailyCampaign.fecha, hasta)))
      .run();
    for (const m of filas) {
      tx.insert(aggDailyCampaign)
        .values({
          fecha: m.fecha,
          campaignShortname: m.campania,
          tipoCampania: m.tipo,
          interacciones: m.interacciones,
          inbound: m.inbound,
          outbound: m.outbound,
          atendidas: m.atendidas,
          abandonadas: m.abandonadas,
          abandonadasInbound: m.abandonadasInbound,
          ahtSeg: m.ahtSeg,
          acwSeg: m.acwSeg,
          talkSeg: m.talkSeg,
          exitos: m.exitos,
          leadsFinalizados: m.leadsFinalizados,
          actualizadoAt: ahora,
        })
        .run();
    }
  });
  guardarAjuste("ultima_agregacion", new Date().toISOString());
}

export interface TendenciaMes {
  mes: string; // YYYY-MM
  interacciones: number;
  atendidas: number;
  /** Solo entrantes. null si el mes tiene días agregados antes de existir el dato. */
  abandonadasInbound: number | null;
  exitos: number;
}

/**
 * Tendencia mensual de los últimos `meses` meses (desde los agregados).
 * Filtro opcional por campañas (scoping por servicio/cliente).
 */
export function tendenciaMensual(meses = 12, campanias?: string[]): TendenciaMes[] {
  const filtro =
    campanias && campanias.length > 0
      ? inArray(aggDailyCampaign.campaignShortname, campanias)
      : undefined;
  const filas = db
    .select({
      mes: sql<string>`substr(${aggDailyCampaign.fecha}, 1, 7)`,
      interacciones: sql<number>`SUM(${aggDailyCampaign.interacciones})`,
      atendidas: sql<number>`SUM(${aggDailyCampaign.atendidas})`,
      // Si algún día del mes no tiene el dato (agregado antes del 29/09/2026),
      // hueco en la gráfica en vez de una suma parcial que parezca real.
      abandonadasInbound: sql<number | null>`CASE
        WHEN COUNT(*) = COUNT(${aggDailyCampaign.abandonadasInbound})
        THEN SUM(${aggDailyCampaign.abandonadasInbound}) END`,
      exitos: sql<number>`SUM(${aggDailyCampaign.exitos})`,
    })
    .from(aggDailyCampaign)
    .where(filtro)
    .groupBy(sql`substr(${aggDailyCampaign.fecha}, 1, 7)`)
    .orderBy(sql`substr(${aggDailyCampaign.fecha}, 1, 7) DESC`)
    .limit(meses)
    .all();
  return filas.reverse();
}

/** Última fecha con agregados y momento de la última ejecución del job. */
export function estadoAgregados(): { ultimaFecha: string | null; ultimaEjecucion: string | null } {
  const fila = db
    .select({ ultimaFecha: sql<string | null>`MAX(${aggDailyCampaign.fecha})` })
    .from(aggDailyCampaign)
    .get();
  return {
    ultimaFecha: fila?.ultimaFecha ?? null,
    ultimaEjecucion: obtenerAjuste("ultima_agregacion", "") || null,
  };
}

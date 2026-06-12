import { sql } from "drizzle-orm";
import { db } from "./sqlite";
import { aggDailyCampaign } from "./schema";
import type { MetricaDiariaCampania } from "@/lib/rdb/types";
import { guardarAjuste, obtenerAjuste } from "./settings";

// ============================================================
// Agregados diarios por campaña (rellenados por el script
// scripts/aggregate-daily.ts). Evitan escanear itr_thread para
// las tendencias largas de /direccion.
// ============================================================

/** Inserta/actualiza las métricas de un conjunto de días y campañas. */
export function upsertMetricasDiarias(filas: MetricaDiariaCampania[]): void {
  const ahora = new Date();
  db.transaction((tx) => {
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
          ahtSeg: m.ahtSeg,
          acwSeg: m.acwSeg,
          talkSeg: m.talkSeg,
          horasLogadas: m.horasLogadas,
          horasReady: m.horasReady,
          exitos: m.exitos,
          leadsFinalizados: m.leadsFinalizados,
          actualizadoAt: ahora,
        })
        .onConflictDoUpdate({
          target: [aggDailyCampaign.fecha, aggDailyCampaign.campaignShortname],
          set: {
            tipoCampania: m.tipo,
            interacciones: m.interacciones,
            inbound: m.inbound,
            outbound: m.outbound,
            atendidas: m.atendidas,
            abandonadas: m.abandonadas,
            ahtSeg: m.ahtSeg,
            acwSeg: m.acwSeg,
            talkSeg: m.talkSeg,
            horasLogadas: m.horasLogadas,
            horasReady: m.horasReady,
            exitos: m.exitos,
            leadsFinalizados: m.leadsFinalizados,
            actualizadoAt: ahora,
          },
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
  abandonadas: number;
  horasLogadas: number;
  exitos: number;
}

/** Tendencia mensual de los últimos `meses` meses (desde los agregados). */
export function tendenciaMensual(meses = 12): TendenciaMes[] {
  const filas = db
    .select({
      mes: sql<string>`substr(${aggDailyCampaign.fecha}, 1, 7)`,
      interacciones: sql<number>`SUM(${aggDailyCampaign.interacciones})`,
      atendidas: sql<number>`SUM(${aggDailyCampaign.atendidas})`,
      abandonadas: sql<number>`SUM(${aggDailyCampaign.abandonadas})`,
      horasLogadas: sql<number>`ROUND(SUM(${aggDailyCampaign.horasLogadas}), 1)`,
      exitos: sql<number>`SUM(${aggDailyCampaign.exitos})`,
    })
    .from(aggDailyCampaign)
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

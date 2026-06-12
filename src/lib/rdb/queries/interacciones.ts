import { conCache, ttlSegunRango } from "../cache";
import { obtenerEnums } from "../enums";
import { mockVolumenPorCampania, mockVolumenPorDia } from "../mock";
import { esMock, obtenerPool, sql } from "../pool";
import type { VolumenCampania, VolumenDia } from "../types";
import { claveCampanias, filtroCampanias, limitesRango, redondear1 } from "./util";

// ============================================================
// Volumen de interacciones (tabla itr_thread = hilos por agente).
// Recordatorio crítico: duration/wrapup_duration en DÉCIMAS de
// segundo → siempre /10.0 en el SQL.
// ============================================================

/** Volumen global por día en el rango, opcionalmente filtrado por campañas. */
export async function volumenPorDia(
  desdeISO: string,
  hastaISO: string,
  campanias?: string[],
): Promise<VolumenDia[]> {
  if (esMock()) return mockVolumenPorDia(desdeISO, hastaISO, campanias);
  const clave = `rdb:volDia:${desdeISO}:${hastaISO}:${claveCampanias(campanias)}`;
  return conCache(clave, ttlSegunRango(hastaISO), async () => {
    const pool = await obtenerPool();
    const request = pool.request();
    const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
    request.input("desde", sql.DateTime, desde);
    request.input("hastaExcl", sql.DateTime, hastaExcl);
    const filtro = filtroCampanias(request, campanias, "c.shortname");

    const r = await request.query(`
      -- Volumen de hilos de interacción por día (un hilo = gestión de un agente)
      -- AHT/ACW/Talk solo sobre atendidas (termination_state = 1), en segundos (/10.0)
      SELECT
          CONVERT(varchar(10), t.start_time, 23)                          AS fecha,
          COUNT(*)                                                        AS total,
          SUM(CASE WHEN t.origin = 1 THEN 1 ELSE 0 END)                   AS inbound,
          SUM(CASE WHEN t.origin = 2 THEN 1 ELSE 0 END)                   AS outbound,
          SUM(CASE WHEN t.termination_state = 1 THEN 1 ELSE 0 END)        AS atendidas,
          SUM(CASE WHEN t.termination_state = 6 THEN 1 ELSE 0 END)        AS abandonadas,
          AVG(CASE WHEN t.termination_state = 1 THEN t.duration / 10.0 END)                       AS ahtSeg,
          AVG(CASE WHEN t.termination_state = 1 THEN t.wrapup_duration / 10.0 END)                AS acwSeg,
          AVG(CASE WHEN t.termination_state = 1 THEN (t.duration - t.wrapup_duration) / 10.0 END) AS talkSeg
      FROM itr_thread t
      LEFT JOIN ph_campaign c ON t.campaign = c.code
      WHERE t.start_time >= @desde
        AND t.start_time <  @hastaExcl${filtro}
      GROUP BY CONVERT(varchar(10), t.start_time, 23)
      ORDER BY fecha;
    `);
    return (r.recordset as VolumenDia[]).map((f) => ({
      ...f,
      ahtSeg: redondear1(f.ahtSeg),
      acwSeg: redondear1(f.acwSeg),
      talkSeg: redondear1(f.talkSeg),
    }));
  });
}

/** Volumen agregado por campaña en el rango (ranking). */
export async function volumenPorCampania(
  desdeISO: string,
  hastaISO: string,
  campanias?: string[],
): Promise<VolumenCampania[]> {
  if (esMock()) return mockVolumenPorCampania(desdeISO, hastaISO, campanias);
  const clave = `rdb:volCamp:${desdeISO}:${hastaISO}:${claveCampanias(campanias)}`;
  return conCache(clave, ttlSegunRango(hastaISO), async () => {
    const pool = await obtenerPool();
    const request = pool.request();
    const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
    request.input("desde", sql.DateTime, desde);
    request.input("hastaExcl", sql.DateTime, hastaExcl);
    const filtro = filtroCampanias(request, campanias, "c.shortname");

    const r = await request.query(`
      -- Ranking de campañas por volumen de hilos en el rango
      SELECT
          RTRIM(c.shortname)                                              AS campania,
          c.campaigntype                                                  AS tipoCodigo,
          COUNT(*)                                                        AS total,
          SUM(CASE WHEN t.origin = 1 THEN 1 ELSE 0 END)                   AS inbound,
          SUM(CASE WHEN t.origin = 2 THEN 1 ELSE 0 END)                   AS outbound,
          SUM(CASE WHEN t.termination_state = 1 THEN 1 ELSE 0 END)        AS atendidas,
          SUM(CASE WHEN t.termination_state = 6 THEN 1 ELSE 0 END)        AS abandonadas,
          AVG(CASE WHEN t.termination_state = 1 THEN t.duration / 10.0 END) AS ahtSeg
      FROM itr_thread t
      INNER JOIN ph_campaign c ON t.campaign = c.code
      WHERE t.start_time >= @desde
        AND t.start_time <  @hastaExcl${filtro}
      GROUP BY RTRIM(c.shortname), c.campaigntype
      ORDER BY total DESC;
    `);
    const enums = await obtenerEnums();
    return (
      r.recordset as (Omit<VolumenCampania, "tipo"> & { tipoCodigo: number })[]
    ).map(({ tipoCodigo, ...fila }) => ({
      ...fila,
      ahtSeg: redondear1(fila.ahtSeg),
      tipo: enums.CampaignType?.[tipoCodigo] ?? `#${tipoCodigo}`,
    }));
  });
}

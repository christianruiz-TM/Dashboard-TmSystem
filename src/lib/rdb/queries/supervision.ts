import { conCache, TTL } from "../cache";
import { obtenerEnums } from "../enums";
import { mockAgentesHoy, mockEstadoAgentes, mockKpisCampaniasHoy } from "../mock";
import { esMock, obtenerPool, sql } from "../pool";
import type { AgenteEstado, AgenteHoy, KpiCampaniaHoy } from "../types";
import { hoyISO } from "@/lib/fechas";
import { limitesRango, redondear1 } from "./util";

// ============================================================
// Vista Supervisión: intradía casi en tiempo real.
// Usa SIEMPRE tablas de replicación (itr_thread, ag_in_cp_log,
// itr_segment), no flats (15 min de retraso). Cache 60 s.
// ============================================================

/**
 * Último estado conocido HOY de cada agente humano.
 * Si la última fila tiene duration informada, el estado ya terminó y no hay
 * otro posterior → el agente se ha deslogado ("Deslogado").
 */
export async function estadoAgentes(): Promise<AgenteEstado[]> {
  if (esMock()) return mockEstadoAgentes();
  return conCache("rdb:sup:agentes", TTL.supervision, async () => {
    const pool = await obtenerPool();
    const request = pool.request();
    const { desde, hastaExcl } = limitesRango(hoyISO(), hoyISO());
    request.input("desde", sql.DateTime, desde);
    request.input("hastaExcl", sql.DateTime, hastaExcl);

    const r = await request.query(`
      -- Último registro de estado por agente en ag_in_cp_log (solo hoy)
      WITH ult AS (
          SELECT l.agent, l.campaign, l.op_type, l.reason, l.start_time, l.duration,
                 ROW_NUMBER() OVER (PARTITION BY l.agent ORDER BY l.start_time DESC) AS rn
          FROM ag_in_cp_log l
          WHERE l.start_time >= @desde AND l.start_time < @hastaExcl
      )
      SELECT
          RTRIM(u.usr_name)                                AS agente,
          RTRIM(u.fullname)                                AS nombre,
          RTRIM(c.shortname)                               AS campania,
          ult.op_type                                      AS opType,
          ult.duration                                     AS duracionCerrada,
          RTRIM(r.name)                                    AS motivo,
          DATEDIFF(MINUTE, ult.start_time, GETDATE())      AS desdeMin
      FROM ult
      INNER JOIN ph_e_user  u ON ult.agent    = u.code AND u.type = 1  -- solo humanos
      INNER JOIN ph_campaign c ON ult.campaign = c.code
      LEFT  JOIN not_ready_reason r ON ult.reason = r.code
      WHERE ult.rn = 1
      ORDER BY agente;
    `);

    // op_type: 0=OpenClose(Logado) · 1=Ready · 2=NotReady (enum AgentInCampaignOperationLogType)
    const ETIQUETAS: Record<number, string> = { 0: "Logado", 1: "Ready", 2: "NotReady" };
    return (
      r.recordset as {
        agente: string;
        nombre: string;
        campania: string;
        opType: number;
        duracionCerrada: number | null;
        motivo: string | null;
        desdeMin: number;
      }[]
    ).map((f) => ({
      agente: f.agente,
      nombre: f.nombre,
      campania: f.campania,
      estado: f.duracionCerrada != null ? "Deslogado" : (ETIQUETAS[f.opType] ?? `#${f.opType}`),
      motivo: f.opType === 2 && f.duracionCerrada == null ? f.motivo : null,
      desdeMin: f.desdeMin,
    }));
  });
}

/** KPIs del día por campaña, con cola y SLA (umbral en segundos). */
export async function kpisCampaniasHoy(umbralSeg: number): Promise<KpiCampaniaHoy[]> {
  if (esMock()) return mockKpisCampaniasHoy(umbralSeg);
  return conCache(`rdb:sup:kpis:${umbralSeg}`, TTL.supervision, async () => {
    const pool = await obtenerPool();
    const request = pool.request();
    const { desde, hastaExcl } = limitesRango(hoyISO(), hoyISO());
    request.input("desde", sql.DateTime, desde);
    request.input("hastaExcl", sql.DateTime, hastaExcl);
    request.input("umbralSeg", sql.Float, umbralSeg);

    const r = await request.query(`
      -- KPIs intradía por campaña.
      -- Cola por hilo = suma de segmentos en estado 2 (Pending) o 3 (Routing), en segundos.
      WITH colas AS (
          SELECT s.itr_thread, SUM(s.duration) / 10.0 AS colaSeg
          FROM itr_segment s
          WHERE s.start_time >= @desde AND s.start_time < @hastaExcl
            AND s.state IN (2, 3)
          GROUP BY s.itr_thread
      )
      SELECT
          RTRIM(c.shortname)                                       AS campania,
          c.campaigntype                                           AS tipoCodigo,
          SUM(CASE WHEN t.origin = 1 THEN 1 ELSE 0 END)            AS recibidas,
          SUM(CASE WHEN t.termination_state = 1 THEN 1 ELSE 0 END) AS atendidas,
          SUM(CASE WHEN t.termination_state = 6 THEN 1 ELSE 0 END) AS abandonadas,
          AVG(CASE WHEN t.termination_state = 1 THEN t.duration / 10.0 END)        AS ahtSeg,
          AVG(CASE WHEN t.termination_state = 1 THEN t.wrapup_duration / 10.0 END) AS acwSeg,
          AVG(q.colaSeg)                                           AS colaMediaSeg,
          -- SLA: % de atendidas cuya cola fue <= umbral
          CAST(SUM(CASE WHEN t.termination_state = 1 AND ISNULL(q.colaSeg, 0) <= @umbralSeg
                        THEN 1 ELSE 0 END) * 100.0
               / NULLIF(SUM(CASE WHEN t.termination_state = 1 THEN 1 ELSE 0 END), 0)
               AS DECIMAL(5, 1))                                   AS slaPct
      FROM itr_thread t
      INNER JOIN ph_campaign c ON t.campaign = c.code
      LEFT  JOIN colas q ON q.itr_thread = t.code
      WHERE t.start_time >= @desde AND t.start_time < @hastaExcl
      GROUP BY RTRIM(c.shortname), c.campaigntype
      ORDER BY recibidas DESC;
    `);
    const enums = await obtenerEnums();
    return (
      r.recordset as (Omit<KpiCampaniaHoy, "tipo"> & { tipoCodigo: number })[]
    ).map(({ tipoCodigo, ...fila }) => ({
      ...fila,
      ahtSeg: redondear1(fila.ahtSeg),
      acwSeg: redondear1(fila.acwSeg),
      colaMediaSeg: redondear1(fila.colaMediaSeg),
      slaPct: fila.slaPct == null ? null : Number(fila.slaPct),
      tipo: enums.CampaignType?.[tipoCodigo] ?? `#${tipoCodigo}`,
    }));
  });
}

/** Productividad por agente del día actual (solo atendidas). */
export async function agentesHoy(): Promise<AgenteHoy[]> {
  if (esMock()) return mockAgentesHoy();
  return conCache("rdb:sup:agentesHoy", TTL.supervision, async () => {
    const pool = await obtenerPool();
    const request = pool.request();
    const { desde, hastaExcl } = limitesRango(hoyISO(), hoyISO());
    request.input("desde", sql.DateTime, desde);
    request.input("hastaExcl", sql.DateTime, hastaExcl);

    const r = await request.query(`
      -- Productividad de agentes humanos hoy (solo interacciones atendidas)
      SELECT
          RTRIM(u.usr_name)                                AS agente,
          RTRIM(u.fullname)                                AS nombre,
          COUNT(*)                                         AS atendidas,
          AVG((t.duration - t.wrapup_duration) / 10.0)     AS talkMedioSeg,
          AVG(t.wrapup_duration / 10.0)                    AS acwMedioSeg,
          AVG(t.duration / 10.0)                           AS ahtMedioSeg,
          SUM(t.duration / 10.0)                           AS productivoSeg
      FROM itr_thread t
      INNER JOIN ph_e_user u ON t.e_user = u.code AND u.type = 1
      WHERE t.start_time >= @desde AND t.start_time < @hastaExcl
        AND t.termination_state = 1
      GROUP BY RTRIM(u.usr_name), RTRIM(u.fullname)
      ORDER BY atendidas DESC;
    `);
    return (r.recordset as AgenteHoy[]).map((f) => ({
      ...f,
      talkMedioSeg: redondear1(f.talkMedioSeg),
      acwMedioSeg: redondear1(f.acwMedioSeg),
      ahtMedioSeg: redondear1(f.ahtMedioSeg),
      productivoSeg: Math.round(f.productivoSeg),
    }));
  });
}

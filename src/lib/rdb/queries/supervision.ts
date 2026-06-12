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

/**
 * KPIs del día por campaña, con cola y SLA (umbral en segundos).
 *
 * Rendimiento (verificado 12/06/2026 contra la instalación real): combinar
 * hilos + colas en una sola sentencia producía planes de 60-90 s en este
 * SQL Server; por separado cada query tarda <200 ms. Se ejecutan DOS queries
 * y se mezclan aquí. No "optimizar" volviendo a unificarlas.
 */
export async function kpisCampaniasHoy(umbralSeg: number): Promise<KpiCampaniaHoy[]> {
  if (esMock()) return mockKpisCampaniasHoy(umbralSeg);
  return conCache(`rdb:sup:kpis:${umbralSeg}`, TTL.supervision, async () => {
    const pool = await obtenerPool();
    const { desde, hastaExcl } = limitesRango(hoyISO(), hoyISO());

    // --- Q1: agregados por campaña sobre itr_thread (índice en start_time) ---
    const reqHilos = pool.request();
    reqHilos.input("desde", sql.DateTime, desde);
    reqHilos.input("hastaExcl", sql.DateTime, hastaExcl);
    const hilos = reqHilos.query(`
      -- Volumen y tiempos del día por campaña (sin colas)
      SELECT
          RTRIM(c.shortname)                                       AS campania,
          c.campaigntype                                           AS tipoCodigo,
          SUM(CASE WHEN t.origin = 1 THEN 1 ELSE 0 END)            AS recibidas,
          SUM(CASE WHEN t.termination_state = 1 THEN 1 ELSE 0 END) AS atendidas,
          SUM(CASE WHEN t.termination_state = 6 THEN 1 ELSE 0 END) AS abandonadas,
          AVG(CASE WHEN t.termination_state = 1 THEN t.duration / 10.0 END)        AS ahtSeg,
          AVG(CASE WHEN t.termination_state = 1 THEN t.wrapup_duration / 10.0 END) AS acwSeg
      FROM itr_thread t
      INNER JOIN ph_campaign c ON t.campaign = c.code
      WHERE t.start_time >= @desde AND t.start_time < @hastaExcl
      GROUP BY RTRIM(c.shortname), c.campaigntype
      ORDER BY recibidas DESC;
    `);

    // --- Q2: colas por campaña (segmentos Pending/Routing de hoy → join por PK) ---
    const reqColas = pool.request();
    reqColas.input("desde", sql.DateTime, desde);
    reqColas.input("hastaExcl", sql.DateTime, hastaExcl);
    reqColas.input("umbralSeg", sql.Float, umbralSeg);
    const colas = reqColas.query(`
      -- Cola por hilo (estados 2=Pending, 3=Routing) agregada por campaña.
      -- FORCE ORDER: primero el agregado de segmentos (índice en start_time),
      -- después el join por PK de itr_thread.
      SELECT
          RTRIM(c.shortname) AS campania,
          AVG(x.colaSeg)     AS colaMediaSeg,
          SUM(CASE WHEN x.termination_state = 1 AND x.colaSeg > @umbralSeg
                   THEN 1 ELSE 0 END) AS atendidasFueraSla
      FROM (
          SELECT q.itr_thread, q.colaSeg, t.campaign, t.termination_state
          FROM (
              SELECT s.itr_thread, SUM(s.duration) / 10.0 AS colaSeg
              FROM itr_segment s
              WHERE s.start_time >= @desde AND s.start_time < @hastaExcl
                AND s.state IN (2, 3)
              GROUP BY s.itr_thread
          ) q
          INNER JOIN itr_thread t ON t.code = q.itr_thread
          WHERE t.start_time >= @desde AND t.start_time < @hastaExcl
      ) x
      INNER JOIN ph_campaign c ON x.campaign = c.code
      GROUP BY RTRIM(c.shortname)
      OPTION (FORCE ORDER);
    `);

    const [rHilos, rColas] = await Promise.all([hilos, colas]);
    const porCampania = new Map(
      (rColas.recordset as {
        campania: string;
        colaMediaSeg: number | null;
        atendidasFueraSla: number;
      }[]).map((f) => [f.campania, f]),
    );
    const enums = await obtenerEnums();

    type FilaHilos = Omit<KpiCampaniaHoy, "tipo" | "colaMediaSeg" | "slaPct"> & {
      tipoCodigo: number;
    };
    return (rHilos.recordset as FilaHilos[]).map(({ tipoCodigo, ...fila }) => {
      const cola = porCampania.get(fila.campania);
      // SLA: atendidas sin fila de cola = 0 s de espera → dentro de SLA
      const slaPct =
        fila.atendidas > 0
          ? Math.round(
              ((fila.atendidas - (cola?.atendidasFueraSla ?? 0)) / fila.atendidas) * 1000,
            ) / 10
          : null;
      return {
        ...fila,
        ahtSeg: redondear1(fila.ahtSeg),
        acwSeg: redondear1(fila.acwSeg),
        colaMediaSeg: redondear1(cola?.colaMediaSeg ?? null),
        slaPct,
        tipo: enums.CampaignType?.[tipoCodigo] ?? `#${tipoCodigo}`,
      };
    });
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

import { conCache, TTL, ttlSegunRango } from "../cache";
import { obtenerEnums } from "../enums";
import {
  mockAgentesHoy,
  mockAgentesRango,
  mockEstadoAgentes,
  mockKpisCampaniasHoy,
  mockKpisCampaniasRango,
  mockMetricasIvr,
} from "../mock";
import { esMock, obtenerPool, sql } from "../pool";
import type { AgenteEstado, AgenteHoy, KpiCampaniaHoy, MetricasIvr } from "../types";
import { hoyISO } from "@/lib/fechas";
import { claveCampanias, filtroCampanias, limitesRango, redondear2 } from "./util";

// ============================================================
// Vista Supervisión: intradía casi en tiempo real.
// Usa SIEMPRE tablas de replicación (itr_thread, ag_in_cp_log,
// itr_segment), no flats (15 min de retraso). Cache 60 s.
// ============================================================

/**
 * Estado actual (hoy) de cada agente humano.
 *
 * Las filas con `duration IS NULL` son estados AÚN ABIERTOS (regla 10.b). Se
 * elige, por este orden: una fila abierta antes que una cerrada; un estado
 * Ready/NotReady antes que la mera sesión (op 0); y la más reciente.
 *  - Sin ninguna fila abierta → "Deslogado" (desde su último fin).
 *  - Solo la sesión abierta → "Logado".
 *
 * Por qué no vale "la fila de start_time más reciente": al hacer login,
 * Altitude graba la sesión (op 0) y el Not Ready inicial (op 2) en el MISMO
 * instante, y el empate lo decidía el plan de ejecución. Medido 23/09/2026:
 * 6 de 7 agentes en pausa salían como "Logado" y la tarjeta "No disponibles"
 * marcaba 1 en vez de 7.
 */
export async function estadoAgentes(campanias?: string[]): Promise<AgenteEstado[]> {
  if (esMock()) return mockEstadoAgentes(campanias);
  return conCache(`rdb:sup:agentes:${claveCampanias(campanias)}`, TTL.supervision, async () => {
    const pool = await obtenerPool();
    const request = pool.request();
    const { desde, hastaExcl } = limitesRango(hoyISO(), hoyISO());
    request.input("desde", sql.DateTime, desde);
    request.input("hastaExcl", sql.DateTime, hastaExcl);
    // Filtro por servicio: el "último estado" se calcula sólo sobre sus campañas
    const filtro = filtroCampanias(request, campanias, "cf.shortname");

    const r = await request.query(`
      -- Estado actual por agente en ag_in_cp_log (solo hoy)
      WITH ult AS (
          SELECT l.agent, l.campaign, l.op_type, l.reason, l.start_time, l.duration,
                 -- Fin de su última actividad cerrada: "desde hace" de los deslogados
                 MAX(CASE WHEN l.duration IS NOT NULL
                          THEN DATEADD(SECOND, l.duration / 10, l.start_time) END)
                     OVER (PARTITION BY l.agent) AS ultimoFin,
                 ROW_NUMBER() OVER (
                     PARTITION BY l.agent
                     ORDER BY
                         CASE WHEN l.duration IS NULL THEN 0 ELSE 1 END, -- abiertas primero
                         CASE WHEN l.op_type = 0 THEN 1 ELSE 0 END,      -- estado antes que sesión
                         l.start_time DESC,
                         l.op_type DESC,     -- a igualdad, NotReady antes que Ready
                         l.campaign          -- desempate estable
                 ) AS rn
          FROM ag_in_cp_log l
          INNER JOIN ph_campaign cf ON l.campaign = cf.code
          WHERE l.start_time >= @desde AND l.start_time < @hastaExcl${filtro}
      )
      SELECT
          RTRIM(u.usr_name)                                AS agente,
          RTRIM(u.fullname)                                AS nombre,
          RTRIM(c.shortname)                               AS campania,
          ult.op_type                                      AS opType,
          CASE WHEN ult.duration IS NULL THEN 1 ELSE 0 END AS abierta,
          RTRIM(r.name)                                    AS motivo,
          DATEDIFF(MINUTE,
                   CASE WHEN ult.duration IS NULL THEN ult.start_time ELSE ult.ultimoFin END,
                   GETDATE())                              AS desdeMin
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
        abierta: number; // 1 = la fila elegida sigue abierta
        motivo: string | null;
        desdeMin: number;
      }[]
    ).map((f) => ({
      agente: f.agente,
      nombre: f.nombre,
      campania: f.campania,
      // Solo se elige una fila cerrada si el agente no tiene NINGUNA abierta
      estado: f.abierta ? (ETIQUETAS[f.opType] ?? `#${f.opType}`) : "Deslogado",
      motivo: f.opType === 2 && f.abierta ? f.motivo : null,
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
async function kpisCampaniasCore(
  desdeISO: string,
  hastaISO: string,
  umbralSeg: number,
  campanias?: string[],
): Promise<KpiCampaniaHoy[]> {
    const pool = await obtenerPool();
    const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);

    // --- Q1: agregados por campaña sobre itr_thread (índice en start_time) ---
    const reqHilos = pool.request();
    reqHilos.input("desde", sql.DateTime, desde);
    reqHilos.input("hastaExcl", sql.DateTime, hastaExcl);
    const filtroHilos = filtroCampanias(reqHilos, campanias, "c.shortname");
    const hilos = reqHilos.query(`
      -- Volumen y tiempos del día por campaña (sin colas)
      SELECT
          RTRIM(c.shortname)                                       AS campania,
          c.campaigntype                                           AS tipoCodigo,
          SUM(CASE WHEN t.origin = 1 THEN 1 ELSE 0 END)            AS recibidas,
          SUM(CASE WHEN t.termination_state = 1 THEN 1 ELSE 0 END) AS atendidas,
          SUM(CASE WHEN t.termination_state = 6 THEN 1 ELSE 0 END) AS abandonadas,
          -- Desglose de ENTRADA: es el denominador correcto de SLA y abandono.
          SUM(CASE WHEN t.origin = 1 AND t.termination_state = 1 THEN 1 ELSE 0 END) AS atendidasInbound,
          SUM(CASE WHEN t.origin = 1 AND t.termination_state = 6 THEN 1 ELSE 0 END) AS abandonadasInbound,
          AVG(CASE WHEN t.termination_state = 1 THEN t.duration / 10.0 END)        AS ahtSeg,
          AVG(CASE WHEN t.termination_state = 1 THEN t.wrapup_duration / 10.0 END) AS acwSeg
      FROM itr_thread t
      INNER JOIN ph_campaign c ON t.campaign = c.code
      WHERE t.start_time >= @desde AND t.start_time < @hastaExcl${filtroHilos}
      GROUP BY RTRIM(c.shortname), c.campaigntype
      ORDER BY recibidas DESC;
    `);

    // --- Q2: colas por campaña (segmentos Pending/Routing de hoy → join por PK) ---
    const reqColas = pool.request();
    reqColas.input("desde", sql.DateTime, desde);
    reqColas.input("hastaExcl", sql.DateTime, hastaExcl);
    reqColas.input("umbralSeg", sql.Float, umbralSeg);
    const filtroColas = filtroCampanias(reqColas, campanias, "c.shortname");
    const colas = reqColas.query(`
      -- Cola por hilo (estados 2=Pending, 3=Routing) agregada por campaña.
      -- SOLO ENTRANTES (origin = 1): la "cola" de una saliente es tiempo de
      -- enrutado del marcador, no espera de un cliente. Mezclarlas falseaba
      -- tanto la cola media como el SLA.
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
            AND t.origin = 1
      ) x
      INNER JOIN ph_campaign c ON x.campaign = c.code
      WHERE 1 = 1${filtroColas}
      GROUP BY RTRIM(c.shortname)
      OPTION (FORCE ORDER);
    `);

    // --- Q3: éxitos por campaña (script_session, business_status 3 = Success) ---
    // Query aparte (mismo motivo de rendimiento que las colas): no combinar.
    const reqExitos = pool.request();
    reqExitos.input("desde", sql.DateTime, desde);
    reqExitos.input("hastaExcl", sql.DateTime, hastaExcl);
    const filtroExitos = filtroCampanias(reqExitos, campanias, "c.shortname");
    const exitos = reqExitos.query(`
      -- Sesiones de script calificadas como Success por campaña
      SELECT RTRIM(c.shortname) AS campania, COUNT(*) AS exitos
      FROM script_session s
      INNER JOIN ph_campaign c ON s.campaign = c.code
      WHERE s.start_time >= @desde AND s.start_time < @hastaExcl
        AND s.business_status = 3${filtroExitos}
      GROUP BY RTRIM(c.shortname);
    `);

    const [rHilos, rColas, rExitos] = await Promise.all([hilos, colas, exitos]);
    const porCampania = new Map(
      (rColas.recordset as {
        campania: string;
        colaMediaSeg: number | null;
        atendidasFueraSla: number;
      }[]).map((f) => [f.campania, f]),
    );
    const exitosPorCampania = new Map(
      (rExitos.recordset as { campania: string; exitos: number }[]).map((f) => [
        f.campania,
        f.exitos,
      ]),
    );
    const enums = await obtenerEnums();

    type FilaHilos = Omit<
      KpiCampaniaHoy,
      "tipo" | "colaMediaSeg" | "slaPct" | "exitos"
    > & { tipoCodigo: number };
    return (rHilos.recordset as FilaHilos[]).map(({ tipoCodigo, ...fila }) => {
      const cola = porCampania.get(fila.campania);
      // SLA solo sobre ENTRANTES atendidas (las salientes no hacen cola).
      // Una entrante atendida sin fila de cola esperó 0 s → dentro de SLA.
      const slaPct =
        fila.atendidasInbound > 0
          ? Math.round(
              ((fila.atendidasInbound - (cola?.atendidasFueraSla ?? 0)) /
                fila.atendidasInbound) *
                1000,
            ) / 10
          : null;
      return {
        ...fila,
        exitos: exitosPorCampania.get(fila.campania) ?? 0,
        ahtSeg: redondear2(fila.ahtSeg),
        acwSeg: redondear2(fila.acwSeg),
        colaMediaSeg: redondear2(cola?.colaMediaSeg ?? null),
        slaPct,
        tipo: enums.CampaignType?.[tipoCodigo] ?? `#${tipoCodigo}`,
      };
    });
}

/** KPIs de campañas de HOY (vista en vivo, cache 60 s). */
export async function kpisCampaniasHoy(
  umbralSeg: number,
  campanias?: string[],
): Promise<KpiCampaniaHoy[]> {
  if (esMock()) return mockKpisCampaniasHoy(umbralSeg, campanias);
  return conCache(
    `rdb:sup:kpis:${umbralSeg}:${claveCampanias(campanias)}`,
    TTL.supervision,
    () => kpisCampaniasCore(hoyISO(), hoyISO(), umbralSeg, campanias),
  );
}

/** Igual pero para un rango histórico (pestaña Histórico de Supervisión). */
export async function kpisCampaniasRango(
  desdeISO: string,
  hastaISO: string,
  umbralSeg: number,
  campanias?: string[],
): Promise<KpiCampaniaHoy[]> {
  if (esMock()) return mockKpisCampaniasRango(desdeISO, hastaISO, umbralSeg, campanias);
  return conCache(
    `rdb:sup:kpisR:${desdeISO}:${hastaISO}:${umbralSeg}:${claveCampanias(campanias)}`,
    ttlSegunRango(hastaISO),
    () => kpisCampaniasCore(desdeISO, hastaISO, umbralSeg, campanias),
  );
}

async function agentesCore(
  desdeISO: string,
  hastaISO: string,
  campanias?: string[],
): Promise<AgenteHoy[]> {
    const pool = await obtenerPool();
    const request = pool.request();
    const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
    request.input("desde", sql.DateTime, desde);
    request.input("hastaExcl", sql.DateTime, hastaExcl);
    const filtro = filtroCampanias(request, campanias, "c.shortname");

    const r = await request.query(`
      -- Productividad de agentes humanos (solo interacciones atendidas)
      SELECT
          RTRIM(u.usr_name)                                AS agente,
          RTRIM(u.fullname)                                AS nombre,
          COUNT(*)                                         AS atendidas,
          AVG((t.duration - t.wrapup_duration) / 10.0)     AS talkMedioSeg,
          AVG(t.wrapup_duration / 10.0)                    AS acwMedioSeg,
          AVG(t.duration / 10.0)                           AS ahtMedioSeg,
          SUM(t.duration / 10.0)                           AS productivoSeg
      FROM itr_thread t
      INNER JOIN ph_e_user  u ON t.e_user   = u.code AND u.type = 1
      INNER JOIN ph_campaign c ON t.campaign = c.code
      WHERE t.start_time >= @desde AND t.start_time < @hastaExcl
        AND t.termination_state = 1${filtro}
      GROUP BY RTRIM(u.usr_name), RTRIM(u.fullname)
      ORDER BY atendidas DESC;
    `);
    return (r.recordset as AgenteHoy[]).map((f) => ({
      ...f,
      talkMedioSeg: redondear2(f.talkMedioSeg),
      acwMedioSeg: redondear2(f.acwMedioSeg),
      ahtMedioSeg: redondear2(f.ahtMedioSeg),
      productivoSeg: redondear2(f.productivoSeg) ?? 0,
    }));
}

/** Productividad por agente de HOY (vista en vivo, cache 60 s). */
export async function agentesHoy(campanias?: string[]): Promise<AgenteHoy[]> {
  if (esMock()) return mockAgentesHoy(campanias);
  return conCache(`rdb:sup:agentesHoy:${claveCampanias(campanias)}`, TTL.supervision, () =>
    agentesCore(hoyISO(), hoyISO(), campanias),
  );
}

/** Productividad por agente en un rango histórico (pestaña Histórico). */
export async function agentesProductividadRango(
  desdeISO: string,
  hastaISO: string,
  campanias?: string[],
): Promise<AgenteHoy[]> {
  if (esMock()) return mockAgentesRango(desdeISO, hastaISO, campanias);
  return conCache(
    `rdb:sup:agentesR:${desdeISO}:${hastaISO}:${claveCampanias(campanias)}`,
    ttlSegunRango(hastaISO),
    () => agentesCore(desdeISO, hastaISO, campanias),
  );
}

/**
 * Métrica de campañas IVR. De las llamadas entrantes que entran por un IVR
 * (distinct itr_global con origin=1):
 *  - atendidasAgente: acaban atendidas por un agente humano (hilo hermano del
 *    mismo itr_global con agente y termination_state=1; la llamada de IVR es la
 *    parte automática, el agente está en un hilo hermano).
 *  - noAtendidas: el resto.
 *  - noAtendidasEnHorario: de las no atendidas, las que entraron mientras HABÍA
 *    al menos un agente logado (ag_in_cp_log op_type=0) en las campañas del
 *    servicio. Es el "horario de producción" calculado dinámicamente: una
 *    llamada fuera de ese horario (nadie logado) es normal que no se atienda.
 *
 * `campanias` = campañas DEL SERVICIO (incluyendo las IVR), para acotar por
 * cliente; el SQL filtra las entrantes por `IVR_*` y los logados por el mismo
 * conjunto de campañas.
 */
export async function metricasIvr(
  desdeISO: string,
  hastaISO: string,
  campanias?: string[],
): Promise<MetricasIvr> {
  if (esMock()) return mockMetricasIvr(desdeISO, hastaISO, campanias);
  return conCache(
    `rdb:sup:ivr:${desdeISO}:${hastaISO}:${claveCampanias(campanias)}`,
    ttlSegunRango(hastaISO),
    async () => {
      const pool = await obtenerPool();
      const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
      const request = pool.request();
      request.input("desde", sql.DateTime, desde);
      request.input("hastaExcl", sql.DateTime, hastaExcl);
      // Mismos parámetros @camp* para los dos filtros (entrantes IVR y logados).
      let filtroIvr = "";
      let filtroLog = "";
      if (campanias && campanias.length > 0) {
        const marcadores = campanias.map((nombre, i) => {
          request.input(`camp${i}`, sql.VarChar(20), nombre);
          return `@camp${i}`;
        });
        const inExpr = `(${marcadores.join(", ")})`;
        filtroIvr = ` AND c.shortname IN ${inExpr}`;
        filtroLog = ` AND lc.shortname IN ${inExpr}`;
      }

      const r = await request.query(`
        -- Llamadas que entran por una campaña IVR (origin 1 = inbound)
        WITH ivr AS (
            SELECT t.itr_global, MIN(t.start_time) AS entrada
            FROM itr_thread t
            INNER JOIN ph_campaign c ON t.campaign = c.code
            WHERE t.start_time >= @desde AND t.start_time < @hastaExcl
              AND c.shortname LIKE 'IVR[_]%' AND t.origin = 1${filtroIvr}
            GROUP BY t.itr_global
        ),
        -- ¿la atendió finalmente un agente? (hilo hermano con agente humano)
        clasif AS (
            SELECT ivr.itr_global, ivr.entrada,
                MAX(CASE WHEN u.type = 1 AND sib.termination_state = 1
                         THEN 1 ELSE 0 END) AS atendida
            FROM ivr
            LEFT JOIN itr_thread sib ON sib.itr_global = ivr.itr_global
            LEFT JOIN ph_e_user  u   ON sib.e_user = u.code
            GROUP BY ivr.itr_global, ivr.entrada
        ),
        -- ¿había algún agente logado en ese instante en las campañas del servicio?
        flags AS (
            SELECT atendida,
                CASE WHEN atendida = 0 AND EXISTS (
                    SELECT 1 FROM ag_in_cp_log l
                    INNER JOIN ph_e_user  lu ON l.agent = lu.code AND lu.type = 1
                    INNER JOIN ph_campaign lc ON l.campaign = lc.code
                    WHERE l.op_type = 0
                      AND l.start_time >= @desde AND l.start_time < @hastaExcl
                      AND l.start_time <= clasif.entrada
                      AND (l.duration IS NULL
                           OR DATEADD(SECOND, l.duration / 10, l.start_time) >= clasif.entrada)
                      ${filtroLog}
                ) THEN 1 ELSE 0 END AS noAtendEnHorario
            FROM clasif
        )
        SELECT
            COUNT(*)                                     AS llamadas,
            SUM(atendida)                                AS atendidasAgente,
            SUM(CASE WHEN atendida = 0 THEN 1 ELSE 0 END) AS noAtendidas,
            SUM(noAtendEnHorario)                        AS noAtendidasEnHorario
        FROM flags;
      `);
      const f = (r.recordset[0] ?? {}) as Partial<MetricasIvr>;
      return {
        llamadas: f.llamadas ?? 0,
        atendidasAgente: f.atendidasAgente ?? 0,
        noAtendidas: f.noAtendidas ?? 0,
        noAtendidasEnHorario: f.noAtendidasEnHorario ?? 0,
      };
    },
  );
}

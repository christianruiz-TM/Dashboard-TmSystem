import { conCache, ttlSegunRango } from "../cache";
import { obtenerEnums } from "../enums";
import { mockMetricasDiarias } from "../mock";
import { esMock, obtenerPool, sql } from "../pool";
import type { MetricaDiariaCampania, UnidadesCampania } from "../types";
import { claveCampanias, filtroCampanias, limitesRango, redondear1 } from "./util";

// ============================================================
// Unidades facturables por campaña. Cuatro fuentes:
//  - itr_thread      → interacciones y horas productivas
//  - ag_in_cp_log    → horas logadas (op 0) y ready (op 1)
//  - script_session  → éxitos (business_status = 3 Success)
//  - activity        → leads finalizados (status = 3 Done)
// ⚠ Fecha de "lead finalizado": se usa activity.moment (pendiente de
//   validar con datos reales si debe salir de activity_history; ver
//   CLAUDE.md "Validaciones pendientes").
// ============================================================

type FilaClave = { fecha: string; campania: string };

function clave(f: FilaClave): string {
  return `${f.fecha}|${f.campania}`;
}

/**
 * Métricas por día y campaña en el rango. Es la query base del módulo de
 * facturación y del job de agregados nocturnos.
 */
export async function metricasDiariasPorCampania(
  desdeISO: string,
  hastaISO: string,
  campanias?: string[],
): Promise<MetricaDiariaCampania[]> {
  if (esMock()) return mockMetricasDiarias(desdeISO, hastaISO, campanias);
  const claveCache = `rdb:factDia:${desdeISO}:${hastaISO}:${claveCampanias(campanias)}`;
  return conCache(claveCache, ttlSegunRango(hastaISO), async () => {
    const pool = await obtenerPool();
    const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);

    // --- 1) Interacciones por día/campaña (itr_thread) ---
    const reqItr = pool.request();
    reqItr.input("desde", sql.DateTime, desde);
    reqItr.input("hastaExcl", sql.DateTime, hastaExcl);
    const filtroItr = filtroCampanias(reqItr, campanias, "c.shortname");
    const itr = reqItr.query(`
      -- Interacciones por día y campaña (duraciones en décimas → /10.0)
      SELECT
          CONVERT(varchar(10), t.start_time, 23)                          AS fecha,
          RTRIM(c.shortname)                                              AS campania,
          c.campaigntype                                                  AS tipoCodigo,
          COUNT(*)                                                        AS interacciones,
          SUM(CASE WHEN t.origin = 1 THEN 1 ELSE 0 END)                   AS inbound,
          SUM(CASE WHEN t.origin = 2 THEN 1 ELSE 0 END)                   AS outbound,
          SUM(CASE WHEN t.termination_state = 1 THEN 1 ELSE 0 END)        AS atendidas,
          SUM(CASE WHEN t.termination_state = 6 THEN 1 ELSE 0 END)        AS abandonadas,
          AVG(CASE WHEN t.termination_state = 1 THEN t.duration / 10.0 END)                       AS ahtSeg,
          AVG(CASE WHEN t.termination_state = 1 THEN t.wrapup_duration / 10.0 END)                AS acwSeg,
          AVG(CASE WHEN t.termination_state = 1 THEN (t.duration - t.wrapup_duration) / 10.0 END) AS talkSeg
      FROM itr_thread t
      INNER JOIN ph_campaign c ON t.campaign = c.code
      WHERE t.start_time >= @desde AND t.start_time < @hastaExcl${filtroItr}
      GROUP BY CONVERT(varchar(10), t.start_time, 23), RTRIM(c.shortname), c.campaigntype;
    `);

    // --- 2) Horas de agente por día/campaña (ag_in_cp_log) ---
    const reqHoras = pool.request();
    reqHoras.input("desde", sql.DateTime, desde);
    reqHoras.input("hastaExcl", sql.DateTime, hastaExcl);
    const filtroHoras = filtroCampanias(reqHoras, campanias, "c.shortname");
    const horas = reqHoras.query(`
      -- Horas de agente por día y campaña: op_type 0 = logado en campaña, 1 = ready
      -- duration en décimas de segundo → horas = /36000.0
      SELECT
          CONVERT(varchar(10), l.start_time, 23)                              AS fecha,
          RTRIM(c.shortname)                                                  AS campania,
          SUM(CASE WHEN l.op_type = 0 THEN ISNULL(l.duration, 0) ELSE 0 END) / 36000.0 AS horasLogadas,
          SUM(CASE WHEN l.op_type = 1 THEN ISNULL(l.duration, 0) ELSE 0 END) / 36000.0 AS horasReady
      FROM ag_in_cp_log l
      INNER JOIN ph_campaign c ON l.campaign = c.code
      INNER JOIN ph_e_user   u ON l.agent    = u.code AND u.type = 1
      WHERE l.start_time >= @desde AND l.start_time < @hastaExcl${filtroHoras}
      GROUP BY CONVERT(varchar(10), l.start_time, 23), RTRIM(c.shortname);
    `);

    // --- 3) Éxitos por día/campaña (script_session, business_status 3 = Success) ---
    const reqExitos = pool.request();
    reqExitos.input("desde", sql.DateTime, desde);
    reqExitos.input("hastaExcl", sql.DateTime, hastaExcl);
    const filtroExitos = filtroCampanias(reqExitos, campanias, "c.shortname");
    const exitos = reqExitos.query(`
      -- Sesiones de script calificadas como Success por día y campaña
      SELECT
          CONVERT(varchar(10), s.start_time, 23)  AS fecha,
          RTRIM(c.shortname)                      AS campania,
          COUNT(*)                                AS exitos
      FROM script_session s
      INNER JOIN ph_campaign c ON s.campaign = c.code
      WHERE s.start_time >= @desde AND s.start_time < @hastaExcl
        AND s.business_status = 3${filtroExitos}
      GROUP BY CONVERT(varchar(10), s.start_time, 23), RTRIM(c.shortname);
    `);

    // --- 4) Leads finalizados por día/campaña (activity Done) ---
    const reqLeads = pool.request();
    reqLeads.input("desde", sql.DateTime, desde);
    reqLeads.input("hastaExcl", sql.DateTime, hastaExcl);
    const filtroLeads = filtroCampanias(reqLeads, campanias, "c.shortname");
    const leads = reqLeads.query(`
      -- Contactos outbound finalizados (activity.status 3 = Done), fechados por su
      -- ÚLTIMO evento en activity_history (validado contra esquema real 12/06/2026:
      -- activity.moment es la fecha PROGRAMADA, no la de cierre).
      -- El NOT EXISTS garantiza que el último evento del contacto cae en el rango.
      WITH ult AS (
          SELECT h.activity, MAX(h.event_moment) AS cierre
          FROM activity_history h
          WHERE h.event_moment >= @desde AND h.event_moment < @hastaExcl
          GROUP BY h.activity
      )
      SELECT
          CONVERT(varchar(10), ult.cierre, 23)  AS fecha,
          RTRIM(c.shortname)                    AS campania,
          COUNT(*)                              AS leadsFinalizados
      FROM ult
      INNER JOIN activity    a ON a.code = ult.activity AND a.status = 3
      INNER JOIN ph_campaign c ON a.campaign = c.code
      WHERE NOT EXISTS (
          SELECT 1 FROM activity_history h2
          WHERE h2.activity = ult.activity AND h2.event_moment >= @hastaExcl
      )${filtroLeads}
      GROUP BY CONVERT(varchar(10), ult.cierre, 23), RTRIM(c.shortname);
    `);

    const [rItr, rHoras, rExitos, rLeads] = await Promise.all([itr, horas, exitos, leads]);
    const enums = await obtenerEnums();

    // Mezcla de las cuatro fuentes por (fecha, campaña)
    const mapa = new Map<string, MetricaDiariaCampania>();
    const obtener = (f: FilaClave): MetricaDiariaCampania => {
      let m = mapa.get(clave(f));
      if (!m) {
        m = {
          fecha: f.fecha,
          campania: f.campania,
          tipo: null,
          interacciones: 0,
          inbound: 0,
          outbound: 0,
          atendidas: 0,
          abandonadas: 0,
          ahtSeg: null,
          acwSeg: null,
          talkSeg: null,
          horasLogadas: 0,
          horasReady: 0,
          exitos: 0,
          leadsFinalizados: 0,
        };
        mapa.set(clave(f), m);
      }
      return m;
    };

    type FilaItr = FilaClave & {
      tipoCodigo: number;
      interacciones: number;
      inbound: number;
      outbound: number;
      atendidas: number;
      abandonadas: number;
      ahtSeg: number | null;
      acwSeg: number | null;
      talkSeg: number | null;
    };
    for (const f of rItr.recordset as FilaItr[]) {
      const m = obtener(f);
      m.tipo = enums.CampaignType?.[f.tipoCodigo] ?? `#${f.tipoCodigo}`;
      m.interacciones = f.interacciones;
      m.inbound = f.inbound;
      m.outbound = f.outbound;
      m.atendidas = f.atendidas;
      m.abandonadas = f.abandonadas;
      m.ahtSeg = redondear1(f.ahtSeg);
      m.acwSeg = redondear1(f.acwSeg);
      m.talkSeg = redondear1(f.talkSeg);
    }
    for (const f of rHoras.recordset as (FilaClave & { horasLogadas: number; horasReady: number })[]) {
      const m = obtener(f);
      m.horasLogadas = Math.round(f.horasLogadas * 100) / 100;
      m.horasReady = Math.round(f.horasReady * 100) / 100;
    }
    for (const f of rExitos.recordset as (FilaClave & { exitos: number })[]) {
      obtener(f).exitos = f.exitos;
    }
    for (const f of rLeads.recordset as (FilaClave & { leadsFinalizados: number })[]) {
      obtener(f).leadsFinalizados = f.leadsFinalizados;
    }

    return [...mapa.values()].sort(
      (a, b) => a.fecha.localeCompare(b.fecha) || a.campania.localeCompare(b.campania),
    );
  });
}

/** Totales del rango por campaña (vista Operaciones/Facturación). */
export async function unidadesPorCampania(
  desdeISO: string,
  hastaISO: string,
  campanias?: string[],
): Promise<UnidadesCampania[]> {
  const diarias = await metricasDiariasPorCampania(desdeISO, hastaISO, campanias);
  const mapa = new Map<string, UnidadesCampania & { _productivoSeg: number }>();
  for (const m of diarias) {
    let u = mapa.get(m.campania);
    if (!u) {
      u = {
        campania: m.campania,
        horasLogadas: 0,
        horasReady: 0,
        horasProductivas: 0,
        interacciones: 0,
        atendidas: 0,
        exitos: 0,
        leadsFinalizados: 0,
        _productivoSeg: 0,
      };
      mapa.set(m.campania, u);
    }
    u.horasLogadas += m.horasLogadas;
    u.horasReady += m.horasReady;
    // Horas productivas = tiempo total de gestión (AHT medio × atendidas)
    u._productivoSeg += (m.ahtSeg ?? 0) * m.atendidas;
    u.interacciones += m.interacciones;
    u.atendidas += m.atendidas;
    u.exitos += m.exitos;
    u.leadsFinalizados += m.leadsFinalizados;
  }
  return [...mapa.values()]
    .map(({ _productivoSeg, ...u }) => ({
      ...u,
      horasLogadas: Math.round(u.horasLogadas * 10) / 10,
      horasReady: Math.round(u.horasReady * 10) / 10,
      horasProductivas: Math.round((_productivoSeg / 3600) * 10) / 10,
    }))
    .sort((a, b) => b.horasLogadas - a.horasLogadas);
}

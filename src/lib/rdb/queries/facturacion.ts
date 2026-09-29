import { conCache, ttlSegunRango } from "../cache";
import { obtenerEnums } from "../enums";
import { mockMetricasDiarias } from "../mock";
import { esMock, obtenerPool, sql } from "../pool";
import type { MetricaDiariaCampania, UnidadesCampania } from "../types";
import { claveCampanias, filtroCampanias, limitesRango, redondear2 } from "./util";

// ============================================================
// Unidades facturables por campaña. Tres fuentes:
//  - itr_thread      → interacciones (volumen: todos los hilos), atendidas (lo
//                      que se factura como «interacciones gestionadas») y
//                      horas productivas (gestión real)
//  - script_session  → éxitos (business_status = 3 Success)
//  - activity        → leads finalizados (status = 3 Done), fechados por el
//                      último event_moment de activity_history
//
// NO se leen horas logadas/ready por campaña de ag_in_cp_log: esa tabla graba
// una fila por CADA campaña abierta, así que sumarlas por campaña multiplica
// el tiempo (medido contra la BBDD real: 2.602 h sumadas frente a 189 h
// reales en un mismo día, ×13,8). La hora logada real es la unión de
// intervalos por agente y solo tiene sentido global → queries/agentes.ts
// (horasAgenteReales). Ver regla 11 de CLAUDE.md.
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
          AVG(CASE WHEN t.termination_state = 1 THEN (t.duration - t.wrapup_duration) / 10.0 END) AS talkSeg,
          -- Horas productivas EXACTAS: suma de la gestión real de las atendidas.
          -- Antes se derivaban en TS como (AHT medio redondeado × atendidas),
          -- lo que arrastraba el redondeo a una cifra que se factura.
          -- CAST a BIGINT: la suma de décimas de un mes desborda un int.
          SUM(CASE WHEN t.termination_state = 1
                   THEN CAST(t.duration AS BIGINT) ELSE 0 END) / 36000.0        AS horasProductivas
      FROM itr_thread t
      INNER JOIN ph_campaign c ON t.campaign = c.code
      WHERE t.start_time >= @desde AND t.start_time < @hastaExcl${filtroItr}
      GROUP BY CONVERT(varchar(10), t.start_time, 23), RTRIM(c.shortname), c.campaigntype;
    `);

    // --- 2) Éxitos por día/campaña (script_session, business_status 3 = Success) ---
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

    // --- 3) Leads finalizados por día/campaña (activity Done) ---
    const reqLeads = pool.request();
    reqLeads.input("desde", sql.DateTime, desde);
    reqLeads.input("hastaExcl", sql.DateTime, hastaExcl);
    const filtroLeads = filtroCampanias(reqLeads, campanias, "c.shortname");
    const leads = reqLeads.query(`
      -- Contactos outbound finalizados (activity.status 3 = Done), fechados por su
      -- ÚLTIMO evento en activity_history (validado contra esquema real 12/06/2026:
      -- activity.moment es la fecha PROGRAMADA, no la de cierre).
      --
      -- Se exige que el último evento del contacto DENTRO del rango sea también
      -- su último evento en absoluto; si no, el lead se cerró más tarde y no
      -- toca contarlo en este período.
      --
      -- RENDIMIENTO: esto se escribía como NOT EXISTS (... event_moment >= @hastaExcl),
      -- que obliga a recorrer por el índice de event_moment TODO lo posterior al
      -- rango (activity_history tiene ~1,9 M de filas) → 40 s medidos para un solo
      -- día. Comparar contra el MAX por actividad usa el índice ixactivity_act_hist
      -- y baja a 0,2 s con el MISMO resultado (verificado: 65 grupos, 1.360 leads).
      -- No revertir a NOT EXISTS.
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
      WHERE ult.cierre = (
          SELECT MAX(h3.event_moment)
          FROM activity_history h3
          WHERE h3.activity = ult.activity
      )${filtroLeads}
      GROUP BY CONVERT(varchar(10), ult.cierre, 23), RTRIM(c.shortname);
    `);

    const [rItr, rExitos, rLeads] = await Promise.all([itr, exitos, leads]);
    const enums = await obtenerEnums();

    // Mezcla de las tres fuentes por (fecha, campaña)
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
          horasProductivas: 0,
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
      horasProductivas: number;
    };
    for (const f of rItr.recordset as FilaItr[]) {
      const m = obtener(f);
      m.tipo = enums.CampaignType?.[f.tipoCodigo] ?? `#${f.tipoCodigo}`;
      m.interacciones = f.interacciones;
      m.inbound = f.inbound;
      m.outbound = f.outbound;
      m.atendidas = f.atendidas;
      m.abandonadas = f.abandonadas;
      m.ahtSeg = redondear2(f.ahtSeg);
      m.acwSeg = redondear2(f.acwSeg);
      m.talkSeg = redondear2(f.talkSeg);
      // SIN redondear: este valor diario se SUMA después en unidadesPorCampania.
      // Redondear cada día y luego sumar acumula error; se redondea solo el total.
      m.horasProductivas = f.horasProductivas;
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
  const mapa = new Map<string, UnidadesCampania>();
  for (const m of diarias) {
    let u = mapa.get(m.campania);
    if (!u) {
      u = {
        campania: m.campania,
        horasProductivas: 0,
        interacciones: 0,
        atendidas: 0,
        exitos: 0,
        leadsFinalizados: 0,
      };
      mapa.set(m.campania, u);
    }
    // Ya viene sumada y exacta desde el SQL (no derivada del AHT redondeado)
    u.horasProductivas += m.horasProductivas;
    u.interacciones += m.interacciones;
    u.atendidas += m.atendidas;
    u.exitos += m.exitos;
    u.leadsFinalizados += m.leadsFinalizados;
  }
  return [...mapa.values()]
    // Único punto de redondeo de las horas productivas: el total ya sumado
    .map((u) => ({ ...u, horasProductivas: redondear2(u.horasProductivas) ?? 0 }))
    // Se ordena por volumen: las horas logadas por campaña ya no existen aquí
    .sort((a, b) => b.interacciones - a.interacciones);
}

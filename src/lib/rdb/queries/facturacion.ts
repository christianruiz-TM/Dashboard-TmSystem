import { esUsuarioDelCliente, patronLikeUsuarios } from "@/lib/facturacion-horas-logadas";
import { conCache, ttlSegunRango } from "../cache";
import { obtenerEnums } from "../enums";
import { mockBaseRepartoHorasLogadas, mockHorasLogadasUsuarios, mockMetricasDiarias } from "../mock";
import { esMock, obtenerPool, sql } from "../pool";
import type {
  BaseRepartoHorasLogadas,
  HorasLogadasUsuario,
  MetricaDiariaCampania,
  UnidadesCampania,
} from "../types";
import { sqlCtesIslas, sqlFinIntervalo } from "./islas";
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
          -- Solo entrantes: la tendencia de abandono de Dirección (regla 6.b)
          SUM(CASE WHEN t.origin = 1 AND t.termination_state = 6 THEN 1 ELSE 0 END) AS abandonadasInbound,
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
          abandonadasInbound: 0,
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
      abandonadasInbound: number;
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
      m.abandonadasInbound = f.abandonadasInbound;
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

/**
 * Horas LOGADAS por usuario de los clientes con los prefijos dados (unidad
 * de facturación `horas_logadas`). Fuente: user_log, una fila por sesión del
 * usuario (login → logout), haya o no campaña abierta. Es la misma tabla que
 * la vista v_TM_TiempoAgentLogado del Excel de operaciones (verificado fila
 * a fila, septiembre 2026).
 *
 * - Solo agentes humanos (type = 1): los puertos IVR y el router dejan
 *   sesiones sin cerrar durante semanas (31/08/2026) y no son agentes.
 * - duration NULL = sesión EN CURSO (en agentes, solo las de hoy): se cierra
 *   en este instante sin salirse del rango (regla 10.b).
 * - Sesiones solapadas del mismo usuario (173 de 97.798 desde junio 2025) se
 *   funden: cuenta el tiempo efectivo, no la suma.
 * - Una sesión cuenta entera en el día en que empieza, como en el Excel.
 */
export async function horasLogadasUsuarios(
  desdeISO: string,
  hastaISO: string,
  prefijos: string[],
): Promise<HorasLogadasUsuario[]> {
  const unicos = [...new Set(prefijos)].sort();
  if (unicos.length === 0) return [];
  if (esMock()) return mockHorasLogadasUsuarios(desdeISO, hastaISO, unicos);
  const claveCache = `rdb:horasLogadasUsr:${desdeISO}:${hastaISO}:${unicos.join(",")}`;
  return conCache(claveCache, ttlSegunRango(hastaISO), async () => {
    const pool = await obtenerPool();
    const request = pool.request();
    const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
    request.input("desde", sql.DateTime, desde);
    request.input("hastaExcl", sql.DateTime, hastaExcl);
    // Un LIKE por prefijo, parametrizado: <PREFIJO>_nnnn exacto
    const condiciones = unicos.map((prefijo, i) => {
      request.input(`usr${i}`, sql.VarChar(80), patronLikeUsuarios(prefijo));
      return `RTRIM(u.usr_name) LIKE @usr${i}`;
    });

    const r = await request.query(`
      -- Tiempo logado por usuario: unión de sus sesiones de user_log
      -- (duration en DÉCIMAS de segundo, ver sqlFinIntervalo)
      WITH base AS (
          SELECT l.e_user AS usuario, l.start_time AS ini,
                 ${sqlFinIntervalo("l")} AS fin
          FROM user_log l
          INNER JOIN ph_e_user u ON u.code = l.e_user AND u.type = 1
          WHERE l.start_time >= @desde AND l.start_time < @hastaExcl
            AND (${condiciones.join(" OR ")})
      ),
      ${sqlCtesIslas("usuario")}
      SELECT RTRIM(u.usr_name)                                          AS usuario,
             COUNT(*)                                                   AS sesiones,
             SUM(CAST(DATEDIFF(SECOND, i.ini, i.fin) AS BIGINT)) / 3600.0 AS horas
      FROM islas i
      INNER JOIN ph_e_user u ON u.code = i.usuario
      GROUP BY RTRIM(u.usr_name);
    `);

    const filas = r.recordset as { usuario: string; sesiones: number; horas: number }[];
    return filas
      .map((f) => ({
        ...f,
        prefijo: unicos.find((p) => esUsuarioDelCliente(f.usuario, p)) ?? "",
      }))
      .filter((f) => f.prefijo !== "")
      .sort((a, b) => a.usuario.localeCompare(b.usuario));
  });
}

/**
 * Base del REPARTO de las horas logadas de un cliente por campaña. Método del
 * Excel de facturación de operaciones (decidido 14/10/2026 con Christian; el
 * anterior, por usuario y día según las atendidas, dejaba 35 h «sin
 * actividad» que no se pueden pasar a un albarán de GS). user_log no sabe de
 * campañas y ag_in_cp_log no sirve (los usuarios de GH tienen más de 15
 * campañas abiertas a la vez el 92,8 % del tiempo), así que el total del
 * mes se reparte en proporción al tiempo de agente de cada campaña
 * (repartirHorasLogadas, en lib/facturacion-horas-logadas.ts).
 *
 * Tiempo de agente = segmentos del agente fuera de cola (state 2/3 es cola,
 * regla 6) de sus hilos entrantes y salientes, atendidos o NO (el tiempo
 * marcando a quien no contesta también pesa). Sin los hilos sin número
 * marcado: «si blanco no suma» (4.304 min en septiembre 2026). Verificado
 * contra «facturacion cerrada» de septiembre 2026: 19 de 38 campañas al
 * céntimo y el resto a ±0,25 h. Por campaña y PREFIJO (4 primeros caracteres
 * del número): el Excel excluye a mano unos cuantos en un segmentador y
 * Christian decidió replicarlo (15/10/2026); la lista es de cada cliente y
 * la mantiene Operaciones (repartirHorasLogadas la aplica).
 * Duraciones en DÉCIMAS de segundo → / 36000.0 = horas.
 */
export async function baseRepartoHorasLogadas(
  desdeISO: string,
  hastaISO: string,
  prefijos: string[],
): Promise<BaseRepartoHorasLogadas> {
  const unicos = [...new Set(prefijos)].sort();
  if (unicos.length === 0) return { tiempoAgente: [] };
  if (esMock()) return mockBaseRepartoHorasLogadas(desdeISO, hastaISO, unicos);
  const claveCache = `rdb:repartoLogadas:${desdeISO}:${hastaISO}:${unicos.join(",")}`;
  return conCache(claveCache, ttlSegunRango(hastaISO), async () => {
    const pool = await obtenerPool();
    const request = pool.request();
    const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
    request.input("desde", sql.DateTime, desde);
    request.input("hastaExcl", sql.DateTime, hastaExcl);
    const condiciones = unicos.map((prefijo, i) => {
      request.input(`usr${i}`, sql.VarChar(80), patronLikeUsuarios(prefijo));
      return `RTRIM(u.usr_name) LIKE @usr${i}`;
    });

    const r = await request.query(`
      -- Tiempo de agente por usuario, campaña y prefijo del número marcado
      -- (medida del Excel de operaciones)
      SELECT RTRIM(u.usr_name)                            AS usuario,
             RTRIM(c.shortname)                           AS campania,
             LEFT(LTRIM(RTRIM(g.to_address)), 4)          AS prefijo,
             SUM(CAST(s.duration AS BIGINT)) / 36000.0    AS horas
      FROM itr_thread t
      INNER JOIN itr_global  g ON g.code = t.itr_global
      INNER JOIN itr_segment s ON s.itr_thread = t.code AND s.state NOT IN (2, 3)
      INNER JOIN ph_e_user   u ON u.code = t.e_user AND u.type = 1
      INNER JOIN ph_campaign c ON c.code = t.campaign
      WHERE t.start_time >= @desde AND t.start_time < @hastaExcl
        AND t.origin IN (1, 2)
        AND LTRIM(RTRIM(ISNULL(g.to_address, ''))) <> ''
        AND (${condiciones.join(" OR ")})
      GROUP BY RTRIM(u.usr_name), RTRIM(c.shortname), LEFT(LTRIM(RTRIM(g.to_address)), 4);
    `);
    const filas = r.recordset as BaseRepartoHorasLogadas["tiempoAgente"];
    const delCliente = (usuario: string) => unicos.some((p) => esUsuarioDelCliente(usuario, p));
    return { tiempoAgente: filas.filter((f) => delCliente(f.usuario)) };
  });
}

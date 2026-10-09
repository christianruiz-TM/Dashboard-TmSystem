import { conCache, TTL, ttlSegunRango } from "../cache";
import { mockBaseRatiosExito, mockRatiosDiarios } from "../mock";
import { esMock, obtenerPool, sql } from "../pool";
import type { BaseRatiosExito, FilaDiariaRatios } from "../types";
import { calcularRatiosExito, type ResultadoRatios } from "@/lib/ratios-exito";
import { hoyISO } from "@/lib/fechas";
import { sqlCtesIslas, sqlFinIntervalo } from "./islas";
import { claveCampanias, filtroCampanias, limitesRango } from "./util";

// ============================================================
// Base de los ratios de éxito por agente y campaña (Supervisión).
// Los ratios se calculan en lib/ratios-exito.ts (puro, con tests).
//
// Verificado contra RDBv2 (septiembre 2026, 09/10/2026):
//  - 5.440 sesiones de éxito, todas con e_user de agente humano, y el
//    agente de la sesión coincide siempre con el de sus hilos.
//  - Una sesión puede tener varios hilos atendidos (Bolsas: 46.176
//    atendidas para 24.619 sesiones): los éxitos se cuentan en
//    script_session, NUNCA uniendo con itr_thread, o salen duplicados.
//  - Un mes entero por usuario y campaña: ~0,4 s (índice en start_time).
// Tres queries separadas, como en kpisCampaniasCore: no combinarlas.
// ============================================================

/** Días hacia atrás para decidir si una campaña usa la calificación «sin éxito». */
const DIAS_CALIFICACION = 90;

/** Hilos de esta duración o más no son gestión real (mismo corte que plan.maxSegHilo). */
const MAX_SEG_HILO = 7200;

/**
 * Campañas que han usado el estado 4 (Unsuccessful) en los 90 días que
 * terminan en `hastaISO`. Con el rango pedido no basta: hoy a primera hora
 * una campaña GH puede no tener aún ningún «sin éxito» y la efectividad
 * saldría al 100 %. Jul-sep 2026: lo usan todas menos las 19 de Bolsas,
 * Soc_Avisos, Soc_Incidencias y otras 4 pequeñas (Entrantes, Skoda...).
 */
export async function campaniasConSinExito(hastaISO: string): Promise<string[]> {
  return conCache(`rdb:ratios:conSinExito:${hastaISO}`, TTL.maestros, async () => {
    const pool = await obtenerPool();
    const request = pool.request();
    const { hastaExcl } = limitesRango(hastaISO, hastaISO);
    const desde = new Date(hastaExcl);
    desde.setDate(desde.getDate() - DIAS_CALIFICACION);
    request.input("desde", sql.DateTime, desde);
    request.input("hastaExcl", sql.DateTime, hastaExcl);
    const r = await request.query(`
      -- Campañas con alguna sesión calificada como Unsuccessful (4)
      SELECT DISTINCT RTRIM(c.shortname) AS campania
      FROM script_session s
      INNER JOIN ph_campaign c ON s.campaign = c.code
      WHERE s.start_time >= @desde AND s.start_time < @hastaExcl
        AND s.business_status = 4;
    `);
    return (r.recordset as { campania: string }[]).map((f) => f.campania);
  });
}

/**
 * Contactos, éxitos, atendidas y gestión por usuario y campaña (y por día si
 * `porDia`). Dos queries separadas que se mezclan aquí: los éxitos se cuentan
 * en script_session y las atendidas en itr_thread, nunca uniendo las dos.
 */
async function filasAgenteCampania(
  desdeISO: string,
  hastaISO: string,
  campanias: string[] | undefined,
  porDia: boolean,
): Promise<FilaDiariaRatios[]> {
  const pool = await obtenerPool();
  const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
  const nueva = () => {
    const request = pool.request();
    request.input("desde", sql.DateTime, desde);
    request.input("hastaExcl", sql.DateTime, hastaExcl);
    return request;
  };
  // Día en hora local de la centralita (regla 14), como agg_daily_campaign
  const dia = (alias: string) => (porDia ? `CONVERT(varchar(10), ${alias}.start_time, 23)` : "''");
  // SQL Server no admite agrupar por una constante: sin día, fuera del GROUP BY
  const grupoDia = (alias: string) => (porDia ? `${dia(alias)}, ` : "");

  // --- Q1: sesiones de script (contactos y éxitos) ---
  const reqSesiones = nueva();
  const filtroSesiones = filtroCampanias(reqSesiones, campanias, "c.shortname");
  const sesiones = reqSesiones.query(`
    -- business_status: 1=NonQualified · 2=Qualified · 3=Success · 4=Unsuccessful
    SELECT ${dia("s")}        AS fecha,
           RTRIM(u.usr_name)  AS agente,
           RTRIM(u.fullname)  AS nombre,
           RTRIM(c.shortname) AS campania,
           COUNT(*)           AS sesiones,
           SUM(CASE WHEN s.business_status = 3 THEN 1 ELSE 0 END) AS exitos,
           SUM(CASE WHEN s.business_status = 4 THEN 1 ELSE 0 END) AS sinExito
    FROM script_session s
    INNER JOIN ph_e_user   u ON s.e_user   = u.code AND u.type = 1
    INNER JOIN ph_campaign c ON s.campaign = c.code
    WHERE s.start_time >= @desde AND s.start_time < @hastaExcl${filtroSesiones}
    GROUP BY ${grupoDia("s")}RTRIM(u.usr_name), RTRIM(u.fullname), RTRIM(c.shortname);
  `);

  // --- Q2: atendidas y gestión (itr_thread) ---
  const reqHilos = nueva();
  reqHilos.input("maxDecimas", sql.Int, MAX_SEG_HILO * 10);
  const filtroHilos = filtroCampanias(reqHilos, campanias, "c.shortname");
  const hilos = reqHilos.query(`
    -- duration en DÉCIMAS de segundo → / 10.0 = segundos (CAST: no desbordar el int).
    -- Los hilos de 2 h o más cuentan como atendidas pero NO como gestión:
    -- CEFF tiene duraciones imposibles (regla 15). Septiembre 2026: 6 hilos
    -- de CEFF sumaban 1.766 h de las 3.871 h productivas de todo el centro.
    SELECT ${dia("t")}        AS fecha,
           RTRIM(u.usr_name)  AS agente,
           RTRIM(u.fullname)  AS nombre,
           RTRIM(c.shortname) AS campania,
           COUNT(*)           AS atendidas,
           SUM(CASE WHEN t.duration < @maxDecimas
                    THEN CAST(t.duration AS BIGINT) ELSE 0 END) / 10.0 AS productivoSeg
    FROM itr_thread t
    INNER JOIN ph_e_user   u ON t.e_user   = u.code AND u.type = 1
    INNER JOIN ph_campaign c ON t.campaign = c.code
    WHERE t.start_time >= @desde AND t.start_time < @hastaExcl
      AND t.termination_state = 1${filtroHilos}
    GROUP BY ${grupoDia("t")}RTRIM(u.usr_name), RTRIM(u.fullname), RTRIM(c.shortname);
  `);

  const [rSesiones, rHilos] = await Promise.all([sesiones, hilos]);
  const filas = new Map<string, FilaDiariaRatios>();
  const obtener = (f: { fecha: string; agente: string; nombre: string; campania: string }) => {
    const clave = `${f.fecha}|${f.agente}|${f.campania}`;
    let fila = filas.get(clave);
    if (!fila) {
      fila = {
        fecha: f.fecha,
        agente: f.agente,
        nombre: f.nombre,
        campania: f.campania,
        sesiones: 0,
        exitos: 0,
        sinExito: 0,
        atendidas: 0,
        productivoSeg: 0,
      };
      filas.set(clave, fila);
    }
    return fila;
  };
  for (const f of rSesiones.recordset as FilaDiariaRatios[]) {
    Object.assign(obtener(f), { sesiones: f.sesiones, exitos: f.exitos, sinExito: f.sinExito });
  }
  for (const f of rHilos.recordset as FilaDiariaRatios[]) {
    Object.assign(obtener(f), { atendidas: f.atendidas, productivoSeg: Number(f.productivoSeg) });
  }
  return [...filas.values()];
}

async function baseRatiosCore(
  desdeISO: string,
  hastaISO: string,
  campanias?: string[],
): Promise<BaseRatiosExito> {
  const pool = await obtenerPool();
  const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
  const reqLogado = pool.request();
  reqLogado.input("desde", sql.DateTime, desde);
  reqLogado.input("hastaExcl", sql.DateTime, hastaExcl);

  // --- Q3: tiempo logado por usuario (user_log, regla 16) ---
  // user_log no sabe de campañas: es el tiempo del usuario, y como hay un
  // usuario por agente y cliente (regla 15), es su tiempo en ese cliente.
  // Misma unión de sesiones que horasLogadasUsuarios (facturación).
  const logado = reqLogado.query(`
    WITH base AS (
        SELECT l.e_user AS usuario, l.start_time AS ini,
               ${sqlFinIntervalo("l")} AS fin
        FROM user_log l
        INNER JOIN ph_e_user u ON u.code = l.e_user AND u.type = 1
        WHERE l.start_time >= @desde AND l.start_time < @hastaExcl
    ),
    ${sqlCtesIslas("usuario")}
    SELECT RTRIM(u.usr_name) AS agente,
           SUM(CAST(DATEDIFF(SECOND, i.ini, i.fin) AS BIGINT)) / 3600.0 AS horas
    FROM islas i
    INNER JOIN ph_e_user u ON u.code = i.usuario
    GROUP BY RTRIM(u.usr_name);
  `);

  const [filas, rLogado, conSinExito] = await Promise.all([
    filasAgenteCampania(desdeISO, hastaISO, campanias, false),
    logado,
    campaniasConSinExito(hastaISO),
  ]);
  // Las horas de los usuarios sin actividad en el alcance no hacen falta
  const conActividad = new Set(filas.map((f) => f.agente));
  return {
    filas, // FilaDiariaRatios es una FilaBaseRatios (fecha = '')
    horasLogadas: (rLogado.recordset as { agente: string; horas: number }[]).filter((h) =>
      conActividad.has(h.agente),
    ),
    campaniasConSinExito: conSinExito,
  };
}

/**
 * Sumas DIARIAS por usuario y campaña de TODAS las campañas, para el agregado
 * agg_daily_agent_campaign (npm run agregados). Sin caché: lo llama el job.
 */
export async function ratiosDiariosAgenteCampania(
  desdeISO: string,
  hastaISO: string,
): Promise<FilaDiariaRatios[]> {
  if (esMock()) return mockRatiosDiarios(desdeISO, hastaISO);
  return filasAgenteCampania(desdeISO, hastaISO, undefined, true);
}

/** Ratios de éxito de HOY (Supervisión en vivo, cache 60 s). */
export async function ratiosExitoHoy(campanias?: string[]): Promise<ResultadoRatios> {
  const hoy = hoyISO();
  const base = esMock()
    ? mockBaseRatiosExito(hoy, hoy, campanias)
    : await conCache(`rdb:ratios:hoy:${claveCampanias(campanias)}`, TTL.supervision, () =>
        baseRatiosCore(hoy, hoy, campanias),
      );
  return calcularRatiosExito(base);
}

/** Ratios de éxito de un rango (pestaña Histórico de Supervisión). */
export async function ratiosExitoRango(
  desdeISO: string,
  hastaISO: string,
  campanias?: string[],
): Promise<ResultadoRatios> {
  const base = esMock()
    ? mockBaseRatiosExito(desdeISO, hastaISO, campanias)
    : await conCache(
        `rdb:ratios:${desdeISO}:${hastaISO}:${claveCampanias(campanias)}`,
        ttlSegunRango(hastaISO),
        () => baseRatiosCore(desdeISO, hastaISO, campanias),
      );
  return calcularRatiosExito(base);
}

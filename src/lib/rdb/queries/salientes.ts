import type { Request } from "mssql";
import { conCache, TTL, ttlSegunRango } from "../cache";
import { obtenerEnums } from "../enums";
import { esMock, obtenerPool, sql } from "../pool";
import type { BaseSalientes, FilaAlcanceSalientes, FilaFranjaSalientes, FilaIntentoExito, FilaRellamadas } from "../types";
import { hoyISO } from "@/lib/fechas";
import { sqlFinIntervalo, sqlCtesIslas } from "./islas";
import { claveCampanias, filtroCampanias, limitesRango, sqlJoinGlobal, sqlLlamada } from "./util";
import { mockBaseSalientes } from "../mock";
import { calcularSalientes, type ResultadoSalientes } from "@/lib/salientes";
import { baseRatiosHoy, baseRatiosRango } from "./ratios-exito";

// ============================================================
// KPIs de salida (pedidos por Christian el 22/10/2026), por agente, por
// campaña y global, en Supervisión y Dirección. La lógica, pura y con tests,
// en lib/salientes.ts. Cinco consultas independientes (como el resto del
// panel: no combinarlas en una sentencia):
//  1) franjas: intentos de salida CON NÚMERO (sin preparaciones, regla 6)
//     por agente, campaña y hora del día; los «contestados» son los
//     gestionados (termination_state 1). Sin los estados que no cuentan en
//     la calidad de la base de datos (NULL, -1, 6, 11, 17, 18). Lleva
//     también las preparaciones (salientes sin número) y su tiempo.
//  2) contactos alcanzados e intentos hasta hablar, y 3) conversión por
//     número de intento, sobre la misma tabla temporal de intentos de los 90
//     días anteriores (#int): los contactos no son sumables entre agentes,
//     así que se agrupan con GROUPING SETS (agente, campaña, total).
//  4) rellamadas agendadas por un agente y vencidas ahora.
//  5) tiempo esperando llamada por agente: tramos en Ready (unión de
//     intervalos, regla 11) SIN ninguna ficha de script abierta. Ready a
//     secas no sirve: incluye el tiempo hablando (GH septiembre: Ready
//     1.106 h ≈ logadas 1.384 h − pausas 280 h), y restarle el script
//     tampoco (la ficha sigue abierta en pausa: daba negativo).
// ============================================================

/** Días hacia atrás de intentos para «intentos hasta hablar» y por intento. */
const DIAS_INTENTOS = 90;

/** Días hacia atrás en los que se buscan rellamadas vencidas sin hacer. */
const DIAS_VENCIDAS = 30;

/** Minutos de gracia antes de dar una rellamada por vencida. */
const MINUTOS_GRACIA = 15;

/** Retraso máximo que se tiene en cuenta en la media (7 días, en minutos). */
const MAX_RETRASO_MIN = 7 * 24 * 60;

/** Estados que no son un intento (como en la calidad de la base de datos). */
const ESTADO_VALIDO = `t.termination_state IS NOT NULL AND t.termination_state >= 0
        AND t.termination_state NOT IN (6, 11, 17, 18)`;

/** Lista de parámetros @prefijo0..n con enteros; «NULL» si no hay ninguno. */
function lista(request: Request, prefijo: string, valores: number[]): string {
  if (valores.length === 0) return "NULL";
  return valores
    .map((v, i) => {
      request.input(`${prefijo}${i}`, sql.Int, v);
      return `@${prefijo}${i}`;
    })
    .join(", ");
}

/** Valores numéricos de un enumerado cuyo nombre cumple el patrón (regla 5). */
async function valoresEnum(enumerado: string, patron: RegExp): Promise<number[]> {
  const enums = await obtenerEnums();
  return Object.entries(enums[enumerado] ?? {})
    .filter(([, nombre]) => patron.test(nombre))
    .map(([valor]) => Number(valor));
}

async function salientesCore(desdeISO: string, hastaISO: string, campanias?: string[]): Promise<BaseSalientes> {
  const pool = await obtenerPool();
  const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
  const nueva = () => {
    const r = pool.request();
    r.input("desde", sql.DateTime, desde);
    r.input("hastaExcl", sql.DateTime, hastaExcl);
    return r;
  };

  // --- 1) franjas horarias y preparaciones ---
  const reqFranjas = nueva();
  const filtroFranjas = filtroCampanias(reqFranjas, campanias, "c.shortname");
  const franjas = reqFranjas.query(`
    SELECT RTRIM(u.usr_name)            AS agente,
           RTRIM(u.fullname)            AS nombre,
           RTRIM(c.shortname)           AS campania,
           DATEPART(hour, t.start_time) AS hora,
           SUM(CASE WHEN ${sqlLlamada()} AND ${ESTADO_VALIDO} THEN 1 ELSE 0 END)   AS intentos,
           SUM(CASE WHEN ${sqlLlamada()} AND t.termination_state = 1 THEN 1 ELSE 0 END) AS contestados,
           SUM(CASE WHEN ${sqlLlamada()} THEN 0 ELSE 1 END)                          AS preparaciones,
           SUM(CASE WHEN ${sqlLlamada()} THEN 0 ELSE CAST(t.duration AS BIGINT) END) / 10.0 AS preparacionSeg
    FROM itr_thread t
    INNER JOIN ph_campaign c ON t.campaign = c.code
    LEFT JOIN ph_e_user u ON t.e_user = u.code AND u.type = 1
    ${sqlJoinGlobal()}
    WHERE t.start_time >= @desde AND t.start_time < @hastaExcl
      AND t.origin = 2${filtroFranjas}
    GROUP BY RTRIM(u.usr_name), RTRIM(u.fullname), RTRIM(c.shortname), DATEPART(hour, t.start_time);
  `);

  // --- 2 y 3) contactos alcanzados, intentos hasta hablar y por intento ---
  const reqIntentos = nueva();
  const desdeIntentos = new Date(desde);
  desdeIntentos.setDate(desdeIntentos.getDate() - DIAS_INTENTOS);
  reqIntentos.input("desdeInt", sql.DateTime, desdeIntentos);
  const filtroIntentos = filtroCampanias(reqIntentos, campanias, "c.shortname");
  // Los mismos parámetros @camp*, con otro alias (no se pueden declarar dos veces)
  const filtroSesiones = filtroIntentos.replace("c.shortname", "c2.shortname");
  const intentos = reqIntentos.query(`
    SET NOCOUNT ON;
    IF OBJECT_ID('tempdb..#int') IS NOT NULL DROP TABLE #int;
    -- Intentos de salida con número a cada contacto, de los 90 días antes del
    -- rango hasta su fin. Sin numerarlos aquí: el ROW_NUMBER sobre ~190.000
    -- filas (un mes de todos los clientes) pasaba la creación de 0,8 a 4 s;
    -- el número de intento sale contando sobre el índice
    SELECT t.contact, t.start_time, t.termination_state AS est,
           RTRIM(u.usr_name) AS agente, RTRIM(u.fullname) AS nombre, RTRIM(c.shortname) AS campania
    INTO #int
    FROM itr_thread t
    INNER JOIN ph_campaign c ON t.campaign = c.code
    LEFT JOIN ph_e_user u ON t.e_user = u.code AND u.type = 1
    ${sqlJoinGlobal()}
    WHERE t.start_time >= @desdeInt AND t.start_time < @hastaExcl
      AND t.origin = 2 AND t.contact IS NOT NULL AND ${sqlLlamada()}
      AND ${ESTADO_VALIDO}${filtroIntentos}
    OPTION (HASH JOIN);
    CREATE CLUSTERED INDEX ix_int ON #int (contact, start_time);

    -- 2) Contactos llamados y alcanzados (con alguna llamada contestada) EN
    --    el rango, e intentos hasta la PRIMERA conversación de los que la
    --    tuvieron en el rango (contando los 90 días anteriores)
    WITH primera AS (
        SELECT contact, MIN(start_time) AS fc FROM #int WHERE est = 1 GROUP BY contact
    ),
    hasta AS (
        -- Contactos cuya primera conversación cae en el rango, con sus intentos hasta ella
        SELECT p.contact, p.fc, COUNT(*) AS n
        FROM primera p
        INNER JOIN #int i ON i.contact = p.contact AND i.start_time <= p.fc
        WHERE p.fc >= @desde
        GROUP BY p.contact, p.fc
    ),
    filas AS (
        -- La primera conversación se atribuye al agente y la campaña de esa llamada
        SELECT i.agente, i.nombre, i.campania, i.contact,
               CASE WHEN i.est = 1 THEN i.contact END AS alcanzado,
               CASE WHEN i.est = 1 AND h.fc = i.start_time THEN h.n END AS hastaHablar
        FROM #int i
        LEFT JOIN hasta h ON h.contact = i.contact
        WHERE i.start_time >= @desde
    )
    SELECT GROUPING(agente) AS gAgente, GROUPING(campania) AS gCampania,
           agente, MAX(nombre) AS nombre, campania,
           COUNT(DISTINCT contact) AS contactos,
           COUNT(DISTINCT alcanzado) AS alcanzados,
           COUNT(hastaHablar) AS primeras,
           ISNULL(SUM(CAST(hastaHablar AS BIGINT)), 0) AS intentosHastaHablar
    FROM filas
    GROUP BY GROUPING SETS ((agente), (campania), ());

    -- 3) En qué intento llega cada éxito: intentos al contacto hasta el fin
    --    de la sesión de éxito (5 = cinco o más; 0 = sin llamada de salida,
    --    p. ej. una entrante)
    WITH ex AS (
        SELECT s.code, s.contact, RTRIM(u2.usr_name) AS agente, RTRIM(u2.fullname) AS nombre,
               RTRIM(c2.shortname) AS campania,
               DATEADD(SECOND, ISNULL(s.duration, 0) / 10, s.start_time) AS fin
        FROM script_session s
        INNER JOIN ph_e_user u2 ON s.e_user = u2.code AND u2.type = 1
        INNER JOIN ph_campaign c2 ON s.campaign = c2.code
        WHERE s.start_time >= @desde AND s.start_time < @hastaExcl
          AND s.business_status = 3${filtroSesiones}
    ),
    n AS (
        SELECT ex.agente, ex.nombre, ex.campania, x.intentos
        FROM ex
        OUTER APPLY (SELECT COUNT(*) AS intentos FROM #int i WHERE i.contact = ex.contact AND i.start_time <= ex.fin) x
    )
    SELECT agente, MAX(nombre) AS nombre, campania,
           CASE WHEN intentos >= 5 THEN 5 ELSE intentos END AS intento,
           COUNT(*) AS exitos, SUM(CAST(intentos AS BIGINT)) AS intentosTotales
    FROM n
    GROUP BY agente, campania, CASE WHEN intentos >= 5 THEN 5 ELSE intentos END;

    DROP TABLE #int;
  `);

  // --- 4) rellamadas agendadas por un agente ---
  const [accionesAgente, programado, agendadoTrasAgente] = await Promise.all([
    valoresEnum("ContactEventActionType", /^(AutomaticOutboundAgentScript|AgentUpdate)$/),
    valoresEnum("ContactSchedulingStatus", /^Scheduled$/),
    valoresEnum("ContactBusinessStatus", /^(NonQualified|Qualified|Success|Unsuccessful)Scheduled$/),
  ]);
  const reqRell = nueva();
  const desdeLlamadas = new Date(Math.min(desde.getTime(), Date.now() - DIAS_VENCIDAS * 86_400_000));
  reqRell.input("desdeLl", sql.DateTime, desdeLlamadas);
  reqRell.input("diasVencidas", sql.Int, DIAS_VENCIDAS);
  reqRell.input("gracia", sql.Int, MINUTOS_GRACIA);
  reqRell.input("maxRetraso", sql.Int, MAX_RETRASO_MIN);
  const acciones = lista(reqRell, "ac", accionesAgente);
  const prog = lista(reqRell, "pr", programado);
  const agendado = lista(reqRell, "ag", agendadoTrasAgente);
  const filtroEventos = filtroCampanias(reqRell, campanias, "c.shortname");
  const filtroProgramadas = filtroEventos.replace("c.shortname", "c3.shortname");
  const rellamadas = reqRell.query(`
    SET NOCOUNT ON;
    IF OBJECT_ID('tempdb..#ll') IS NOT NULL DROP TABLE #ll;
    -- Llamadas de salida con número desde el inicio (o 30 días atrás) hasta ahora
    SELECT t.contact, t.start_time
    INTO #ll
    FROM itr_thread t
    ${sqlJoinGlobal()}
    WHERE t.start_time >= @desdeLl AND t.origin = 2 AND t.contact IS NOT NULL AND ${sqlLlamada()};
    CREATE CLUSTERED INDEX ix_ll ON #ll (contact, start_time);

    -- Agendadas en el rango: eventos de un agente que dejan el contacto
    -- programado; «hechas» = con una llamada al contacto después (hasta ahora)
    SELECT RTRIM(u.usr_name) AS agente, RTRIM(u.fullname) AS nombre, RTRIM(c.shortname) AS campania,
           COUNT(*) AS agendadas,
           SUM(CASE WHEN x.llamada IS NOT NULL THEN 1 ELSE 0 END) AS hechas,
           0 AS vencidas, 0 AS conRetraso, 0 AS retrasoMin
    FROM activity_history h
    INNER JOIN activity a ON a.code = h.activity
    INNER JOIN ph_campaign c ON c.code = a.campaign
    INNER JOIN ph_e_user u ON u.code = h.event_agent AND u.type = 1
    OUTER APPLY (SELECT TOP 1 l.start_time AS llamada FROM #ll l
                 WHERE l.contact = h.activity AND l.start_time > h.event_moment ORDER BY l.start_time) x
    WHERE h.event_moment >= @desde AND h.event_moment < @hastaExcl
      AND h.schedule_status IN (${prog}) AND h.event_action IN (${acciones})${filtroEventos}
    GROUP BY RTRIM(u.usr_name), RTRIM(u.fullname), RTRIM(c.shortname);

    -- Momentos de rellamada vigentes (activity.man_sch_moment = «Momento de la
    -- Rellamada/Agendado manual» en Altitude; activity.moment es «Momento»).
    -- Solo guarda el ÚLTIMO:
    --  · vencidas ahora: siguen agendadas tras un agente, la hora programada pasó hace
    --    más de 15 min y nadie ha llamado desde entonces (foto del momento).
    --  · retraso APROXIMADO: de las horas programadas del rango con una llamada después,
    --    minutos hasta esa llamada (topado a 7 días).
    -- activity.status 0/1 = Started/Executing (contacto abierto; no está en rdb_enums).
    WITH programadas AS (
        SELECT a.code, a.man_sch_moment AS programada, a.status, a.business_status,
               RTRIM(u.usr_name) AS agente, RTRIM(u.fullname) AS nombre, RTRIM(c3.shortname) AS campania,
               x.llamada
        FROM activity a
        INNER JOIN ph_campaign c3 ON c3.code = a.campaign
        -- El agente que la programó (último evento de agendado de un agente),
        -- no activity.agent: las agentes pueden dejar la rellamada sin guardar
        -- su nombre (-1) para que la haga cualquiera (supervisión, 23/10/2026)
        OUTER APPLY (SELECT TOP 1 h.event_agent FROM activity_history h
                     WHERE h.activity = a.code AND h.schedule_status IN (${prog})
                       AND h.event_action IN (${acciones})
                     ORDER BY h.event_moment DESC) p
        LEFT JOIN ph_e_user u ON u.code = p.event_agent AND u.type = 1
        OUTER APPLY (SELECT MIN(l.start_time) AS llamada FROM #ll l
                     WHERE l.contact = a.code AND l.start_time >= a.man_sch_moment) x
        WHERE a.man_sch_moment >= DATEADD(day, -@diasVencidas, GETDATE())${filtroProgramadas}
    )
    SELECT agente, MAX(nombre) AS nombre, campania,
           0 AS agendadas, 0 AS hechas,
           SUM(CASE WHEN status IN (0, 1) AND business_status IN (${agendado})
                     AND programada < DATEADD(minute, -@gracia, GETDATE()) AND llamada IS NULL THEN 1 ELSE 0 END) AS vencidas,
           SUM(CASE WHEN programada >= @desde AND programada < @hastaExcl AND llamada IS NOT NULL
                     AND DATEDIFF(minute, programada, llamada) <= @maxRetraso THEN 1 ELSE 0 END) AS conRetraso,
           SUM(CASE WHEN programada >= @desde AND programada < @hastaExcl AND llamada IS NOT NULL
                     AND DATEDIFF(minute, programada, llamada) <= @maxRetraso
                    THEN CAST(DATEDIFF(minute, programada, llamada) AS BIGINT) ELSE 0 END) AS retrasoMin
    FROM programadas
    GROUP BY agente, campania;

    DROP TABLE #ll;
  `);

  // --- 5) tiempo en Ready y esperando llamada por agente ---
  const reqReady = nueva();
  reqReady.input("maxDecimas", sql.Int, 7200 * 10);
  const filtroReady = filtroCampanias(reqReady, campanias, "c.shortname");
  const filtroScript = filtroReady.replace("c.shortname", "c4.shortname");
  const ready = reqReady.query(`
    SET NOCOUNT ON;
    IF OBJECT_ID('tempdb..#rdy') IS NOT NULL DROP TABLE #rdy;
    IF OBJECT_ID('tempdb..#scr') IS NOT NULL DROP TABLE #scr;
    -- Tramos en Ready, fundidos por agente (regla 11)
    WITH base AS (
        SELECT l.agent AS agente, l.start_time AS ini, ${sqlFinIntervalo("l")} AS fin
        FROM ag_in_cp_log l
        INNER JOIN ph_e_user u ON l.agent = u.code AND u.type = 1
        INNER JOIN ph_campaign c ON l.campaign = c.code
        WHERE l.op_type = 1 AND l.start_time >= @desde AND l.start_time < @hastaExcl${filtroReady}
    ),
    ${sqlCtesIslas("agente")}
    SELECT agente, gid, ini, fin INTO #rdy FROM islas;

    -- Fichas de script del agente (cerradas y de menos de 2 h, regla 15),
    -- desde 2 h antes para pillar las que ya estaban abiertas
    SELECT s.e_user AS agente, s.start_time AS ini, DATEADD(SECOND, s.duration / 10, s.start_time) AS fin
    INTO #scr
    FROM script_session s
    INNER JOIN ph_campaign c4 ON s.campaign = c4.code
    WHERE s.start_time >= DATEADD(hour, -2, @desde) AND s.start_time < @hastaExcl
      AND s.duration IS NOT NULL AND s.duration < @maxDecimas${filtroScript};
    CREATE CLUSTERED INDEX ix_scr ON #scr (agente, ini);

    -- Esperando = cada tramo Ready menos lo que se solapa con fichas abiertas
    -- (topado a la duración del tramo por si dos fichas se pisan)
    WITH solape AS (
        SELECT r.agente, r.gid,
               DATEDIFF(SECOND, r.ini, r.fin) AS seg,
               ISNULL(SUM(DATEDIFF(SECOND,
                   CASE WHEN s.ini > r.ini THEN s.ini ELSE r.ini END,
                   CASE WHEN s.fin < r.fin THEN s.fin ELSE r.fin END)), 0) AS ocupado
        FROM #rdy r
        LEFT JOIN #scr s ON s.agente = r.agente
              AND s.ini < r.fin AND s.fin > r.ini AND s.ini >= DATEADD(hour, -2, r.ini)
        GROUP BY r.agente, r.gid, r.ini, r.fin
    )
    SELECT RTRIM(u.usr_name) AS agente,
           SUM(CAST(seg AS BIGINT)) / 3600.0 AS horas,
           SUM(CAST(CASE WHEN ocupado >= seg THEN 0 ELSE seg - ocupado END AS BIGINT)) / 3600.0 AS esperando
    FROM solape
    INNER JOIN ph_e_user u ON u.code = solape.agente
    GROUP BY RTRIM(u.usr_name);

    DROP TABLE #rdy;
    DROP TABLE #scr;
  `);

  const [rF, rI, rR, rReady] = await Promise.all([franjas, intentos, rellamadas, ready]);
  const conjI = rI.recordsets as unknown as unknown[][];
  const conjR = rR.recordsets as unknown as unknown[][];
  const alcance = (conjI[conjI.length - 2] as (FilaAlcanceSalientes & { gAgente: number; gCampania: number })[]).map(
    ({ gAgente, gCampania, ...f }) => ({
      ...f,
      nivel: gAgente === 0 ? ("agente" as const) : gCampania === 0 ? ("campania" as const) : ("total" as const),
      intentosHastaHablar: Number(f.intentosHastaHablar),
    }),
  );
  return {
    franjas: (rF.recordset as FilaFranjaSalientes[]).map((f) => ({ ...f, preparacionSeg: Number(f.preparacionSeg) })),
    alcance,
    intentos: (conjI[conjI.length - 1] as FilaIntentoExito[]).map((f) => ({
      ...f,
      intentosTotales: Number(f.intentosTotales),
    })),
    rellamadas: [...(conjR[conjR.length - 2] as FilaRellamadas[]), ...(conjR[conjR.length - 1] as FilaRellamadas[])].map(
      (f) => ({ ...f, retrasoMin: Number(f.retrasoMin) }),
    ),
    ready: (rReady.recordset as { agente: string; horas: number; esperando: number }[]).map((f) => ({
      agente: f.agente,
      horas: Number(f.horas),
      esperando: Number(f.esperando),
    })),
  };
}

/** KPIs de salida de un rango (Histórico y Dirección). */
export async function salientesRango(desdeISO: string, hastaISO: string, campanias?: string[]): Promise<BaseSalientes> {
  if (campanias && campanias.length === 0) return { franjas: [], alcance: [], intentos: [], rellamadas: [], ready: [] };
  if (esMock()) return mockBaseSalientes(desdeISO, hastaISO, campanias);
  return conCache(`rdb:salientes:${desdeISO}:${hastaISO}:${claveCampanias(campanias)}`, ttlSegunRango(hastaISO), () =>
    salientesCore(desdeISO, hastaISO, campanias),
  );
}

/** KPIs de salida de HOY (Tiempo real, caché de 60 s como el resto de la pestaña). */
export async function salientesHoy(campanias?: string[]): Promise<BaseSalientes> {
  const hoy = hoyISO();
  if (esMock()) return mockBaseSalientes(hoy, hoy, campanias);
  return conCache(`rdb:salientes:hoy:${claveCampanias(campanias)}`, TTL.supervision, () =>
    salientesCore(hoy, hoy, campanias),
  );
}

/**
 * KPIs de salida ya calculados (global, por campaña y por agente) de un
 * rango o de hoy, con las horas y el script de los ratios de éxito (la misma
 * caché). null si algo falla: la página sale igual, sin la sección.
 */
export async function resumenSalientes(
  desdeISO: string,
  hastaISO: string,
  campanias?: string[],
): Promise<ResultadoSalientes | null> {
  try {
    const esHoy = desdeISO === hoyISO() && hastaISO === hoyISO();
    const [base, ratios] = await Promise.all(
      esHoy
        ? [salientesHoy(campanias), baseRatiosHoy(campanias)]
        : [salientesRango(desdeISO, hastaISO, campanias), baseRatiosRango(desdeISO, hastaISO, campanias)],
    );
    return calcularSalientes(base, ratios);
  } catch (e) {
    console.error("[salientes]", e);
    return null;
  }
}

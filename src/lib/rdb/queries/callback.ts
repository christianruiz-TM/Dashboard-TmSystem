import type {
  BaseCallback,
  CategoriaEntrante,
  DiagnosticoCallback,
  FichaCallback,
  GrupoEntrantes,
  RechazadaCallback,
} from "@/lib/callback";
import { hoyISO } from "@/lib/fechas";
import { conCache, TTL, ttlSegunRango } from "../cache";
import { obtenerEnums } from "../enums";
import { esMock, obtenerPool, sql } from "../pool";
import { limitesRango } from "./util";

// ============================================================
// Callback de las entrantes (12/11/2026): fichas que el IVR da de alta para
// devolver una llamada rechazada, qué pasó con cada una y cómo acabaron las
// entrantes de los clientes con callback. El cálculo (tiempo en horario,
// resumen, alerta) está en lib/callback.ts.
//
// Ficha de callback = alta (`ContactEventActionType` AgentCreation, por
// rdb_enums) hecha por un usuario del IVR (`ph_e_user.type = 3`) en una
// campaña de agentes (no `IVR_*`) del servicio. La misma condición vale para
// la alerta de Ávolo (`llamadasPorDevolverHoy`): `sqlAltaCallback`.
//
// Una entrante se casa con su ficha por campaña, los 9 últimos dígitos del
// teléfono (el de la ficha está en activity.resch_phone_value: el perfil
// llega vacío, 10/11/2026) y los 10 minutos siguientes, como en esa alerta.
// ============================================================

/**
 * Condición de «alta de una ficha de callback» sobre `activity_history`
 * (alias `h`): AgentCreation hecha por un usuario del IVR. `@alta` es el
 * código de AgentCreation (`codigoAltaAgente`).
 */
export function sqlAltaCallback(h = "h"): string {
  return `${h}.event_action = @alta
            AND EXISTS (SELECT 1 FROM ph_e_user ucb WHERE ucb.code = ${h}.event_agent AND ucb.type = 3)`;
}

/** Código de AgentCreation en ContactEventActionType (por rdb_enums, nunca a mano). */
export async function codigoAltaAgente(): Promise<number> {
  const altas = Object.entries((await obtenerEnums()).ContactEventActionType ?? {})
    .filter(([, nombre]) => nombre === "AgentCreation")
    .map(([valor]) => Number(valor));
  if (altas.length !== 1) throw new Error("rdb_enums no tiene ContactEventActionType.AgentCreation");
  return altas[0];
}

/** Días hacia atrás de las fichas que aún pueden estar pendientes (Tiempo real). */
const DIAS_PENDIENTES = 7;
/** Días tras el periodo en que todavía se busca la devolución de una ficha. */
const DIAS_DEVOLUCION = 7;

interface FilaFicha {
  servicio: string;
  campania: string;
  contacto: number;
  alta: string;
  abierta: number;
  primerToque: string | null;
  agente: string | null;
  nombreAgente: string | null;
  primeraLlamada: string | null;
  hablaron: number;
}

interface FilaEntrantes {
  servicio: string;
  campania: string | null;
  categoria: CategoriaEntrante;
  conFicha: number;
  fichaPrevia: number;
  n: number;
}

async function callbackCore(
  desdeISO: string,
  hastaISO: string,
  servicios: string[],
  diasAntes: number,
): Promise<BaseCallback> {
  if (servicios.length === 0) return { fichas: [], entrantes: [], rechazadas: [] };
  const alta = await codigoAltaAgente();
  const pool = await obtenerPool();
  const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
  const desdeFichas = new Date(desde);
  desdeFichas.setDate(desdeFichas.getDate() - diasAntes);
  const hastaToques = new Date(hastaExcl);
  hastaToques.setDate(hastaToques.getDate() + DIAS_DEVOLUCION);
  const request = pool.request();
  request.input("desde", sql.DateTime, desde);
  request.input("hastaExcl", sql.DateTime, hastaExcl);
  request.input("desdeFichas", sql.DateTime, desdeFichas);
  request.input("hastaToques", sql.DateTime, hastaToques);
  request.input("alta", sql.Int, alta);
  const marcas = servicios.map((s, i) => {
    request.input(`srv${i}`, sql.VarChar(100), s);
    return `@srv${i}`;
  });

  const r = await request.query(`-- callback: fichas del IVR, su devolución y las entrantes de los clientes con callback
    IF OBJECT_ID('tempdb..#cbcamp') IS NOT NULL DROP TABLE #cbcamp;
    IF OBJECT_ID('tempdb..#cb') IS NOT NULL DROP TABLE #cb;
    IF OBJECT_ID('tempdb..#cbtq') IS NOT NULL DROP TABLE #cbtq;
    IF OBJECT_ID('tempdb..#cbss') IS NOT NULL DROP TABLE #cbss;
    IF OBJECT_ID('tempdb..#cbent') IS NOT NULL DROP TABLE #cbent;

    -- Campañas de los servicios (cp_general_cfg es 1:N: MIN(service), regla 10)
    SELECT c.code,
           RTRIM(c.shortname) COLLATE DATABASE_DEFAULT AS nombre,
           RTRIM(s.name) COLLATE DATABASE_DEFAULT AS servicio,
           CASE WHEN c.shortname LIKE 'IVR[_]%' THEN 1 ELSE 0 END AS ivr
    INTO #cbcamp
    FROM ph_campaign c
    INNER JOIN (SELECT campaign, MIN(service) AS service FROM cp_general_cfg GROUP BY campaign) cs ON cs.campaign = c.code
    INNER JOIN ph_service s ON s.code = cs.service
    WHERE s.name IN (${marcas.join(", ")});

    -- Fichas de callback: altas del IVR en las campañas de agentes
    SELECT a.code AS contacto, k.nombre AS campania, k.servicio, MIN(h.event_moment) AS alta,
           MAX(CASE WHEN a.status IN (0, 1, 2) THEN 1 ELSE 0 END) AS abierta,
           MAX(RIGHT(RTRIM(a.resch_phone_value), 9)) COLLATE DATABASE_DEFAULT AS numero
    INTO #cb
    FROM activity_history h
    INNER JOIN activity a ON a.code = h.activity
    INNER JOIN #cbcamp k ON k.code = a.campaign AND k.ivr = 0
    WHERE h.event_moment >= @desdeFichas AND h.event_moment < @hastaExcl
      AND ${sqlAltaCallback("h")}
    GROUP BY a.code, k.nombre, k.servicio;

    -- Toques: salientes de un agente a la ficha (con número = llamada; sin
    -- número = gestión sin llamada, la «preparación»)
    SELECT t.contact, t.start_time, t.e_user,
           CASE WHEN NULLIF(LTRIM(RTRIM(g.to_address)), '') IS NULL THEN 0 ELSE 1 END AS llamada,
           CAST(0 AS int) AS hablo, t.code
    INTO #cbtq
    FROM itr_thread t
    INNER JOIN #cb k ON k.contacto = t.contact
    INNER JOIN ph_e_user u ON u.code = t.e_user AND u.type = 1
    LEFT JOIN itr_global g ON g.code = t.itr_global
    WHERE t.start_time >= @desdeFichas AND t.start_time < @hastaToques
      AND t.origin = 2 AND t.start_time >= k.alta
    OPTION (RECOMPILE);

    UPDATE q SET hablo = 1 FROM #cbtq q
    WHERE q.llamada = 1 AND EXISTS (SELECT 1 FROM itr_segment sg WHERE sg.itr_thread = q.code AND sg.state = 6);

    -- Sesiones de guion de un agente sobre la ficha (también es tocarla)
    SELECT ss.contact, ss.start_time, ss.e_user
    INTO #cbss
    FROM script_session ss
    INNER JOIN #cb k ON k.contacto = ss.contact
    INNER JOIN ph_e_user u ON u.code = ss.e_user AND u.type = 1
    WHERE ss.start_time >= @desdeFichas AND ss.start_time < @hastaToques AND ss.start_time >= k.alta
    OPTION (RECOMPILE);

    SELECT k.servicio, k.campania, k.contacto, CONVERT(varchar(19), k.alta, 120) AS alta, k.abierta,
           CONVERT(varchar(19), p.inicio, 120) AS primerToque,
           RTRIM(u.usr_name) AS agente, RTRIM(u.fullname) AS nombreAgente,
           CONVERT(varchar(19), r.inicio, 120) AS primeraLlamada, ISNULL(r.hablo, 0) AS hablaron
    FROM #cb k
    OUTER APPLY (
        SELECT TOP 1 x.inicio, x.e_user
        FROM (SELECT start_time AS inicio, e_user FROM #cbtq WHERE contact = k.contacto
              UNION ALL
              SELECT start_time, e_user FROM #cbss WHERE contact = k.contacto) x
        ORDER BY x.inicio) p
    LEFT JOIN ph_e_user u ON u.code = p.e_user
    OUTER APPLY (
        SELECT MIN(start_time) AS inicio, MAX(hablo) AS hablo
        FROM #cbtq WHERE contact = k.contacto AND llamada = 1) r;

    -- Entrantes del periodo: una por itr_global (sin las salientes que pasan
    -- por el IVR, p. ej. a la encuesta)
    SELECT t.itr_global, MIN(t.start_time) AS ini,
           MAX(RIGHT(RTRIM(g.from_address), 9)) COLLATE DATABASE_DEFAULT AS numero,
           MAX(k.servicio) AS servicio,
           MAX(CASE WHEN k.ivr = 0 THEN k.nombre END) AS campania,
           MAX(CASE WHEN k.ivr = 0 AND t.termination_state = 1 AND u.type = 1 THEN 1 ELSE 0 END) AS atendida,
           MAX(CASE WHEN k.ivr = 0 AND t.termination_state IN (7, 9) THEN 1 ELSE 0 END) AS rechazo,
           MAX(CASE WHEN k.ivr = 0 AND t.termination_state = 6 THEN 1 ELSE 0 END) AS cola,
           MAX(CASE WHEN k.ivr = 0 THEN 1 ELSE 0 END) AS agentes,
           MIN(CASE WHEN k.ivr = 0 AND t.termination_state IN (7, 9) THEN t.start_time END) AS iniRechazo
    INTO #cbent
    FROM itr_thread t
    INNER JOIN #cbcamp k ON k.code = t.campaign
    INNER JOIN itr_global g ON g.code = t.itr_global
    LEFT JOIN ph_e_user u ON u.code = t.e_user
    WHERE t.start_time >= @desde AND t.start_time < @hastaExcl
    GROUP BY t.itr_global
    HAVING MAX(CASE WHEN t.origin = 1 THEN 1 ELSE 0 END) = 1 AND MAX(CASE WHEN t.origin = 2 THEN 1 ELSE 0 END) = 0
    OPTION (RECOMPILE);

    SELECT e.servicio, e.campania, x.categoria, x.conFicha, x.fichaPrevia, COUNT(*) AS n
    FROM #cbent e
    CROSS APPLY (
        SELECT CASE WHEN e.atendida = 1 THEN 'atendida' WHEN e.rechazo = 1 THEN 'rechazada'
                    WHEN e.cola = 1 THEN 'cola' WHEN e.agentes = 0 THEN 'ivr' ELSE 'otra' END AS categoria,
               -- Ficha creada en los 10 minutos siguientes, en su campaña y con su número
               CASE WHEN EXISTS (SELECT 1 FROM #cb k WHERE k.campania = e.campania AND k.numero = e.numero
                                   AND k.alta >= e.ini AND k.alta < DATEADD(MINUTE, 10, e.ini)) THEN 1 ELSE 0 END AS conFicha,
               -- El número ya tenía ficha de ese día (Altitude no crea otra)
               CASE WHEN EXISTS (SELECT 1 FROM #cb k WHERE k.campania = e.campania AND k.numero = e.numero
                                   AND k.alta < e.ini AND k.alta >= CAST(CAST(e.ini AS date) AS datetime)) THEN 1 ELSE 0 END AS fichaPrevia
    ) x
    GROUP BY e.servicio, e.campania, x.categoria, x.conFicha, x.fichaPrevia;

    -- Rechazadas o desbordadas (sin atender), para la alerta
    SELECT e.servicio, e.campania, CONVERT(varchar(19), e.iniRechazo, 120) AS inicio
    FROM #cbent e
    WHERE e.rechazo = 1 AND e.atendida = 0;
  `);
  const [fichas, entrantes, rechazadas] = r.recordsets as unknown as [FilaFicha[], FilaEntrantes[], RechazadaCallback[]];
  return {
    fichas: fichas.map(
      (f): FichaCallback => ({
        servicio: f.servicio,
        campania: f.campania,
        contacto: Number(f.contacto),
        alta: f.alta,
        abierta: f.abierta === 1,
        primerToque: f.primerToque,
        agente: f.agente,
        nombreAgente: f.nombreAgente,
        primeraLlamada: f.primeraLlamada,
        hablaron: f.hablaron === 1,
      }),
    ),
    entrantes: entrantes.map(
      (e): GrupoEntrantes => ({
        servicio: e.servicio,
        campania: e.campania,
        categoria: e.categoria,
        conFicha: e.conFicha === 1,
        fichaPrevia: e.fichaPrevia === 1,
        n: e.n,
      }),
    ),
    rechazadas,
  };
}

const vacia = (): BaseCallback => ({ fichas: [], entrantes: [], rechazadas: [] });

/** Callback de un rango de días cerrado o en curso (Histórico, Dirección). */
export async function baseCallbackRango(desdeISO: string, hastaISO: string, servicios: string[]): Promise<BaseCallback> {
  if (esMock() || servicios.length === 0) return vacia();
  const clave = `rdb:callback:${desdeISO}:${hastaISO}:${[...servicios].sort().join(",")}`;
  return conCache(clave, ttlSegunRango(hastaISO), () => callbackCore(desdeISO, hastaISO, servicios, 0));
}

/**
 * Callback de HOY (Tiempo real y alerta), con las fichas de los 7 días
 * anteriores para los pendientes de ahora. Caché de 60 s, como Supervisión.
 */
export async function baseCallbackHoy(servicios: string[]): Promise<BaseCallback> {
  if (esMock() || servicios.length === 0) return vacia();
  const hoy = hoyISO();
  const clave = `rdb:callback:hoy:${hoy}:${[...servicios].sort().join(",")}`;
  return conCache(clave, TTL.supervision, () => callbackCore(hoy, hoy, servicios, DIAS_PENDIENTES));
}

// ------------------------------------------------------------
// Diagnóstico para el ticket de «callback sin funcionar» (12/11/2026)
// ------------------------------------------------------------

export async function diagnosticoCallback(servicio: string): Promise<DiagnosticoCallback> {
  const alta = await codigoAltaAgente();
  const pool = await obtenerPool();
  const { desde: hoy, hastaExcl: manana } = limitesRango(hoyISO(), hoyISO());
  const hace7 = new Date(hoy);
  hace7.setDate(hace7.getDate() - 6);
  const hace30 = new Date(hoy);
  hace30.setDate(hace30.getDate() - 30);
  const ayer = new Date(Date.now() - 24 * 3600_000);
  const request = pool.request();
  request.input("hoy", sql.DateTime, hoy);
  request.input("manana", sql.DateTime, manana);
  request.input("hace7", sql.DateTime, hace7);
  request.input("hace30", sql.DateTime, hace30);
  request.input("hace24h", sql.DateTime, ayer);
  request.input("alta", sql.Int, alta);
  request.input("servicio", sql.VarChar(100), servicio);
  const r = await request.query(`-- callback: diagnóstico para el ticket «callback sin funcionar»
    IF OBJECT_ID('tempdb..#dgcamp') IS NOT NULL DROP TABLE #dgcamp;
    IF OBJECT_ID('tempdb..#dgcb') IS NOT NULL DROP TABLE #dgcb;
    IF OBJECT_ID('tempdb..#dgrech') IS NOT NULL DROP TABLE #dgrech;

    SELECT c.code, RTRIM(c.shortname) COLLATE DATABASE_DEFAULT AS nombre
    INTO #dgcamp
    FROM ph_campaign c
    INNER JOIN (SELECT campaign, MIN(service) AS service FROM cp_general_cfg GROUP BY campaign) cs ON cs.campaign = c.code
    INNER JOIN ph_service s ON s.code = cs.service
    WHERE s.name = @servicio AND c.shortname NOT LIKE 'IVR[_]%';

    -- Fichas de callback de 30 días (misma definición que el resto: sqlAltaCallback)
    SELECT h.event_moment AS alta, k.nombre AS campania, RTRIM(u.usr_name) AS usuario,
           RIGHT(RTRIM(a.resch_phone_value), 9) COLLATE DATABASE_DEFAULT AS numero
    INTO #dgcb
    FROM activity_history h
    INNER JOIN activity a ON a.code = h.activity
    INNER JOIN #dgcamp k ON k.code = a.campaign
    INNER JOIN ph_e_user u ON u.code = h.event_agent
    WHERE h.event_moment >= @hace30 AND h.event_moment < @manana
      AND ${sqlAltaCallback("h")};

    -- Rechazadas o desbordadas de 7 días en las campañas de agentes
    SELECT t.start_time AS inicio, k.nombre AS campania, t.itr_global AS global, t.termination_state AS estado,
           RIGHT(RTRIM(g.from_address), 9) COLLATE DATABASE_DEFAULT AS numero
    INTO #dgrech
    FROM itr_thread t
    INNER JOIN #dgcamp k ON k.code = t.campaign
    LEFT JOIN itr_global g ON g.code = t.itr_global
    WHERE t.start_time >= @hace7 AND t.start_time < @manana
      AND t.origin = 1 AND t.termination_state IN (7, 9)
    OPTION (RECOMPILE);

    SELECT CONVERT(varchar(19), r.inicio, 120) AS inicio, r.campania, r.global, RIGHT(r.numero, 3) AS finNumero, r.estado,
           CASE WHEN EXISTS (SELECT 1 FROM #dgcb k WHERE k.campania = r.campania AND k.numero = r.numero
                               AND k.alta >= r.inicio AND k.alta < DATEADD(MINUTE, 10, r.inicio)) THEN 1 ELSE 0 END AS conFicha
    FROM #dgrech r WHERE r.inicio >= @hoy ORDER BY r.inicio DESC;

    SELECT TOP 10 CONVERT(varchar(19), alta, 120) AS alta, campania, usuario FROM #dgcb ORDER BY alta DESC;

    SELECT campania, CONVERT(varchar(19), MAX(alta), 120) AS alta FROM #dgcb GROUP BY campania;

    SELECT d.fecha, ISNULL(r.n, 0) AS rechazadas, ISNULL(f.n, 0) AS fichas
    FROM (SELECT DISTINCT CONVERT(varchar(10), inicio, 23) AS fecha FROM #dgrech
          UNION SELECT CONVERT(varchar(10), alta, 23) FROM #dgcb WHERE alta >= @hace7) d
    LEFT JOIN (SELECT CONVERT(varchar(10), inicio, 23) AS fecha, COUNT(*) AS n FROM #dgrech GROUP BY CONVERT(varchar(10), inicio, 23)) r ON r.fecha = d.fecha
    LEFT JOIN (SELECT CONVERT(varchar(10), alta, 23) AS fecha, COUNT(*) AS n FROM #dgcb WHERE alta >= @hace7 GROUP BY CONVERT(varchar(10), alta, 23)) f ON f.fecha = d.fecha
    ORDER BY d.fecha;

    -- Agentes con sesión abierta ahora (op_type 0 sin cerrar) y en Ready (op_type 1 sin cerrar)
    SELECT COUNT(DISTINCT CASE WHEN l.op_type = 0 THEN l.agent END) AS conectados,
           COUNT(DISTINCT CASE WHEN l.op_type = 1 THEN l.agent END) AS ready
    FROM ag_in_cp_log l
    INNER JOIN #dgcamp k ON k.code = l.campaign
    INNER JOIN ph_e_user u ON u.code = l.agent AND u.type = 1
    WHERE l.start_time >= @hoy AND l.start_time < @manana AND l.duration IS NULL AND l.op_type IN (0, 1);

    -- Frescura de la réplica
    SELECT (SELECT CONVERT(varchar(19), MAX(start_time), 120) FROM itr_thread WHERE start_time >= @hace24h) AS ultimoHilo,
           (SELECT CONVERT(varchar(19), MAX(event_moment), 120) FROM activity_history WHERE event_moment >= @hace24h) AS ultimoEventoContacto;
  `);
  const [rech, ultimas, porCamp, dias, agentes, frescura] = r.recordsets as unknown as [
    { inicio: string; campania: string; global: number; finNumero: string | null; estado: number; conFicha: number }[],
    { alta: string; campania: string; usuario: string }[],
    { campania: string; alta: string }[],
    { fecha: string; rechazadas: number; fichas: number }[],
    { conectados: number; ready: number }[],
    { ultimoHilo: string | null; ultimoEventoContacto: string | null }[],
  ];
  return {
    rechazadasHoy: rech.map((x) => ({ ...x, global: Number(x.global), conFicha: x.conFicha === 1 })),
    ultimasFichas: ultimas,
    ultimaFichaCampania: Object.fromEntries(porCamp.map((x) => [x.campania, x.alta])),
    porDia: dias,
    agentesConectados: agentes[0]?.conectados ?? 0,
    agentesReady: agentes[0]?.ready ?? 0,
    ultimoHilo: frescura[0]?.ultimoHilo ?? null,
    ultimoEventoContacto: frescura[0]?.ultimoEventoContacto ?? null,
  };
}

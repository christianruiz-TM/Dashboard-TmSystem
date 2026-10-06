import { conCache, TTL, ttlSegunRango } from "../cache";
import {
  mockCierresPorDia,
  mockDemandaPorFranja,
  mockEntrantesNoAtendidasHoy,
  mockEstadoListas,
  mockFestivosServicio,
  mockHorariosServicio,
  mockIslasLogadoUsuario,
  mockIslasSesionUsuario,
  mockUsuariosAgente,
} from "../mock";
import { esMock, obtenerPool, sql } from "../pool";
import type {
  CierresDia,
  DemandaFranja,
  EntrantesNoAtendidas,
  EstadoLista,
  FestivosServicio,
  HorarioServicio,
  IslaSesion,
  UsuarioAgenteRdb,
} from "../types";
import { hoyISO } from "@/lib/fechas";
import { sqlCtesIslas, sqlFinIntervalo } from "./islas";
import { claveCampanias, filtroCampanias, limitesRango } from "./util";

// ============================================================
// Capa RDBv2 del módulo «Planificación de turnos».
//
// Todo va parametrizado, con rango de fechas explícito sobre la columna
// indexada y con las décimas de segundo convertidas dentro del SQL. Se
// excluyen las campañas Test_* e IVR_*. El SQL Server es anterior a 2017:
// nada de STRING_AGG.
//
// Estas consultas NO las usa el tablero en caliente: alimentan los agregados
// propios de SQLite (scripts/planificacion-agregados.ts), que son los que lee
// el motor.
// ============================================================

/** Filtro común: fuera las campañas de pruebas y las IVR (automáticas). */
const SIN_TEST_NI_IVR = `c.shortname NOT LIKE 'IVR[_]%' AND c.shortname NOT LIKE 'Test[_]%'`;

/**
 * Usuarios humanos con nº de agente: <PREFIJO>_<nnnn>[_SUFIJO] (GH_0851,
 * GH_1067_BD_LX, Soc_Fed_0892...). El parseo prefijo/nº/sufijo va en TS
 * (planificacion/usuarios.ts). Los usuarios sin nº (Angeles, TM_*...) quedan
 * fuera. La última sesión NO se pide aquí: una subconsulta por usuario sobre
 * ag_in_cp_log tardó 66 s (medido 30/09/2026); sale de agg_sesion_usuario.
 */
export async function usuariosAgente(): Promise<UsuarioAgenteRdb[]> {
  if (esMock()) return mockUsuariosAgente();
  return conCache("rdb:plan:usuarios", TTL.maestros, async () => {
    const pool = await obtenerPool();
    const r = await pool.request().query(`
      SELECT RTRIM(u.usr_name) AS usrName, u.code AS altitudeCode, RTRIM(u.fullname) AS fullname
      FROM ph_e_user u
      WHERE u.type = 1
        AND u.usr_name LIKE '%[_][0-9][0-9][0-9][0-9]%'
      ORDER BY u.usr_name;
    `);
    return r.recordset as UsuarioAgenteRdb[];
  });
}

/**
 * Islas de sesión (op_type 0) por USUARIO: la unión de sus intervalos, igual
 * que horasAgenteReales pero partiendo por usuario en vez de sumar. Como cada
 * agente tiene un usuario por cliente, esto da horas por cliente sin el ×13
 * de sumar por campaña (regla 11). Duración NULL = sesión abierta, cerrada en
 * GETDATE() acotado al rango (regla 10.b).
 *
 * Cada isla se parte en trozos de un día (segundos desde las 00:00). Las
 * partes que caen fuera del rango pedido se descartan: el lote siguiente no
 * las verá, porque filtra por start_time (mismo criterio que
 * horasAgenteReales). En esta instalación no hay sesiones que crucen la
 * medianoche.
 *
 * Los segundos salen del SQL con DATEDIFF(SECOND, 00:00, x), así que
 * fin − inicio es exactamente DATEDIFF(SECOND, ini, fin): la suma de un día
 * cuadra al segundo con horasAgenteReales.
 */
export async function islasSesionUsuario(
  desdeISO: string,
  hastaISO: string,
  usuarios?: string[],
): Promise<IslaSesion[]> {
  if (esMock()) return mockIslasSesionUsuario(desdeISO, hastaISO, usuarios);
  const claveCache = `rdb:plan:islas:${desdeISO}:${hastaISO}:${claveCampanias(usuarios)}`;
  return conCache(claveCache, ttlSegunRango(hastaISO), async () => {
    const pool = await obtenerPool();
    const request = pool.request();
    const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
    request.input("desde", sql.DateTime, desde);
    request.input("hastaExcl", sql.DateTime, hastaExcl);
    let filtroUsuarios = "";
    if (usuarios && usuarios.length > 0) {
      const marcadores = usuarios.map((u, i) => {
        request.input(`usr${i}`, sql.VarChar(50), u);
        return `@usr${i}`;
      });
      filtroUsuarios = ` AND u.usr_name IN (${marcadores.join(", ")})`;
    }

    const r = await request.query(`
      -- Unión de intervalos de sesión (op_type 0) por usuario
      WITH base AS (
          SELECT l.agent AS agente, l.start_time AS ini,
                 ${sqlFinIntervalo("l")} AS fin
          FROM ag_in_cp_log l
          INNER JOIN ph_e_user   u ON l.agent = u.code AND u.type = 1
          INNER JOIN ph_campaign c ON l.campaign = c.code
          WHERE l.op_type = 0
            AND l.start_time >= @desde AND l.start_time < @hastaExcl${filtroUsuarios}
      ),
      ${sqlCtesIslas("agente")}
      SELECT RTRIM(u.usr_name)                                                AS usrName,
             CONVERT(varchar(10), i.ini, 23)                                  AS fechaIni,
             DATEDIFF(SECOND, CAST(CAST(i.ini AS date) AS datetime), i.ini)   AS iniSeg,
             CONVERT(varchar(10), i.fin, 23)                                  AS fechaFin,
             DATEDIFF(SECOND, CAST(CAST(i.fin AS date) AS datetime), i.fin)   AS finSeg
      FROM islas i
      INNER JOIN ph_e_user u ON u.code = i.agente
      ORDER BY usrName, i.ini;
    `);

    return partirPorDia(r.recordset as FilaIsla[], hastaISO);
  });
}

type FilaIsla = { usrName: string; fechaIni: string; iniSeg: number; fechaFin: string; finSeg: number };

/**
 * Islas con fecha y segundos de inicio y fin → trozos por día. Si una isla
 * cruza la medianoche, un trozo hasta las 24:00 y otro desde las 00:00 del
 * día del fin (una sesión nunca dura más de un día entero).
 */
function partirPorDia(filas: readonly FilaIsla[], hastaISO: string): IslaSesion[] {
  const partes: IslaSesion[] = [];
  for (const f of filas) {
    if (f.fechaIni === f.fechaFin) {
      if (f.finSeg > f.iniSeg) partes.push({ fecha: f.fechaIni, usrName: f.usrName, inicioSeg: f.iniSeg, finSeg: f.finSeg });
      continue;
    }
    if (f.iniSeg < 86_400) partes.push({ fecha: f.fechaIni, usrName: f.usrName, inicioSeg: f.iniSeg, finSeg: 86_400 });
    if (f.finSeg > 0 && f.fechaFin <= hastaISO) {
      partes.push({ fecha: f.fechaFin, usrName: f.usrName, inicioSeg: 0, finSeg: f.finSeg });
    }
  }
  return partes;
}

/**
 * Tiempo LOGADO por usuario y día: unión de sus sesiones de `user_log`
 * (login → logout), haya o no campaña abierta. Es la fuente del seguimiento
 * (adherencia, saldo y cierre de mes) y la misma que factura operaciones
 * (regla 16): agg_sesion_usuario (ag_in_cp_log op 0) solo ve el tiempo con
 * campaña abierta. Solo agentes humanos (type 1: los puertos IVR dejan
 * sesiones sin cerrar durante semanas). duration NULL = sesión de hoy en
 * curso, cerrada en GETDATE() sin salirse del rango (regla 10.b). Con hoy
 * dentro, cache de 60 s (vista «Hoy» y alertas); días cerrados, ttlSegunRango.
 */
export async function islasLogadoUsuario(
  desdeISO: string,
  hastaISO: string,
  usuarios?: string[],
): Promise<IslaSesion[]> {
  if (esMock()) return mockIslasLogadoUsuario(desdeISO, hastaISO, usuarios);
  const ttl = hastaISO >= hoyISO() ? TTL.supervision : ttlSegunRango(hastaISO);
  const claveCache = `rdb:plan:logado:${desdeISO}:${hastaISO}:${claveCampanias(usuarios)}`;
  return conCache(claveCache, ttl, async () => {
    const pool = await obtenerPool();
    const request = pool.request();
    const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
    request.input("desde", sql.DateTime, desde);
    request.input("hastaExcl", sql.DateTime, hastaExcl);
    let filtroUsuarios = "";
    if (usuarios && usuarios.length > 0) {
      const marcadores = usuarios.map((u, i) => {
        request.input(`usr${i}`, sql.VarChar(50), u);
        return `@usr${i}`;
      });
      filtroUsuarios = ` AND u.usr_name IN (${marcadores.join(", ")})`;
    }

    const r = await request.query(`
      -- Unión de las sesiones de user_log por usuario (duration en DÉCIMAS de segundo)
      WITH base AS (
          SELECT l.e_user AS usuario, l.start_time AS ini,
                 ${sqlFinIntervalo("l")} AS fin
          FROM user_log l
          INNER JOIN ph_e_user u ON u.code = l.e_user AND u.type = 1
          WHERE l.start_time >= @desde AND l.start_time < @hastaExcl${filtroUsuarios}
      ),
      ${sqlCtesIslas("usuario")}
      SELECT RTRIM(u.usr_name)                                                AS usrName,
             CONVERT(varchar(10), i.ini, 23)                                  AS fechaIni,
             DATEDIFF(SECOND, CAST(CAST(i.ini AS date) AS datetime), i.ini)   AS iniSeg,
             CONVERT(varchar(10), i.fin, 23)                                  AS fechaFin,
             DATEDIFF(SECOND, CAST(CAST(i.fin AS date) AS datetime), i.fin)   AS finSeg
      FROM islas i
      INNER JOIN ph_e_user u ON u.code = i.usuario
      ORDER BY usrName, i.ini;
    `);
    return partirPorDia(r.recordset as FilaIsla[], hastaISO);
  });
}

/**
 * Demanda por servicio y franja de 30 min (generaliza h1.sql del prototipo).
 * Entrantes = hilos origin 1 (todas las terminaciones); rechazadas =
 * termination_state 7 (la llamada no encontró a nadie logado). La gestión de
 * entrantes se suma en SEGUNDOS (décimas / 10.0) solo de humanos y sin los
 * hilos de `maxSeg` o más (CEFF tiene duraciones imposibles).
 */
export async function demandaPorFranja(
  desdeISO: string,
  hastaISO: string,
  maxSeg: number,
): Promise<DemandaFranja[]> {
  if (esMock()) return mockDemandaPorFranja(desdeISO, hastaISO);
  const claveCache = `rdb:plan:demanda:${desdeISO}:${hastaISO}:${maxSeg}`;
  return conCache(claveCache, ttlSegunRango(hastaISO), async () => {
    const pool = await obtenerPool();
    const request = pool.request();
    const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
    request.input("desde", sql.DateTime, desde);
    request.input("hastaExcl", sql.DateTime, hastaExcl);
    request.input("maxSeg", sql.Int, maxSeg);

    const r = await request.query(`
      -- Un único servicio por campaña (cp_general_cfg es 1:N)
      WITH cs AS (
          SELECT campaign, MIN(service) AS service
          FROM cp_general_cfg
          GROUP BY campaign
      ),
      hilos AS (
          SELECT CONVERT(varchar(10), t.start_time, 23) AS fecha,
                 RTRIM(s.name) AS servicio,
                 DATEPART(HOUR, t.start_time) * 60 + (DATEPART(MINUTE, t.start_time) / 30) * 30 AS inicioMin,
                 t.origin, t.termination_state, t.duration, u.type AS tipoUsuario
          FROM itr_thread t
          INNER JOIN ph_campaign c  ON t.campaign = c.code
          INNER JOIN cs             ON cs.campaign = c.code
          INNER JOIN ph_service  s  ON s.code = cs.service
          LEFT  JOIN ph_e_user   u  ON u.code = t.e_user
          WHERE t.start_time >= @desde AND t.start_time < @hastaExcl
            AND ${SIN_TEST_NI_IVR}
            AND s.name NOT LIKE 'Test[_]%'
      )
      SELECT fecha, servicio, inicioMin,
             SUM(CASE WHEN origin = 1 THEN 1 ELSE 0 END)                                AS entrantes,
             SUM(CASE WHEN origin = 1 AND termination_state = 1 THEN 1 ELSE 0 END)      AS entrantesAtendidas,
             SUM(CASE WHEN origin = 1 AND termination_state = 6 THEN 1 ELSE 0 END)      AS entrantesAbandonadas,
             SUM(CASE WHEN origin = 1 AND termination_state = 7 THEN 1 ELSE 0 END)      AS entrantesRechazadas,
             SUM(CASE WHEN origin = 2 THEN 1 ELSE 0 END)                                AS salientes,
             SUM(CASE WHEN origin = 2 AND termination_state = 1 THEN 1 ELSE 0 END)      AS salientesAtendidas,
             -- décimas → segundos; CAST a BIGINT para no desbordar al sumar
             SUM(CASE WHEN origin = 1 AND termination_state = 1 AND tipoUsuario = 1
                           AND duration < @maxSeg * 10
                      THEN CAST(duration AS BIGINT) ELSE 0 END) / 10.0                  AS segGestionEntrantes
      FROM hilos
      GROUP BY fecha, servicio, inicioMin;
    `);
    return r.recordset as DemandaFranja[];
  });
}

/**
 * Contactos que dejan de estar vivos (activity.status fuera de 0/1/2),
 * fechados por su ÚLTIMO event_moment. Mismo patrón que los leads de
 * facturacion.ts (regla 13): MAX por actividad dentro del rango y comparación
 * con el MAX absoluto, nunca NOT EXISTS sobre lo posterior al rango (40 s
 * frente a 0,2 s). Como mira el estado ACTUAL, un contacto reabierto después
 * deja de contar en su día antiguo.
 */
export async function cierresPorDia(
  desdeISO: string,
  hastaISO: string,
  campanias?: string[],
): Promise<CierresDia[]> {
  if (esMock()) return mockCierresPorDia(desdeISO, hastaISO, campanias);
  const claveCache = `rdb:plan:cierres:${desdeISO}:${hastaISO}:${claveCampanias(campanias)}`;
  return conCache(claveCache, ttlSegunRango(hastaISO), async () => {
    const pool = await obtenerPool();
    const request = pool.request();
    const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
    request.input("desde", sql.DateTime, desde);
    request.input("hastaExcl", sql.DateTime, hastaExcl);
    const filtro = filtroCampanias(request, campanias, "c.shortname");

    const r = await request.query(`
      WITH ult AS (
          SELECT h.activity, MAX(h.event_moment) AS cierre
          FROM activity_history h
          WHERE h.event_moment >= @desde AND h.event_moment < @hastaExcl
          GROUP BY h.activity
      )
      SELECT CONVERT(varchar(10), ult.cierre, 23) AS fecha,
             RTRIM(c.shortname)                   AS campania,
             COUNT(*)                             AS cierres
      FROM ult
      INNER JOIN activity    a ON a.code = ult.activity AND a.status NOT IN (0, 1, 2)
      INNER JOIN ph_campaign c ON a.campaign = c.code
      WHERE ult.cierre = (
          SELECT MAX(h3.event_moment)
          FROM activity_history h3
          WHERE h3.activity = ult.activity
      )
        AND ${SIN_TEST_NI_IVR}${filtro}
      GROUP BY CONVERT(varchar(10), ult.cierre, 23), RTRIM(c.shortname);
    `);
    return r.recordset as CierresDia[];
  });
}

/**
 * Estado ACTUAL de las listas salientes cuyas campañas casan con alguno de
 * los patrones LIKE (los de plan_clientes.campanias). Vivos = status 0/1/2
 * (por llamar o reprogramados); sin tocar = además business_status 1.
 * activity no tiene fecha útil (moment es la programada): el filtro que acota
 * es el de campaña. Sin cache: es la foto nocturna.
 */
export async function estadoListas(patrones: string[]): Promise<EstadoLista[]> {
  if (patrones.length === 0) return [];
  if (esMock()) return mockEstadoListas(patrones);
  const pool = await obtenerPool();
  const request = pool.request();
  const condiciones = patrones.map((p, i) => {
    request.input(`pat${i}`, sql.VarChar(50), p);
    return `c.shortname LIKE @pat${i}`;
  });
  const r = await request.query(`
    SELECT RTRIM(c.shortname)                                                   AS campania,
           COUNT(*)                                                             AS total,
           SUM(CASE WHEN a.status IN (0, 1, 2) THEN 1 ELSE 0 END)               AS vivos,
           SUM(CASE WHEN a.status IN (0, 1, 2) AND a.business_status = 1
                    THEN 1 ELSE 0 END)                                          AS vivosSinTocar
    FROM activity a
    INNER JOIN ph_campaign c ON c.code = a.campaign
    WHERE (${condiciones.join(" OR ")})
      AND ${SIN_TEST_NI_IVR}
    GROUP BY RTRIM(c.shortname)
    ORDER BY campania;
  `);
  return r.recordset as EstadoLista[];
}

/**
 * festivos_servicio (tabla propia que mantiene supervisión) en el rango, y la
 * última fecha cargada por servicio para avisar cuando el mes planificado se
 * sale de su vigencia. Verificado 30/09/2026: TipoDia solo vale 'FESTIVO' y
 * ServicioDirectorio es 'GrupoHuertas' (= ph_service.name) y 'GrupoAvolo'
 * (en ph_service es 'Avolo'): cada cliente guarda su nombre de calendario.
 */
export async function festivosServicio(desdeISO: string, hastaISO: string): Promise<FestivosServicio> {
  if (esMock()) return mockFestivosServicio(desdeISO, hastaISO);
  return conCache(`rdb:plan:festivos:${desdeISO}:${hastaISO}`, TTL.maestros, async () => {
    const pool = await obtenerPool();
    const request = pool.request();
    const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);
    request.input("desde", sql.DateTime, desde);
    request.input("hastaExcl", sql.DateTime, hastaExcl);
    const r = await request.query(`
      SELECT CONVERT(varchar(10), Fecha, 23) AS fecha,
             RTRIM(ServicioDirectorio)       AS servicio,
             RTRIM(TipoDia)                  AS tipo
      FROM festivos_servicio
      WHERE Fecha >= @desde AND Fecha < @hastaExcl
      ORDER BY Fecha, ServicioDirectorio;

      SELECT RTRIM(ServicioDirectorio) AS servicio, CONVERT(varchar(10), MAX(Fecha), 23) AS ultima
      FROM festivos_servicio
      GROUP BY ServicioDirectorio;
    `);
    const recordsets = r.recordsets as unknown as [
      FestivosServicio["festivos"],
      { servicio: string; ultima: string }[],
    ];
    return {
      festivos: recordsets[0],
      ultimaFechaPorServicio: Object.fromEntries(recordsets[1].map((f) => [f.servicio, f.ultima])),
    };
  });
}

/**
 * horarios_servicio (tabla propia): tramos de atención por servicio y día de
 * la semana, con su vigencia. Las horas se convierten a texto HH:MM en el SQL
 * para no pasar por fechas del driver.
 */
export async function horariosServicio(): Promise<HorarioServicio[]> {
  if (esMock()) return mockHorariosServicio();
  return conCache("rdb:plan:horarios", TTL.maestros, async () => {
    const pool = await obtenerPool();
    const r = await pool.request().query(`
      SELECT RTRIM(Servicio) AS servicio,
             CAST(Lunes AS int) AS l, CAST(Martes AS int) AS m, CAST(Miercoles AS int) AS x,
             CAST(Jueves AS int) AS j, CAST(Viernes AS int) AS v, CAST(Sabado AS int) AS s,
             CAST(Domingo AS int) AS d,
             CONVERT(varchar(5), Entrada, 108) AS entrada,
             CONVERT(varchar(5), Salida, 108)  AS salida,
             CONVERT(varchar(10), Desde, 23)   AS desde,
             CONVERT(varchar(10), Hasta, 23)   AS hasta
      FROM horarios_servicio
      ORDER BY Servicio, Desde, Entrada;
    `);
    type Fila = {
      servicio: string; l: number; m: number; x: number; j: number; v: number; s: number; d: number;
      entrada: string; salida: string; desde: string; hasta: string;
    };
    const aMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
    return (r.recordset as Fila[]).map((f) => ({
      servicio: f.servicio,
      dias: [f.l, f.m, f.x, f.j, f.v, f.s, f.d].map((b) => b === 1),
      entradaMin: aMin(f.entrada),
      salidaMin: aMin(f.salida),
      desde: f.desde,
      hasta: f.hasta,
    }));
  });
}

/**
 * Entrantes de HOY (origin 1) que no atendió nadie en las campañas dadas. Es
 * la alerta de los clientes «a demanda» (Ávolo): alguien con su usuario debe
 * logarse cuando hay una entrante pendiente. Cache de 60 s, como Supervisión.
 */
export async function entrantesNoAtendidasHoy(campanias: string[]): Promise<EntrantesNoAtendidas> {
  // Sin campañas no hay nada que vigilar (y el filtro vacío lo abriría a todas)
  if (campanias.length === 0) {
    return { noAtendidas: 0, primera: null, ultima: null, ultimaAtendida: null };
  }
  if (esMock()) return mockEntrantesNoAtendidasHoy(campanias);
  return conCache(`rdb:plan:noAtendidas:${claveCampanias(campanias)}`, TTL.supervision, async () => {
    const pool = await obtenerPool();
    const request = pool.request();
    const { desde, hastaExcl } = limitesRango(hoyISO(), hoyISO());
    request.input("desde", sql.DateTime, desde);
    request.input("hastaExcl", sql.DateTime, hastaExcl);
    const filtro = filtroCampanias(request, campanias, "c.shortname");
    const r = await request.query(`
      SELECT
          SUM(CASE WHEN t.termination_state <> 1 THEN 1 ELSE 0 END)                  AS noAtendidas,
          CONVERT(varchar(5), MIN(CASE WHEN t.termination_state <> 1 THEN t.start_time END), 108) AS primera,
          CONVERT(varchar(5), MAX(CASE WHEN t.termination_state <> 1 THEN t.start_time END), 108) AS ultima,
          CONVERT(varchar(5), MAX(CASE WHEN t.termination_state = 1 THEN t.start_time END), 108)  AS ultimaAtendida
      FROM itr_thread t
      INNER JOIN ph_campaign c ON t.campaign = c.code
      WHERE t.start_time >= @desde AND t.start_time < @hastaExcl
        AND t.origin = 1${filtro};
    `);
    const f = r.recordset[0] as EntrantesNoAtendidas;
    return { ...f, noAtendidas: f.noAtendidas ?? 0 };
  });
}
